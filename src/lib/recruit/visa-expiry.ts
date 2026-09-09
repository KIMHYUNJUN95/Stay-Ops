/**
 * 지원서의 체류 자격 만료 시기(`visa_period`)를 날짜로 읽는 **순수** 모듈.
 *
 * **왜 파서가 필요한가.** 콘솔은 「만료 D-64」 칩과 「확인 필요(90일 이내)」 집계를 보여준다.
 * 그런데 이 값은 채용 사이트 폼의 **자유 입력**이라 형태가 제각각이다. 실제로 들어온 194건에서
 * 확인된 것만:
 *
 *   2027년 3월 · 2027년3월 · 2027년 3월 30일 · 27년 2월 · 2028.03.17 · 2027 04.23 · 2030/03
 *   20270811 · 202905 · 2028年10月20日 · 2031年8月３０日(전각 숫자) · 2026년 12월까지
 *   2026.07.31 (갱신예정) · 영주 · 영주자 · 무기간 · 없음 · 출국 후 1년까지(미출국)
 *   2026.12만료이나 비자연장할예정입니다
 *
 * 원칙 셋:
 *
 * 1. **모르면 null.** 억지로 날짜를 만들지 않는다. 만료일을 잘못 읽으면 「D-31」 같은 빨간 칩이
 *    엉뚱한 사람에게 붙고, 그 사람은 채용에서 밀린다. 못 읽은 값은 원문을 그대로 보여준다.
 * 2. **월까지만 있으면 그 달의 마지막 날.** 「2027년 3월」은 3월 어느 날까지는 유효하다는 뜻이다.
 *    1일로 잡으면 남은 기간을 최대 30일 짧게 계산해, 멀쩡한 지원자에게 경고가 붙는다.
 * 3. **기한 없음(영주·무기간)은 「모름」과 다르다.** 별도 종류로 돌려준다 — 화면에서 「영주」로
 *    보여줄 수 있고, 90일 집계에서도 빠진다.
 */

export type VisaExpiry =
  /** 날짜로 읽었다. `date` 는 YYYY-MM-DD, `precision` 은 원문이 일까지 있었는지. */
  | { kind: "date"; date: string; precision: "day" | "month" }
  /** 영주·무기간처럼 만료가 없는 경우. */
  | { kind: "permanent" }
  /** 읽지 못했다. 원문을 그대로 보여줄 것. */
  | { kind: "unknown" };

/** 전각 숫자(２０３１)와 한자 숫자 구분자를 반각으로 내린다 — 실제 데이터에 섞여 있다. */
function toHalfWidthDigits(value: string): string {
  return value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

const PERMANENT = /영주|무기한|무기간|기한\s*없|permanent/i;
/** 「없음」은 비자가 없다(=일본 국적)는 뜻이라 만료 개념이 없다. 영주와 같이 다룬다. */
const NONE = /^\s*(없음|해당\s*없음|없습니다|-|—)\s*$/;

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function build(year: number, month: number, day: number | null): VisaExpiry | null {
  if (month < 1 || month > 12) return null;
  // 두 자리 연도(27년 2월)는 2000년대로 읽는다. 채용 지원서에 1927년은 없다.
  const fullYear = year < 100 ? 2000 + year : year;
  // 폼에 미래 만료가 들어오는 값이라 과거 20년~미래 30년 밖이면 오독으로 본다.
  if (fullYear < 2020 || fullYear > 2060) return null;
  if (day !== null && (day < 1 || day > lastDayOfMonth(fullYear, month))) return null;
  const resolved = day ?? lastDayOfMonth(fullYear, month);
  const mm = String(month).padStart(2, "0");
  const dd = String(resolved).padStart(2, "0");
  return { kind: "date", date: `${fullYear}-${mm}-${dd}`, precision: day === null ? "month" : "day" };
}

export function parseVisaExpiry(raw: string | null | undefined): VisaExpiry {
  if (!raw) return { kind: "unknown" };
  const text = toHalfWidthDigits(raw).trim();
  if (text.length === 0) return { kind: "unknown" };
  if (NONE.test(text)) return { kind: "permanent" };
  // 「2026.12만료이나 비자연장할예정입니다」처럼 날짜와 서술이 섞인 값이 있어, 영주 판정을
  // 숫자 파싱보다 먼저 한다. 「영주」가 들어 있으면 뒤에 무슨 말이 붙든 만료가 없다.
  if (PERMANENT.test(text)) return { kind: "permanent" };

  // 1) 연-월-일: 2028.03.17 · 2027 04.23 · 2030/03/02 · 2027년 3월 30일 · 2027년 02 10
  // 구분자는 기호이거나 **공백만**일 수 있다 — 「2027 04.23」이 실제로 들어온다.
  const SEP = "(?:\\s*[.\\-/년年]\\s*|\\s+)";
  const ymd = new RegExp(`(\\d{2,4})${SEP}(\\d{1,2})(?:\\s*[.\\-/월月]\\s*|\\s+)(\\d{1,2})\\s*[일日]?`).exec(text);
  if (ymd) {
    const built = build(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (built) return built;
    // 일자만 말이 안 되는 경우(2027.02.30 같은 오타)는 **연·월까지는 믿는다.** 그 달 말일로
    // 낮춰 읽으면 남은 기간을 실제보다 길게 잡아, 멀쩡한 사람에게 경고가 붙는 쪽으로는 틀리지
    // 않는다. 연·월까지 못 읽으면 그때 포기한다.
    const monthOnly = build(Number(ymd[1]), Number(ymd[2]), null);
    if (monthOnly) return monthOnly;
  }

  // 2) 연-월: 2027년 3월 · 27년 2월 · 2030/03 · 2029.2 · 2028 06 · 2027년 12
  const ym = /(\d{2,4})\s*[.\-/년年]?\s*(\d{1,2})\s*[월月]?(?!\s*\d)/.exec(text);
  if (ym) {
    const built = build(Number(ym[1]), Number(ym[2]), null);
    if (built) return built;
  }

  // 3) 구분자 없는 숫자 덩어리: 20270811(YYYYMMDD) · 202905(YYYYMM)
  const digits = /^\D*(\d{6,8})\D*$/.exec(text);
  if (digits) {
    const d = digits[1];
    if (d.length === 8) {
      const built = build(Number(d.slice(0, 4)), Number(d.slice(4, 6)), Number(d.slice(6, 8)));
      if (built) return built;
    }
    if (d.length === 6) {
      const built = build(Number(d.slice(0, 4)), Number(d.slice(4, 6)), null);
      if (built) return built;
    }
  }

  return { kind: "unknown" };
}

/**
 * 오늘(도쿄 기준 YYYY-MM-DD)로부터 남은 일수. 만료가 지났으면 음수.
 * 날짜로 읽지 못한 값은 null — 화면이 칩을 그리지 않는다.
 */
export function visaDaysLeft(expiry: VisaExpiry, today: string): number | null {
  if (expiry.kind !== "date") return null;
  const [ty, tm, td] = today.split("-").map(Number);
  const [ey, em, ed] = expiry.date.split("-").map(Number);
  if (!ty || !ey) return null;
  const ms = Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td);
  return Math.round(ms / 86_400_000);
}

/** 콘솔 칩의 단계. 90일 이내만 표시한다 — 그보다 멀면 채용 판단이 달라지지 않는다. */
export type VisaAlert = "expired" | "critical" | "soon" | null;

export function visaAlertOf(daysLeft: number | null): VisaAlert {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "critical";
  if (daysLeft <= 90) return "soon";
  return null;
}
