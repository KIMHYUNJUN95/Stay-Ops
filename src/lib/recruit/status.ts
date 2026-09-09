import type { Database } from "@/types/database";

/**
 * 채용 지원서의 **상태와 파일 종류** — 서버·클라이언트가 함께 쓰는 순수 모듈.
 *
 * `@/lib/recruit/applications` 는 service-role 클라이언트를 끌어와 `server-only` 다. 목록 화면은
 * 클라이언트 컴포넌트라 그 모듈에서 값을 가져오면 **빌드가 깨진다**(2026-09-09 실제로 겪음).
 * 그래서 클라이언트도 필요한 값은 여기에 둔다. 이 파일은 서버 전용 import 를 갖지 않는다.
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */

export type JobApplicationStatus = Database["public"]["Enums"]["job_application_status"];

export const JOB_APPLICATION_STATUSES: readonly JobApplicationStatus[] = [
  "pending",
  "screening",
  "interview",
];

/**
 * 상태 전진 순서. 마지막 단계 뒤는 없다(합격·불합격은 콘솔이 다루지 않는다).
 *
 * 반환 타입이 좁은 것은 의도다 — 「다음 단계」에 `pending` 이 올 수 없으므로, 문구 사전
 * (`advanceTo`)도 그 두 값만 갖는다. 타입이 넓으면 사전에 쓰이지 않는 키를 만들게 된다.
 */
export function nextStatusOf(status: JobApplicationStatus): "screening" | "interview" | null {
  const index = JOB_APPLICATION_STATUSES.indexOf(status);
  if (index < 0 || index >= JOB_APPLICATION_STATUSES.length - 1) return null;
  const next = JOB_APPLICATION_STATUSES[index + 1];
  return next === "screening" || next === "interview" ? next : null;
}

/** 되돌리기 대상. 첫 단계(`pending`)에서는 없다. */
export function prevStatusOf(status: JobApplicationStatus): "pending" | "screening" | null {
  const index = JOB_APPLICATION_STATUSES.indexOf(status);
  if (index <= 0) return null;
  const prev = JOB_APPLICATION_STATUSES[index - 1];
  return prev === "pending" || prev === "screening" ? prev : null;
}

/**
 * 브라우저에서 바로 열리는 형식인지. PDF·이미지만 미리보기하고 나머지는 내려받게 한다 —
 * 열 수 없는 파일에 「열기」를 주면 빈 탭이 뜨고 담당자는 파일이 깨졌다고 판단한다.
 * **HEIC 는 제외한다.** 확장자는 이미지지만 크롬·파이어폭스가 렌더하지 못한다.
 */
export function resumeKindOf(fileName: string | null): { ext: string; previewable: boolean } {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(fileName ?? "")?.[1]?.toLowerCase() ?? "";
  const previewable = ext === "pdf" || ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp";
  return { ext, previewable };
}
