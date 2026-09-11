import "server-only";
import { createSign } from "node:crypto";

/**
 * 채용 사이트 Firestore 접근 토큰 — 서비스 계정으로 받는다 (2026-09-11).
 *
 * ## 왜 필요한가
 *
 * 채용 사이트의 Firestore 는 **인증 없이 읽힌다.** 어드민 페이지가 Firebase Auth 를 쓰지 않아
 * (비밀번호가 번들 안 상수) 규칙이 공개 읽기를 허용해야 그 화면이 동작하기 때문이다. 그래서
 * 지원자 196명의 이름·전화·주소·국적·비자·이력서가 URL 만 알면 열린다 — 그리고 그 URL 은
 * 사이트 번들에 `projectId` 와 컬렉션 이름으로 그대로 들어 있다.
 *
 * 규칙을 잠그면 그 노출이 닫히는 대신 StayOps 의 당겨오기도 함께 죽는다. 이 모듈이 그 자리를
 * 대신한다 — 서비스 계정으로 토큰을 받아 인증된 요청을 보낸다.
 *
 * ## 왜 firebase-admin 을 쓰지 않는가
 *
 * 당겨오기는 이미 Firestore REST 를 그대로 쓴다(`firestore.ts`). 토큰 하나만 붙이면 되는데 SDK 를
 * 들이면 의존성과 번들이 커지고, 서버리스 콜드스타트에 얹힌다. 서비스 계정 JWT 서명은 Node 기본
 * `crypto` 로 끝난다.
 *
 * ## 자격증명이 없으면 그냥 비활성이다
 *
 * 환경변수가 없으면 `null` 을 돌려주고 호출부는 예전처럼 인증 없이 읽는다. 그래서 **이 코드를
 * 배포하는 것만으로는 아무것도 바뀌지 않는다** — 규칙을 잠그고 키를 넣는 순간 자연스럽게
 * 넘어간다. 잠그기 전에 배포해 둘 수 있다는 뜻이고, 그게 무중단 전환의 핵심이다.
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

/** Firestore 읽기에 필요한 최소 범위. 쓰기·삭제 권한은 요청하지 않는다. */
const SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** 만료 직전에 갱신한다 — 경계에서 401 이 나면 그 주기 동기화가 통째로 실패한다. */
const REFRESH_MARGIN_SECONDS = 120;

type ServiceAccount = { clientEmail: string; privateKey: string };

let cached: { token: string; expiresAt: number } | null = null;

/**
 * 서비스 계정 자격증명.
 *
 * 두 가지 형태를 받는다 — 서비스 계정 JSON 전체(`RECRUIT_FIRESTORE_SERVICE_ACCOUNT`), 또는
 * 이메일·키 두 조각. JSON 통째로 넣는 쪽이 Vercel 에서 실수가 적다.
 *
 * `\n` 이 literal 로 들어오는 경우가 흔하다(환경변수 UI 가 줄바꿈을 그렇게 저장한다). 그대로 쓰면
 * 서명이 실패하므로 실제 줄바꿈으로 되돌린다.
 */
function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.RECRUIT_FIRESTORE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
      console.error("[recruit/firestore-auth] service account JSON is missing client_email/private_key");
      return null;
    } catch {
      console.error("[recruit/firestore-auth] service account JSON could not be parsed");
      return null;
    }
  }

  const clientEmail = process.env.RECRUIT_FIRESTORE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.RECRUIT_FIRESTORE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKey) {
    return { clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }
  return null;
}

/**
 * 자격증명 상태 — **「없음」과 「있지만 못 씀」을 구분한다.**
 *
 * 처음에는 둘 다 `anonymous` 로 보고했다. 그래서 키를 넣고도 전환이 안 될 때 「환경변수를 안
 * 넣었나」와 「값이 깨졌나」를 구분할 수 없었다(2026-09-11 전환에서 실제로 막혔다).
 * 값 자체는 절대 노출하지 않는다 — 상태만 말한다.
 */
export type FirestoreAuthState =
  | "not_configured"
  | "invalid_json"
  | "missing_fields"
  | "configured";

export function firestoreAuthState(): FirestoreAuthState {
  const raw = process.env.RECRUIT_FIRESTORE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
      return parsed.client_email && parsed.private_key ? "configured" : "missing_fields";
    } catch {
      return "invalid_json";
    }
  }
  const clientEmail = process.env.RECRUIT_FIRESTORE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.RECRUIT_FIRESTORE_PRIVATE_KEY?.trim();
  if (clientEmail || privateKey) {
    return clientEmail && privateKey ? "configured" : "missing_fields";
  }
  return "not_configured";
}

/** 자격증명이 설정돼 있는가. 호출부가 「인증 모드인지」를 로그에 남길 때 쓴다. */
export function hasFirestoreServiceAccount(): boolean {
  return readServiceAccount() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** 서비스 계정으로 서명한 JWT 를 구글 토큰 엔드포인트에 제출해 access token 을 받는다. */
async function requestToken(account: ServiceAccount): Promise<{ token: string; expiresAt: number } | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  let signature: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    signer.end();
    signature = base64url(signer.sign(account.privateKey));
  } catch (error) {
    // 키 형식이 깨진 경우가 대부분이다(줄바꿈 · 따옴표 · 잘린 값).
    console.error("[recruit/firestore-auth] JWT signing failed:", error);
    return null;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // 본문에 자격증명은 없지만 사유(invalid_grant 등)가 있어 원인 파악에 필요하다.
    console.error(
      `[recruit/firestore-auth] token request failed: ${response.status} ${await response.text()}`,
    );
    return null;
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    console.error("[recruit/firestore-auth] token response had no access_token");
    return null;
  }
  return {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

/**
 * 지금 쓸 수 있는 access token. 자격증명이 없으면 `null`(= 인증 없이 읽던 기존 동작).
 *
 * 토큰은 모듈 스코프에 캐시한다. 서버리스라 인스턴스마다 따로 받지만, 한 인스턴스가 5분마다
 * 도는 동기화를 여러 번 처리하는 동안 토큰 요청이 반복되지 않는다.
 */
export async function getFirestoreAccessToken(): Promise<string | null> {
  const account = readServiceAccount();
  if (!account) return null;

  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_SECONDS * 1000) {
    return cached.token;
  }

  const issued = await requestToken(account);
  if (!issued) {
    // 캐시를 비운다 — 낡은 토큰으로 계속 401 을 맞는 것보다 다음 시도에서 다시 받는 편이 낫다.
    cached = null;
    return null;
  }
  cached = issued;
  return issued.token;
}
