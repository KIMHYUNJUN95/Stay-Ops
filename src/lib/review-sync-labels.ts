import type { Dictionary } from "@/lib/i18n";
import type { ReviewSyncButtonLabels } from "@/components/complaints/review-sync-button";

/** 「지금 가져오기」 버튼 문구 — 대시보드 · 모바일이 같은 사전 키(`complaints.sync*`)를 쓴다. */
export function reviewSyncLabels(copy: Dictionary["complaints"]): ReviewSyncButtonLabels {
  return {
    availableAt: copy.syncAvailableAt,
    button: copy.syncNow,
    done: copy.syncDone,
    errBusy: copy.syncErrBusy,
    errCooldown: copy.syncErrCooldown,
    errCredits: copy.syncErrCredits,
    errFailed: copy.syncErrFailed,
    errForbidden: copy.syncErrForbidden,
    errLost: copy.syncErrLost,
    errPaused: copy.syncErrPaused,
    last: copy.syncLast,
    never: copy.syncNever,
    running: copy.syncRunning,
  };
}
