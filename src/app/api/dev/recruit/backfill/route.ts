import { NextResponse, type NextRequest } from "next/server";
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

/**
 * Firestore REST 의 값 표현을 평범한 JS 값으로 편다.
 *
 * REST 는 모든 값을 타입 태그로 감싼다(`{stringValue: "김"}`). 문서를 그대로 `raw_payload` 에
 * 넣으면 나중에 원문을 읽을 때마다 이 껍데기를 벗겨야 하고, Cloud Function 이 보내는 모양(평범한
 * JS 객체)과도 달라진다 — **두 경로가 같은 모양을 만들어야** 변환 코드가 하나로 유지된다.
 */
function decodeValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    const inner = (v.arrayValue as { values?: unknown[] } | undefined)?.values ?? [];
    return inner.map(decodeValue);
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, unknown> } | undefined)?.fields ?? {};
    return decodeFields(fields);
  }
  return null;
}

function decodeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

type FirestoreDoc = { name?: string; fields?: Record<string, unknown> };

async function fetchCollection(args: {
  projectId: string;
  apiKey: string;
  collection: string;
}): Promise<{ docId: string; document: Record<string, unknown> }[]> {
  const out: { docId: string; document: Record<string, unknown> }[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${args.projectId}/databases/(default)/documents/${args.collection}`,
    );
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("key", args.apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`firestore ${args.collection} read failed: ${response.status}`);
    }
    const body = (await response.json()) as { documents?: FirestoreDoc[]; nextPageToken?: string };
    for (const doc of body.documents ?? []) {
      const docId = doc.name?.split("/").pop();
      if (!docId) continue;
      out.push({ docId, document: decodeFields(doc.fields ?? {}) });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return out;
}

export async function POST(request: NextRequest) {
  const blocked = ensureDevOnly(request);
  if (blocked) return blocked;

  const projectId = process.env.RECRUIT_FIRESTORE_PROJECT_ID?.trim();
  const apiKey = process.env.RECRUIT_FIRESTORE_API_KEY?.trim();
  if (!projectId || !apiKey) {
    return NextResponse.json({ error: "firestore_not_configured" }, { status: 400 });
  }

  const summary: Record<string, unknown> = {};
  let created = 0;
  let updated = 0;
  const failed: { source: string; docId: string; error: string }[] = [];

  for (const collection of COLLECTIONS) {
    let docs: { docId: string; document: Record<string, unknown> }[];
    try {
      docs = await fetchCollection({ projectId, apiKey, collection });
    } catch (error) {
      // 구 컬렉션이 아예 없을 수 있다. 한쪽이 없다고 전체를 멈추지 않는다.
      console.warn(`[dev/recruit-backfill] ${collection} skipped:`, error);
      summary[collection] = { read: 0, skipped: String(error) };
      continue;
    }

    let collectionCreated = 0;
    let collectionUpdated = 0;
    for (const doc of docs) {
      const result = await ingestJobApplication({
        source: collection,
        externalId: doc.docId,
        document: doc.document,
      });
      if (result.ok) {
        if (result.created) collectionCreated += 1;
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
    };
  }

  return NextResponse.json({ ok: failed.length === 0, created, updated, failed, summary });
}
