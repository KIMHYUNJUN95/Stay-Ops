"use client";

import { useMemo, useState, useTransition } from "react";
import {
  submitRoomBlock,
  submitRoomUnblock,
  type BlockChangeCell,
  type BlockChangeError,
} from "@/app/admin/ops/calendar/actions";
import { groupSelectionIntoRanges } from "@/lib/ops-calendar-selection";

/**
 * 차단(블록) 패널 — 격자 오른쪽 세로 카드.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「저쪽 블록의 실제 규칙」
 *
 * ## 이 패널이 하는 일은 하나뿐이다
 *
 * 가격 패널은 「얼마로?」를 묻고 칸마다 다른 값을 계산한다. 여기는 **고른 칸을 막거나 푸는
 * 것**이 전부라 입력이 없다. 대신 화면의 대부분이 **무슨 일이 벌어지는지**를 설명하는 데 쓰인다
 * — 막는 순간 그 방이 **채널에서 내려간다.**
 *
 * ## 구간으로 보여준다
 *
 * 「9칸」보다 「2구간 · 9박」이 정확하다. 블록은 구간 단위로 쓰이고, 끊긴 구간은 나뉘기
 * 때문이다(`groupSelectionIntoRanges`). 구간 수를 보여주지 않으면 10/1·10/2·10/5 를 고른
 * 사람이 「10/1~10/5 를 막았다」고 오해한다.
 *
 * ## 한 번 더 묻는다
 *
 * 되돌릴 수는 있지만(해제), 되돌리기 전까지는 **팔 수 있는 밤이 안 팔린다.** 무엇이 몇 구간
 * 몇 박 바뀌는지 보여주고 확인을 받는다.
 */

export type BlockPanelCopy = {
  bkTitle: string;
  bkBody: string;
  bkApply: string;
  bkRelease: string;
  bkConfirmBlock: string;
  bkConfirmRelease: string;
  bkSummary: string;
  bkEmptyTitle: string;
  bkEmptyBody: string;
  bkPending: string;
  bkDoneBlock: string;
  bkDoneRelease: string;
  bkFailed: string;
  bkNote: string;
  panelCancel: string;
  scopeClear: string;
  errForbidden: string;
  errNoCells: string;
  /** Beds24 왕복이 실패한 경우. 사유별로 사람이 할 일이 다르다. */
  errBkCooldown: string;
  errBkUnavailable: string;
  errBkRejected: string;
  errBkVerify: string;
  errBkRolledBack: string;
  errBkNotRolledBack: string;
  errBkUnknownRoom: string;
};

function errorText(copy: BlockPanelCopy, error: BlockChangeError): string {
  switch (error) {
    case "forbidden":
      return copy.errForbidden;
    case "no_cells":
    case "no_rooms":
      return copy.errNoCells;
    case "cooldown":
      return copy.errBkCooldown;
    case "beds24_unavailable":
    case "readback_truncated":
      return copy.errBkUnavailable;
    case "beds24_rejected":
      return copy.errBkRejected;
    case "verify_mismatch":
      return copy.errBkVerify;
    case "save_failed_rolled_back":
      return copy.errBkRolledBack;
    // 되돌리지 못한 경우는 **사람이 Beds24 에서 직접 풀어야 한다.** 다른 실패와 같은 문구로
    // 묶으면 그냥 재시도하고 넘어가는데, 그러면 고아 블록이 남는다.
    case "save_failed_not_rolled_back":
      return copy.errBkNotRolledBack;
    default:
      return copy.errBkUnknownRoom;
  }
}

export function OpsBlockPanel({
  cells,
  copy,
  onClear,
  scopeSummary,
}: {
  cells: BlockChangeCell[];
  copy: BlockPanelCopy;
  onClear: () => void;
  scopeSummary: { rooms: string; dates: string } | null;
}) {
  const [confirming, setConfirming] = useState<"block" | "release" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ranges = useMemo(
    () => groupSelectionIntoRanges(cells.map((cell) => ({ date: cell.date, roomKey: cell.roomKey }))),
    [cells],
  );

  const run = (mode: "block" | "release") => {
    if (cells.length === 0) return;
    setMessage(copy.bkPending);
    setConfirming(null);
    startTransition(async () => {
      const result =
        mode === "block" ? await submitRoomBlock({ cells }) : await submitRoomUnblock({ cells });
      if (result.ok) {
        setMessage(mode === "block" ? copy.bkDoneBlock : copy.bkDoneRelease);
        onClear();
        return;
      }
      setMessage(copy.bkFailed.replace("{error}", errorText(copy, result.error)));
    });
  };

  const hasSelection = cells.length > 0;
  const summary = copy.bkSummary
    .replace("{ranges}", String(ranges.length))
    .replace("{nights}", String(cells.length));

  return (
    <aside className="opsp opsp--bk">
      <div className="opsp__head">
        <div className="opsp__title">{copy.bkTitle}</div>
        <div className="opsp__target">
          {scopeSummary ? (
            <>
              {scopeSummary.rooms}
              <br />
              {scopeSummary.dates}
            </>
          ) : (
            copy.bkEmptyTitle
          )}
        </div>
      </div>

      <div className="opsp__body">
        {hasSelection ? (
          <div className="opsbk__box">
            {/* 「9칸」보다 「2구간 · 9박」이 정확하다 — 끊긴 구간은 나뉘어 쓰인다. */}
            <div className="opsbk__sum">{summary}</div>
            <ul className="opsbk__list">
              {ranges.slice(0, 8).map((range) => (
                <li key={`${range.roomKey}|${range.startDate}`}>
                  <span className="opsbk__rm">{range.roomKey.split("__").pop()}</span>
                  <span className="opsbk__dt">
                    {range.startDate.slice(5)} → {range.endDate.slice(5)}
                  </span>
                </li>
              ))}
            </ul>
            {ranges.length > 8 && <div className="opsbk__more">+{ranges.length - 8}</div>}
          </div>
        ) : (
          <div className="opsbk__empty">{copy.bkEmptyBody}</div>
        )}

        {/* 막는다는 것이 무슨 뜻인지 화면에 적는다 — 「왜 예약이 안 들어오지?」가 안 나오게. */}
        <div className="opsbk__note">{copy.bkBody}</div>

        <div className="opsp__grow" />

        {message && <div className="opsp__msg">{message}</div>}
        <div className="opsp__channel">{copy.bkNote}</div>
      </div>

      <div className="opsp__foot">
        {confirming ? (
          <>
            <button className="opsp__btn" onClick={() => setConfirming(null)} type="button">
              {copy.panelCancel}
            </button>
            <button
              className={`opsp__btn go${confirming === "block" ? " danger" : ""}`}
              disabled={pending}
              onClick={() => run(confirming)}
              type="button"
            >
              {(confirming === "block" ? copy.bkConfirmBlock : copy.bkConfirmRelease)
                .replace("{ranges}", String(ranges.length))
                .replace("{nights}", String(cells.length))}
            </button>
          </>
        ) : (
          <>
            <button
              className="opsp__btn"
              disabled={!hasSelection || pending}
              onClick={() => setConfirming("release")}
              type="button"
            >
              {copy.bkRelease}
            </button>
            <button
              className="opsp__btn go danger"
              disabled={!hasSelection || pending}
              onClick={() => setConfirming("block")}
              type="button"
            >
              {copy.bkApply}
            </button>
          </>
        )}
      </div>
      {hasSelection && !confirming && (
        <button className="opsbk__clear" onClick={onClear} title="Esc" type="button">
          {copy.scopeClear}
        </button>
      )}
    </aside>
  );
}
