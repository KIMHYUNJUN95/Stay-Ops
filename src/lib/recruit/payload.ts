/**
 * 채용 사이트(haru-recruit) 지원서 문서 → StayOps 행으로 옮기는 **순수 변환**.
 *
 * 서버 전용 import 가 없다. 그래야 테스트에서 그대로 부를 수 있다.
 *
 * 원본은 Firebase/Firestore 문서다. 폼 항목은 앞으로도 바뀌므로(이미 구 폼 `applicants` 의 흔적이
 * 남아 있다) 이 변환은 **모르는 값을 만들지 않는다** — 없으면 NULL 이고, 원문은 `raw_payload` 에
 * 통째로 남는다.
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

export type RecruitSource = "applications" | "applicants";

/** Firestore 문서 한 건. 값의 타입을 신뢰하지 않는다 — 전부 unknown 으로 받아 좁힌다. */
export type RecruitDocument = Record<string, unknown>;

export type NormalizedApplication = {
  source: RecruitSource;
  externalId: string;
  jobExternalId: string | null;
  jobTitle: string | null;
  employmentType: string | null;
  appliedPosition: string | null;
  applicantName: string;
  age: string | null;
  gender: string | null;
  phone: string | null;
  kakaoId: string | null;
  address: string | null;
  commuteTime: string | null;
  uniformSize: string | null;
  nationality: string | null;
  visaType: string | null;
  visaPeriod: string | null;
  workDays: string[];
  daysPerWeek: string | null;
  duration: string | null;
  startDate: string | null;
  hasIndustryExp: string | null;
  industryTasks: string[];
  sourceChannel: string | null;
  motivation: string | null;
  resumeFileName: string | null;
  resumeSourceUrl: string | null;
  appliedAt: string | null;
  rawPayload: RecruitDocument;
};

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  // 폼이 나이를 문자열로 받지만 관리자 화면에서 숫자로 저장된 문서가 섞일 수 있다.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    // 구 폼은 같은 항목을 콤마 문자열로 보냈을 수 있다.
    const single = text(value);
    return single ? single.split(",").map((v) => v.trim()).filter(Boolean) : [];
  }
  return value.map(text).filter((v): v is string => v !== null);
}

/**
 * Firestore Timestamp 는 전송 형태가 여러 가지다. Cloud Functions 가 `toDate().toISOString()` 로
 * 보내면 문자열, 그대로 직렬화하면 `{_seconds, _nanoseconds}` 또는 `{seconds, nanoseconds}` 다.
 * 셋 다 받는다. 판독 불가면 **지금 시각으로 대체하지 않고** null 을 돌려준다 — 접수 시각을
 * 지어내면 목록 정렬이 조용히 틀어진다.
 */
export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // 초 단위와 밀리초 단위를 구분한다(10^12 미만이면 초로 본다 = 2001년 이전 ms 값은 없다).
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const seconds = record._seconds ?? record.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return null;
}

/**
 * 지원자 이름. 채용 사이트 폼은 `name` 을 필수로 받지만, 구 폼 문서나 손상된 문서가 섞일 수 있다.
 * 이름이 없으면 행을 만들 수 없다(NOT NULL) — 호출부가 이 null 을 보고 거부한다.
 */
function applicantName(doc: RecruitDocument): string | null {
  return text(doc.name) ?? text(doc.applicant_name) ?? text(doc.applicantName);
}

export function normalizeApplication(args: {
  source: RecruitSource;
  externalId: string;
  document: RecruitDocument;
}): NormalizedApplication | null {
  const doc = args.document;
  const name = applicantName(doc);
  const externalId = args.externalId.trim();
  if (!name || !externalId) return null;

  return {
    source: args.source,
    externalId,
    jobExternalId: text(doc.job_id),
    jobTitle: text(doc.job_title),
    employmentType: text(doc.employment_type),
    appliedPosition: text(doc.applied_position),
    applicantName: name,
    age: text(doc.age),
    gender: text(doc.gender),
    phone: text(doc.phone),
    kakaoId: text(doc.kakao_id),
    address: text(doc.address),
    commuteTime: text(doc.commute_time),
    uniformSize: text(doc.uniform_size),
    nationality: text(doc.nationality),
    visaType: text(doc.visa_type),
    visaPeriod: text(doc.visa_period),
    workDays: textArray(doc.days),
    daysPerWeek: text(doc.days_per_week),
    duration: text(doc.duration),
    startDate: text(doc.start_date),
    hasIndustryExp: text(doc.has_industry_exp),
    industryTasks: textArray(doc.industry_tasks),
    // 폼의 `source`(지원 경로)다. 컬렉션 이름을 담는 `source` 컬럼과 다르다.
    sourceChannel: text(doc.source),
    motivation: text(doc.motivation),
    resumeFileName: text(doc.resumeFileName) ?? text(doc.resume_file_name),
    // 구 폼은 `resume_url`, 현재 폼은 `resumeUrl`.
    resumeSourceUrl: text(doc.resumeUrl) ?? text(doc.resume_url),
    appliedAt: toIsoTimestamp(doc.createdAt) ?? toIsoTimestamp(doc.appliedAt),
    rawPayload: doc,
  };
}
