import { describe, expect, it } from "vitest";

import { fileNameFromStorageUrl, normalizeApplication, toIsoTimestamp } from "@/lib/recruit/payload";

// 채용 사이트(haru-recruit) 실제 지원서 문서의 모양. ApplicationPage 의 제출 객체를 그대로 옮겼다.
const REAL_DOC = {
  job_id: "cleaning-staff",
  job_title: "객실 청소 스태프",
  employment_type: "아르바이트",
  applied_position: "",
  name: "김하루",
  age: "27",
  gender: "여성",
  phone: "090-1234-5678",
  kakao_id: "haru_k",
  address: "도쿄도 신주쿠구",
  commute_time: "30분",
  uniform_size: "M",
  nationality: "대한민국",
  visa_type: "워킹홀리데이",
  visa_period: "2027-03",
  days: ["월", "수", "금"],
  days_per_week: "3일",
  duration: "6개월 이상",
  start_date: "즉시",
  has_industry_exp: "예",
  industry_tasks: ["객실 청소", "베딩"],
  source: "인스타그램",
  motivation: "숙박업에서 일해보고 싶습니다.",
  resumeUrl: "https://firebasestorage.googleapis.com/v0/b/haru-recruit/o/resumes%2F1_a.pdf?token=x",
  resumeFileName: "이력서.pdf",
  createdAt: { _seconds: 1_757_000_000, _nanoseconds: 0 },
  status: "대기 중",
};

describe("normalizeApplication", () => {
  it("실제 지원서 문서를 그대로 옮긴다", () => {
    const result = normalizeApplication({
      source: "applications",
      externalId: "doc-1",
      document: REAL_DOC,
    });

    expect(result).not.toBeNull();
    expect(result!.applicantName).toBe("김하루");
    expect(result!.workDays).toEqual(["월", "수", "금"]);
    expect(result!.industryTasks).toEqual(["객실 청소", "베딩"]);
    expect(result!.resumeFileName).toBe("이력서.pdf");
    expect(result!.appliedAt).toBe(new Date(1_757_000_000_000).toISOString());
  });

  it("폼의 `source`(지원 경로)를 컬렉션 이름과 섞지 않는다", () => {
    // `source` 컬럼은 컬렉션 이름, `source_channel` 은 지원자가 고른 유입 경로다. 둘을 바꿔 담으면
    // 「인스타그램」이 컬렉션 이름 자리에 들어가 CHECK 제약에 걸린다.
    const result = normalizeApplication({
      source: "applications",
      externalId: "doc-1",
      document: REAL_DOC,
    })!;
    expect(result.source).toBe("applications");
    expect(result.sourceChannel).toBe("인스타그램");
  });

  it("이름이 없으면 행을 만들지 않는다", () => {
    // applicant_name 은 NOT NULL 이다. 여기서 걸러야 수신 경로가 DB 에러로 500 을 내지 않는다.
    expect(
      normalizeApplication({ source: "applications", externalId: "d", document: { phone: "090" } }),
    ).toBeNull();
    expect(
      normalizeApplication({ source: "applications", externalId: "d", document: { name: "   " } }),
    ).toBeNull();
  });

  it("문서 ID 가 비면 거부한다", () => {
    expect(
      normalizeApplication({ source: "applications", externalId: "  ", document: REAL_DOC }),
    ).toBeNull();
  });

  it("빈 문자열은 NULL 로, 숫자 나이는 문자열로 받는다", () => {
    const result = normalizeApplication({
      source: "applications",
      externalId: "doc-2",
      document: { name: "홍길동", applied_position: "", age: 31 },
    })!;
    expect(result.appliedPosition).toBeNull();
    expect(result.age).toBe("31");
  });

  it("구 폼(applicants)의 다른 필드명도 읽는다", () => {
    // 레거시 컬렉션은 resume_url / appliedAt 을 쓴다.
    const result = normalizeApplication({
      source: "applicants",
      externalId: "old-1",
      document: {
        name: "이전지원자",
        resume_url: "https://example.com/old.pdf",
        appliedAt: "2026-01-02T03:04:05.000Z",
        days: "월, 화",
      },
    })!;
    expect(result.source).toBe("applicants");
    expect(result.resumeSourceUrl).toBe("https://example.com/old.pdf");
    expect(result.appliedAt).toBe("2026-01-02T03:04:05.000Z");
    // 콤마 문자열도 배열로 편다 — text[] 컬럼이라 문자열이 그대로 들어가면 안 된다.
    expect(result.workDays).toEqual(["월", "화"]);
  });

  it("원문을 통째로 보관한다", () => {
    const result = normalizeApplication({
      source: "applications",
      externalId: "doc-1",
      document: REAL_DOC,
    })!;
    expect(result.rawPayload).toEqual(REAL_DOC);
  });
});

describe("toIsoTimestamp", () => {
  it("Firestore Timestamp 의 세 가지 전송 형태를 모두 받는다", () => {
    const expected = new Date(1_757_000_000_000).toISOString();
    expect(toIsoTimestamp({ _seconds: 1_757_000_000, _nanoseconds: 0 })).toBe(expected);
    expect(toIsoTimestamp({ seconds: 1_757_000_000, nanoseconds: 0 })).toBe(expected);
    expect(toIsoTimestamp(expected)).toBe(expected);
  });

  it("초 단위와 밀리초 단위를 구분한다", () => {
    expect(toIsoTimestamp(1_757_000_000)).toBe(new Date(1_757_000_000_000).toISOString());
    expect(toIsoTimestamp(1_757_000_000_000)).toBe(new Date(1_757_000_000_000).toISOString());
  });

  it("판독 불가면 지금 시각으로 대체하지 않고 null 이다", () => {
    // 접수 시각을 지어내면 목록 정렬이 조용히 틀어진다.
    expect(toIsoTimestamp(undefined)).toBeNull();
    expect(toIsoTimestamp("어제")).toBeNull();
    expect(toIsoTimestamp({})).toBeNull();
  });
});

describe("fileNameFromStorageUrl", () => {
  it("첨부 URL 에서 원래 파일명을 되살린다", () => {
    // 구 폼은 resumeFileName 을 저장하지 않았다. 업로드 경로에서 되살린다.
    const url =
      "https://firebasestorage.googleapis.com/v0/b/haru-recruit.firebasestorage.app/o/" +
      "resumes%2F1771454517895_%EA%B0%84%EB%8B%A8%EC%9D%B4%EB%A0%A5%EC%84%9C.xlsx?alt=media&token=x";
    expect(fileNameFromStorageUrl(url)).toBe("간단이력서.xlsx");
  });

  it("파일명이 없는 문서는 URL 에서 채운다", () => {
    const url = "https://firebasestorage.googleapis.com/v0/b/b/o/resumes%2F1785742174839_resume.pdf?alt=media";
    const result = normalizeApplication({
      source: "applicants",
      externalId: "old-2",
      document: { name: "홍길동", resume_url: url },
    })!;
    expect(result.resumeFileName).toBe("resume.pdf");
  });

  it("문서에 파일명이 있으면 그쪽을 우선한다", () => {
    const result = normalizeApplication({
      source: "applications",
      externalId: "d",
      document: { name: "홍길동", resumeUrl: "https://x/o/resumes%2F1_a.pdf", resumeFileName: "내이력서.pdf" },
    })!;
    expect(result.resumeFileName).toBe("내이력서.pdf");
  });

  it("URL 이 없으면 null", () => {
    expect(fileNameFromStorageUrl(null)).toBeNull();
    expect(fileNameFromStorageUrl("https://example.com/nope")).toBeNull();
  });
});
