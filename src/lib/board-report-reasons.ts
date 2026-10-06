// 게시판 신고 사유 라벨 — 서버 · 클라이언트 양쪽에서 쓰므로 "use client" 파일 밖에 둔다(2026-10-06).
// (서버 컴포넌트가 클라이언트 모듈의 함수를 부르면 실행 중에 깨진다.)

export type BoardReportReasonCode = "spam" | "harassment" | "inappropriate" | "privacy" | "other";

export type BoardReasonCopy = {
  reasonSpam: string;
  reasonHarassment: string;
  reasonInappropriate: string;
  reasonPrivacy: string;
  reasonOther: string;
};

export function boardReasonLabel(copy: BoardReasonCopy, code: BoardReportReasonCode): string {
  return {
    spam: copy.reasonSpam,
    harassment: copy.reasonHarassment,
    inappropriate: copy.reasonInappropriate,
    privacy: copy.reasonPrivacy,
    other: copy.reasonOther,
  }[code];
}
