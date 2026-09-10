import "server-only";

/**
 * 채용 사이트 Firestore 읽기 (2026-09-09).
 *
 * 백필(`/api/dev/recruit/backfill`)과 주기 동기화(`/api/recruit/sync`)가 **같은 코드로** 읽는다.
 * 두 경로가 각자 읽으면 한쪽만 고쳐지는 날이 온다.
 *
 * **인증 없이 읽는다.** 채용 사이트 어드민이 Firebase Auth 없이 클라이언트에서 직접 읽고 있어
 * (비밀번호는 번들 안 상수) 규칙이 공개 읽기를 허용한다 — 2026-09-09 에 키 없는 REST 호출이 200 을
 * 돌려주는 것으로 확인했다. 이 상태 자체가 개인정보 노출이므로 규칙을 잠그는 것이 맞고, **잠그면 이
 * 경로는 죽는다.** 죽는다는 사실이 보이도록 호출부가 결과를 기록한다(`recruit_sync_state`).
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

/** 채용 사이트 Firebase 프로젝트. `haru-job-web/haru-job-react/.firebaserc` 의 default. */
const DEFAULT_PROJECT_ID = "haru-recruit";

export function resolveFirestoreProjectId(): string {
  return process.env.RECRUIT_FIRESTORE_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
}

/**
 * Firestore REST 의 값 표현을 평범한 JS 값으로 편다.
 *
 * REST 는 모든 값을 타입 태그로 감싼다(`{stringValue: "김"}`). 문서를 그대로 `raw_payload` 에
 * 넣으면 나중에 원문을 읽을 때마다 이 껍데기를 벗겨야 한다. 정규화기(`payload.ts`)가 기대하는
 * 모양은 평범한 JS 객체다.
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

export type FirestoreRecord = { docId: string; document: Record<string, unknown> };

/**
 * 컬렉션을 읽는다.
 *
 * `limit` 를 주면 **읽기 건수를 그만큼으로 묶는다.** 주기 동기화가 매번 전량(현재 194건)을 읽으면
 * 5분 주기 기준 하루 5만 건이 넘어 Firestore 무료 한도를 태운다. 최신 것만 보면 되므로
 * `orderBy=createdAt desc` + 소량이 기본이고, 하루 한 번 도는 전량 훑기가 그 사이로 빠진 것을
 * 줍는다.
 *
 * `orderBy` 를 쓰면 **그 필드가 없는 문서는 결과에서 빠진다**(Firestore 규칙). 구 폼 문서에는
 * `createdAt` 이 없어서 정렬 조회로는 안 잡히고, 그래서 전량 훑기는 정렬 없이 읽는다.
 */
export async function fetchFirestoreCollection(args: {
  collection: string;
  projectId?: string;
  /** 없으면 붙이지 않는다. 공개 읽기 규칙에서는 키가 필요 없다. */
  apiKey?: string | null;
  /** 예: "createdAt desc". 생략하면 Firestore 기본 순서(문서 ID). */
  orderBy?: string;
  /** 총 읽기 상한. 생략하면 페이지를 끝까지 넘긴다. */
  limit?: number;
}): Promise<FirestoreRecord[]> {
  const projectId = args.projectId ?? resolveFirestoreProjectId();
  const out: FirestoreRecord[] = [];
  let pageToken: string | undefined;

  do {
    const remaining = args.limit ? args.limit - out.length : 300;
    if (remaining <= 0) break;

    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${args.collection}`,
    );
    url.searchParams.set("pageSize", String(Math.min(remaining, 300)));
    if (args.orderBy) url.searchParams.set("orderBy", args.orderBy);
    if (args.apiKey) url.searchParams.set("key", args.apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, { cache: "no-store" });
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
  } while (pageToken && (!args.limit || out.length < args.limit));

  return out;
}

/**
 * 어떤 시각 이후에 생긴 문서만 읽는다.
 *
 * **왜 필요한가.** 목록 조회는 조건을 걸 수 없어 매번 최신 N건을 통째로 다시 읽는다. 지원은
 * 하루 한두 건인데 5분마다 50건을 읽으면 하루 14,400건 — Firestore 무료 읽기(5만/일)의 30% 를
 * 「이미 갖고 있는 걸 또 읽는 데」 쓴다. 조건 조회는 새 문서가 없으면 **0건을 반환**한다
 * (빈 결과도 최소 1건으로 과금되므로 하루 288건 남짓으로 떨어진다).
 *
 * **겹치는 구간을 둔다.** 기준 시각은 우리 서버의 마지막 성공 시각이고 `createdAt` 은 Firestore
 * 서버가 찍는다 — 두 시계가 정확히 같지 않다. 동기화가 도는 **중에** 저장된 문서도 있다. 딱
 * 잘라 그 시각 이후만 보면 그런 문서가 영원히 안 잡힌다. 겹침이 있으면 같은 문서를 한두 번 더
 * 읽을 뿐이고(수신은 재전송에 안전하다), 놓치는 것보다 언제나 낫다.
 *
 * `createdAt` 이 없는 문서는 조건 조회에 **잡히지 않는다**(Firestore 규칙). 구 폼 문서가 그렇고,
 * 하루 1회 전량 훑기가 그것을 줍는다.
 */
export async function fetchFirestoreCollectionSince(args: {
  collection: string;
  /** 이 시각(ISO)보다 뒤에 생긴 문서만. 겹침 여유는 호출부가 이미 빼서 넘긴다. */
  since: string;
  projectId?: string;
  apiKey?: string | null;
  limit?: number;
}): Promise<FirestoreRecord[]> {
  const projectId = args.projectId ?? resolveFirestoreProjectId();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
  );
  if (args.apiKey) url.searchParams.set("key", args.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: args.collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: "createdAt" },
            op: "GREATER_THAN",
            value: { timestampValue: args.since },
          },
        },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
        limit: args.limit ?? 50,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`firestore ${args.collection} query failed: ${response.status}`);
  }

  // 결과가 없으면 `[{ readTime }]` 하나가 온다 — `document` 가 없는 항목은 건너뛴다.
  const body = (await response.json()) as { document?: FirestoreDoc }[];
  const out: FirestoreRecord[] = [];
  for (const entry of body) {
    const doc = entry.document;
    const docId = doc?.name?.split("/").pop();
    if (!doc || !docId) continue;
    out.push({ docId, document: decodeFields(doc.fields ?? {}) });
  }
  return out;
}
