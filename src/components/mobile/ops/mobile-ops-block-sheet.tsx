"use client";

import { useMemo, useState, useTransition } from "react";
import {
  submitRoomBlock,
  submitRoomUnblock,
  type BlockChangeCell,
  type BlockPurpose,
} from "@/app/admin/ops/calendar/actions";
import { BLOCK_PURPOSE_ORDER, blockErrorText, type BlockPanelCopy } from "@/components/admin/ops/ops-block-panel";
import type { PanelScopeSummary } from "@/components/admin/ops/ops-price-panel";
import { groupSelectionIntoRanges } from "@/lib/ops-calendar-selection";

/**
 * 모바일 차단 시트 — Claude Design 시안 `4a 최소숙박 · 차단 시트 v3`(4c · 4d · 4e, 2026-10-02 사용자 확정).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「모바일 판매 캘린더」 → 최소숙박 · 차단 시트 v3
 *
 * **서버 경로는 데스크톱 차단 패널과 같다**(`submitRoomBlock` · `submitRoomUnblock` — 그 방의 유닛 전부 · 끊긴 날짜는 구간을
 * 나눠 보냄 · 되읽기 검증). 모양은 가격 시트 v3 와 같은 뼈대:
 *
 * - 사유 칩 4개(다시 누르면 해제) + 메모 · 막을 구간 목록(객실 · 시작 → 끝 · 박 수).
 * - 이미 막힌 밤이 섞였으면 빨간 줄 + 「차단 해제」(그 밤만, 바로 실행).
 * - 「다음 · N박 차단」 → 빨간 확인 카드(구간별 한 줄 · 사유) → 「N박 차단」.
 * - 성공하면 부모가 시트를 닫고 알림(「차단 완료 · N박」 / 「차단 해제 · N박」 + 되돌리기 — `revertBlockChange`).
 */

export type MobileBlockSheetCopy = BlockPanelCopy & {
  mbRanges: string;
  mbConfirmHead: string;
  mbReason: string;
  mbGo: string;
  mbApply: string;
  mpNights: string;
};

export type MobileBlockDone = { mode: "block" | "release"; nights: number; at: string };

const pad = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
const nightsBetween = (start: string, end: string) =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;

