import { parsePhoneNumberFromString, type MetadataJson } from "libphonenumber-js/core";
import metadataModule from "libphonenumber-js/metadata.min";

/**
 * 메타데이터를 **직접 넘긴다.** 기본 진입점은 내부에서 JSON 을 `require` 하는데, tsx(우리
 * `scripts/dev` 실행기)는 그 JSON 을 `{ default: … }` 로 감싸 돌려줘서 라이브러리가
 * 「metadata 가 아니다」로 죽는다(2026-09-28 측정 스크립트에서 발견). 감싸져 있으면 벗긴다 —
 * Next · vitest · tsx 어디서 불러도 같은 값이 된다.
 */
const METADATA = ((metadataModule as unknown as { default?: MetadataJson }).default ??
  metadataModule) as MetadataJson;

/**
 * 손님 국가 — 채널이 준 값이 없으면 **전화번호의 국가번호로 추정**한다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「예약 상세」 · 국가 추정
 *              `docs/product/34-metrics-and-automation.md` → 국가별 지표
 *
 * ## 왜 필요한가 (2026-09-28 실측)
 *
 * **Airbnb 는 국가를 거의 주지 않는다.** 체크인 6월 이후 Airbnb 1,460건 중 704건(48%)이 국가
 * 없이 들어오고, 국가가 있는 것은 1건뿐이다. 대신 **전화번호는 100%** 이고 전부 국가번호가 붙은
 * 국제 형식(E.164)에서 `+` 만 빠진 모양이다(`14155552671` · `61412345678` …).
 *
 * 저쪽 국가별 화면은 국가가 비면 `Unknown` 으로 센다 — Airbnb 손님 절반이 거기 섞인다.
 * 이 함수가 그 구멍을 메운다. 예약 상세 패널과, 나중에 옮길 **국가별 점유·분포**가 같이 쓴다.
 *
 * ## 추정이다 — 출처를 같이 돌려준다
 *
 * 전화번호의 나라와 사는 나라·국적은 다를 수 있다(해외 거주, 로밍). 그래서 채널이 준 국가가
 * 있으면 **그걸 먼저** 쓰고, 번호로 채운 것은 `source: "phone"` 으로 가른다. 화면은 「전화번호로
 * 추정」이라고 적고, 지표는 둘을 나눠 셀 수 있다.
 *
 * ## `+1` 은 번호 앞자리만으로 못 가른다
 *
 * 미국·캐나다·카리브해가 `+1` 을 같이 쓴다 — 지역번호까지 봐야 한다. 그 표를 직접 들고 있지
 * 않고 `libphonenumber-js`(구글 libphonenumber 메타데이터)를 쓴다(2026-09-28 결정).
 *
 * ## 모르는 것은 모른다고 한다
 *
 * - `0` 으로 시작하는 국내 번호(`09012345678`)는 나라를 알 수 없다 → `null`.
 * - **유효한 번호일 때만** 나라를 믿는다(`isValid`). 가능한 길이일 뿐인 번호로 추정하면 숫자만
 *   맞춘 엉뚱한 나라가 붙는다.
 */

export type GuestCountrySource = "channel" | "phone";

export type GuestCountry = {
  /** ISO 3166-1 alpha-2 대문자. */
  code: string;
  source: GuestCountrySource;
};

/**
 * 전화번호 한 개 → 나라 코드. 모르면 `null`.
 *
 * 받는 모양: `+81 90-1234-5678` · `14155552671`(Airbnb — `+` 없는 E.164) · `0044 7911 123456`.
 */
export function countryFromPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+")) {
    // 국제전화 접두 `00` 은 `+` 와 같다. 그 밖에 0 으로 시작하면 국내 번호라 나라를 모른다.
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) return null;
  }
  if (digits.length < 7) return null;

  const parsed = parsePhoneNumberFromString(`+${digits}`, METADATA);
  if (!parsed || !parsed.isValid() || !parsed.country) return null;
  return parsed.country;
}

/**
 * 손님 국가를 정한다 — **채널 값 우선, 없으면 전화번호.**
 *
 * `channelCode` 는 채널이 준 ISO 코드(대소문자 무관). 전화번호는 여러 개를 받아 **처음으로
 * 나라가 나오는 것**을 쓴다(전화 → 휴대폰 순).
 */
export function resolveGuestCountry(args: {
  channelCode: string | null | undefined;
  phones: Array<string | null | undefined>;
}): GuestCountry | null {
  const channel = (args.channelCode ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(channel)) return { code: channel, source: "channel" };

  for (const phone of args.phones) {
    const code = countryFromPhone(phone);
    if (code) return { code, source: "phone" };
  }
  return null;
}
