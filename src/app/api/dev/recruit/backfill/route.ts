import { NextResponse, type NextRequest } from "next/server";
import { fetchFirestoreCollection, resolveFirestoreProjectId } from "@/lib/recruit/firestore";
import { ingestJobApplication } from "@/lib/recruit/ingest";
import type { RecruitSource } from "@/lib/recruit/payload";

/**
 * 기존 지원서 일괄 수신 (2026-09-09) — **로컬 전용, 일회성**.
 *
 * 채용 사이트가 StayOps 로 보내기 시작하는 것은 지원서가 **새로 들어올 때**부터다. 그 전에 이미
 * 쌓여 있던 지원서를 옮기기 위한 경로다.
 *
 * 수신은 `ingestJobApplication` 을 그대로 쓴다 — 웹훅과 같은 코드다. 백필이 자기만의 변환을 갖게
 * 두면 두 경로가 어긋난다(이 저장소가 반복해서 당한 실패 모드).
 *
 * **Firestore 를 인증 없이 읽는다.** 채용 사이트 어드민이 Firebase Auth 없이 클라이언트에서 직접
 * 읽고 있어(비밀번호는 번들 안 상수), 규칙이 공개 읽기를 허용하고 있기 때문이다. 이 상태 자체가
 * 개인정보 노출이라 백필 직후 규칙을 잠가야 하고, 잠그면 이 경로도 동작하지 않는다 — 그래도 된다.
 *
 * 실행:
 *   ENABLE_LOCAL_DEV_TOOLS=true RECRUIT_FIRESTORE_API_KEY=... npm run dev
 *   curl -X POST 'http://localhost:3000/api/dev/recruit/backfill'
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COLLECTIONS: readonly RecruitSource[] = ["applications", "applicants"];

function ensureDevOnly(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "true") {
    console.warn("[dev/recruit-backfill] gate not enabled");
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const host = request.nextUrl.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.warn(`[dev/recruit-backfill] blocked non-local host: ${host}`);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const blocked = ensureDevOnly(request);
  if (blocked) return blocked;

  // 읽기 자체는 `src/lib/recruit/firestore.ts` 가 한다 — 주기 동기화(`/api/recruit/sync`)와 **같은
  // 코드**다. 공개 읽기 규칙이라 API 키는 없어도 되고, 있으면 붙는다.
  const projectId = resolveFirestoreProjectId();
  const apiKey = process.env.RECRUIT_FIRESTORE_API_KEY?.trim() || null;

  const summary: Record<string, unknown> = {};
  let created = 0;
  let updated = 0;
  const failed: { source: string; docId: string; error: string }[] = [];

  for (const collection of COLLECTIONS) {
    let docs: { docId: string; document: Record<string, unknown> }[];
    try {
      docs = await fetchFirestoreCollection({ projectId, apiKey, collection });
    } catch (error) {
      // 구 컬렉션이 아예 없을 수 있다. 한쪽이 없다고 전체를 멈추지 않는다.
      console.warn(`[dev/recruit-backfill] ${collection} skipped:`, error);
      summary[collection] = { read: 0, skipped: String(error) };
      continue;
    }

    let collectionCreated = 0;
    let collectionUpdated = 0;
    // 지워진 지원서는 되살리지 않는다 — 백필도 같은 규칙을 탄다.
    let collectionSkipped = 0;
    for (const doc of docs) {
      const result = await ingestJobApplication({
        source: collection,
        externalId: doc.docId,
        document: doc.document,
      });
      if (result.ok) {
        if ("skipped" in result) collectionSkipped += 1;
        else if (result.created) collectionCreated += 1;
        else collectionUpdated += 1;
      } else {
        failed.push({ source: collection, docId: doc.docId, error: result.error });
      }
    }
    created += collectionCreated;
    updated += collectionUpdated;
    summary[collection] = {
      read: docs.length,
      created: collectionCreated,
      updated: collectionUpdated,
      skippedDeleted: collectionSkipped,
    };
  }

  return NextResponse.json({ ok: failed.length === 0, created, updated, failed, summary });
}