export function MobileOpsBlockSheet({
  blockedKeys,
  cells,
  copy,
  onClear,
  onDone,
  scopeSummary,
}: {
  /** 지금 막혀 있는 칸(`roomKey|date`). 「차단 해제」는 이 칸들에만 간다. */
  blockedKeys: ReadonlySet<string>;
  cells: BlockChangeCell[];
  copy: MobileBlockSheetCopy;
  onClear: () => void;
  /** 성공 — 부모가 선택을 비우고 시트를 닫고 알림을 띄운다. */
  onDone: (done: MobileBlockDone) => void;
  scopeSummary: PanelScopeSummary | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [purpose, setPurpose] = useState<BlockPurpose | null>(null);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ranges = useMemo(
    () => groupSelectionIntoRanges(cells.map((cell) => ({ date: cell.date, roomKey: cell.roomKey }))),
    [cells],
  );
  const blockedCells = useMemo(
    () => cells.filter((cell) => blockedKeys.has(`${cell.roomKey}|${cell.date}`)),
    [blockedKeys, cells],
  );
  const nightsLabel = (n: number) => copy.mpNights.replace("{n}", String(n));
  const roomName = (roomKey: string) => roomKey.replace("::", " ");

  const run = (mode: "block" | "release") => {
    const targets = mode === "release" ? blockedCells : cells;
    if (targets.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result =
        mode === "block"
          ? await submitRoomBlock({ cells: targets, memo: memo.trim() || null, purpose })
          : await submitRoomUnblock({ cells: targets });
      if (result.ok) {
        onDone({ at: result.at, mode, nights: targets.length });
        return;
      }
      setConfirming(false);
      setError(
        result.appliedRanges
          ? copy.bkPartialFailed
              .replace("{done}", String(result.appliedRanges))
              .replace("{error}", blockErrorText(copy, result.error))
          : copy.bkFailed.replace("{error}", blockErrorText(copy, result.error)),
      );
    });
  };

  return (
    <div className="mps mops-vars">
      <div className="mps-body">
        <div className="mps-head">
          <div className="mps-head__t">
            <h3>{copy.bkTitle}</h3>
            {scopeSummary && (
              <p>
                {scopeSummary.rooms}
                <br />
                {scopeSummary.dates}
              </p>
            )}
          </div>
          <span className="mps-cnt">
            {copy.bkSummary.replace("{ranges}", String(ranges.length)).replace("{nights}", String(cells.length))}
          </span>
        </div>

        {confirming ? (
          <div className="mps-ok danger" role="status">
            <div className="mps-ok__k">{copy.mbConfirmHead}</div>
            <div className="mps-ok__big">
              {copy.bkConfirmBlock.replace("{ranges}", String(ranges.length)).replace("{nights}", String(cells.length))}
            </div>
            <div className="mps-ok__sm">
              {ranges.slice(0, 4).map((range) => (
                <div key={`${range.roomKey}|${range.startDate}`}>
                  {roomName(range.roomKey)} · {pad(range.startDate)} → {pad(range.endDate)} (
                  {nightsLabel(nightsBetween(range.startDate, range.endDate))})
                </div>
              ))}
              {ranges.length > 4 && <div>+{ranges.length - 4}</div>}
            </div>
            {(purpose || memo.trim()) && (
              <div className="mbk-why">
                {copy.mbReason} · {[purpose ? copy.bkPurposes[purpose] : null, memo.trim() || null].filter(Boolean).join(" — ")}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 이미 막힌 밤이 섞여 있을 때만 — 그 밤들만 바로 푼다. */}
            {blockedCells.length > 0 && (
              <div className="mbk-rel">
                <span>{copy.bkBlockedNote.replace("{nights}", String(blockedCells.length))}</span>
                <button disabled={pending} onClick={() => run("release")} type="button">
                  {copy.bkRelease}
                </button>
              </div>
            )}

            <div className="mbk-why-box">
              <div className="mbk-why-box__l">{copy.bkPurposeLabel}</div>
              <div className="mbk-chips" role="group" aria-label={copy.bkPurposeLabel}>
                {BLOCK_PURPOSE_ORDER.map((key) => (
                  <button
                    aria-pressed={purpose === key}
                    className={purpose === key ? "on" : ""}
                    disabled={pending}
                    key={key}
                    onClick={() => setPurpose((current) => (current === key ? null : key))}
                    type="button"
                  >
                    {copy.bkPurposes[key]}
                  </button>
                ))}
              </div>
              <input
                className="mbk-memo"
                disabled={pending}
                enterKeyHint="done"
                maxLength={200}
                onChange={(event) => setMemo(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                placeholder={copy.bkMemoPlaceholder}
                type="text"
                value={memo}
              />
            </div>
          </>
        )}

        {error && (
          <div className="mps-note danger" role="alert">
            <i aria-hidden="true" />
            {error}
          </div>
        )}

        <p className="mps-ch">{confirming ? copy.bkNote : copy.bkBody}</p>

        {!confirming && (
          <section aria-label={copy.mbRanges} className="mps-list">
            <div className="mps-lh">
              <b>{copy.mbRanges}</b>
              <span>
                {copy.bkSummary.replace("{ranges}", String(ranges.length)).replace("{nights}", String(cells.length))}
              </span>
            </div>
            {ranges.map((range) => (
              <div className="mbk-r" key={`${range.roomKey}|${range.startDate}`}>
                <span className="rm">{roomName(range.roomKey)}</span>
                <span className="d">
                  {pad(range.startDate)} → {pad(range.endDate)}
                </span>
                <span className="n">{nightsLabel(nightsBetween(range.startDate, range.endDate))}</span>
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="mps-foot">
        {confirming ? (
          <>
            <button className="mps-btn ghost" disabled={pending} onClick={() => setConfirming(false)} type="button">
              {copy.panelCancel}
            </button>
            <button className="mps-btn main danger" disabled={pending} onClick={() => run("block")} type="button">
              {copy.mbApply.replace("{n}", String(cells.length))}
            </button>
          </>
        ) : (
          <>
            <button className="mps-btn ghost" disabled={pending} onClick={onClear} type="button">
              {copy.scopeClear}
            </button>
            <button
              className="mps-btn main danger"
              disabled={cells.length === 0 || pending}
              onClick={() => setConfirming(true)}
              type="button"
            >
              {copy.mbGo.replace("{n}", String(cells.length))}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
