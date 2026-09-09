import { NextResponse, type NextRequest } from "next/server";
import { fetchFirestoreCollection, type FirestoreRecord } from "@/lib/recruit/firestore";
import { ingestJobApplication } from "@/lib/recruit/ingest";
import type { RecruitSource } from "@/lib/recruit/payload";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

/**
 * 채용 지원서 당겨오기 (2026-09-09).
 *
 * **왜 push 가 아니라 pull 인가.** 문서는 채용 사이트에 `onApplicationCreated` Cloud Function 이
 * 이미 돌고 있다고 적어 두었지만, 저장소를 확인하니 **함수가 존재하지 않는다**(`functions/` 없음,
 * `firebase.json` 은 hosting 만). 지원서는 브라우저가 Firestore 에 직접 쓴다
 * (`ApplicationPage.tsx` → `addDoc`). 함수를 새로 만들려면 Firebase Blaze(카드 등록)가 필요해
 * 「무료」 조건과 충돌한다. 그래서 StayOps 가 당겨온다.
 *
 * 변환은 `ingestJobApplication` 을 그대로 쓴다 — 웹훅·백필과 **같은 코드**다. 나중에 Cloud Function
 * 을 붙여도 재전송이 안전하므로(유니크 + 지원자 정보만 갱신) 두 경로가 겹쳐도 중복이 생기지 않는다.
 *
 * **시크릿이 없다.** 이 경로는 외부 입력을 받지 않는다 — 하는 일이 「공개 Firestore 를 읽어 우리
 * DB 에 넣는다」로 고정이라 호출자가 데이터를 위조할 수 없다. 남는 위험은 남용(Firestore 무료 읽기
 * 한도 소진)이고, `recruit_sync_state` 의 마지막 실행 시각으로 창을 두어 막는다. 창 안의 재호출은
 * **Firestore 를 읽지 않고** 돌아간다.
 *
 * 모드:
 *   POST /api/recruit/sync           최신분만 (기본, 5분 주기 · 콘솔 열 때)
 *   POST /api/recruit/sync?mode=full 전량 훑기 (하루 1회) — 정렬 조회에서 빠지는 구 문서까지 줍는다
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 최신분 조회에서 한 번에 볼 문서 수. 지원은 하루 한 자릿수라 넉넉하다. */
const RECENT_LIMIT = 50;

/**
 * 이 창 안의 재호출은 Firestore 를 읽지 않는다.
 *
 * 5분 주기 크론(300초)보다 짧아야 크론이 헛돌지 않고, 콘솔을 여러 명이 동시에 열어도 읽기가
 * 폭주하지 않을 만큼은 길어야 한다.
 */
const THROTTLE_SECONDS = 60;

type SyncSummary = {
  mode: "recent" | "full";
  created: number;
  updated: number;
  read: number;
  failed: { source: string; docId: string; error: string }[];
};

/** 구 폼 컬렉션. 새로 들어오지 않으므로 전량 훑기에서만 본다. */
const LEGACY_SOURCE: RecruitSource = "applicants";

async function readState() {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recruit_sync_state")
    .select("last_run_at")
    .eq("id", true)
    .maybeSingle();
  // 읽기 실패는 「스로틀 없음」으로 흘러가므로 조용하면 안 된다. 처음 배포에서 grant 누락으로
  // 이 자리가 계속 실패했고, 오류를 삼키고 있어 스로틀이 안 걸리는 것을 늦게 알아챘다.
  if (error) console.warn("[recruit/sync] state read failed:", error.message);
  return data?.last_run_at ?? null;
}

async function writeState(args: { ok: boolean; result: Json }) {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  // 기록 실패가 동기화 자체를 실패로 만들지 않는다. 본래 일은 이미 끝났다.
  const { error } = await supabase.from("recruit_sync_state").upsert({
    id: true,
    last_run_at: now,
    ...(args.ok ? { last_success_at: now } : {}),
    last_result: args.result,
    updated_at: now,
  });
  if (error) console.warn("[recruit/sync] state write failed:", error.message);
}

async function ingestAll(records: FirestoreRecord[], source: RecruitSource, summary: SyncSummary) {
  for (const record of records) {
    const result = await ingestJobApplication({
      source,
      externalId: record.docId,
      document: record.document,
    });
    if (result.ok) {
      if (result.created) summary.created += 1;
      else summary.updated += 1;
    } else {
      summary.failed.push({ source, docId: record.docId, error: result.error });
    }
  }
}

export async function POST(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") === "full" ? "full" : "recent";
  const apiKey = process.env.RECRUIT_FIRESTORE_API_KEY?.trim() || null;

  const lastRunAt = await readState();
  if (lastRunAt) {
    const elapsed = (Date.now() - new Date(lastRunAt).getTime()) / 1000;
    // 전량 훑기는 하루 1회라 창을 적용하지 않는다 — 최신분 호출에 밀려 영원히 건너뛰면 안 된다.
    if (mode === "recent" && elapsed < THROTTLE_SECONDS) {
      return NextResponse.json({ ok: true, skipped: "throttled", elapsedSeconds: Math.round(elapsed) });
    }
  }

  const summary: SyncSummary = { mode, created: 0, updated: 0, read: 0, failed: [] };

  try {
    if (mode === "full") {
      // 정렬 없이 전량. `createdAt` 이 없는 구 문서까지 잡으려면 정렬을 걸면 안 된다.
      const current = await fetchFirestoreCollection({ collection: "applications", apiKey });
      summary.read += current.length;
      await ingestAll(current, "applications", summary);

      try {
        const legacy = await fetchFirestoreCollection({ collection: LEGACY_SOURCE, apiKey });
        summary.read += legacy.length;
        await ingestAll(legacy, LEGACY_SOURCE, summary);
      } catch (error) {
        // 구 컬렉션이 사라졌을 수 있다. 한쪽이 없다고 전체를 실패로 만들지 않는다.
        console.warn("[recruit/sync] legacy collection skipped:", error);
      }
    } else {
      const recent = await fetchFirestoreCollection({
        collection: "applications",
        apiKey,
        orderBy: "createdAt desc",
        limit: RECENT_LIMIT,
      });
      summary.read += recent.length;
      await ingestAll(recent, "applications", summary);
    }
  } catch (error) {
    // Firestore 를 못 읽었다. 규칙이 잠겼거나 프로젝트가 바뀐 경우다. **조용히 넘기지 않는다** —
    // 502 를 돌려줘야 크론이 빨간불이 되고, 「어제부터 지원서가 안 들어온다」를 사람이 알게 된다.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[recruit/sync] firestore read failed:", message);
    await writeState({ ok: false, result: { mode, error: message } });
    return NextResponse.json({ ok: false, error: "firestore_read_failed", detail: message }, { status: 502 });
  }

  await writeState({ ok: summary.failed.length === 0, result: summary as unknown as Json });

  return NextResponse.json({ ok: summary.failed.length === 0, ...summary });
}
