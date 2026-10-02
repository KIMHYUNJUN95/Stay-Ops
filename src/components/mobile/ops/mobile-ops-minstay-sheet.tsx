"use client";

import { useMemo, useState, useTransition } from "react";
import { submitMinStayChange } from "@/app/admin/ops/calendar/actions";
import { minStayErrorText, type MinStayPanelCopy } from "@/components/admin/ops/ops-minstay-panel";
import type { PanelScopeSummary } from "@/components/admin/ops/ops-price-panel";
import type { RunOpsWrite } from "@/components/admin/ops/ops-write-tracker";
import type { MobilePriceSubmitted } from "@/components/mobile/ops/mobile-ops-price-sheet";
import type { GapContextEntry } from "@/lib/ops-gap-context";

/**
 * 모바일 최소숙박 시트 — Claude Design 시안 `4a 최소숙박 · 차단 시트 v3`(4a · 4b, 2026-10-02 사용자 확정).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「모바일 판매 캘린더」 → 최소숙박 · 차단 시트 v3
 *
 * **서버 경로는 데스크톱 최소숙박 패널과 같다**(`submitMinStayChange` · `runWrite` — 작업 큐 · 되읽기). 모양은 가격 시트 v3 와
 * 같은 뼈대(머리 · 본문 · 바닥 버튼 · 한 줄 알림):
 *
 * - **1박 갭이 섞였으면** 갭 수를 크게(빨간 상자) + 갭 칸 목록. 1박이 기본.
 * - **갭이 없으면** 「지금 최소 숙박일」(모두 같으면 하나, 갈리면 값별 칸 수) + 칸별 현재 → 바뀔 값(데스크톱은 「갭이
 *   없습니다」만 떴다 — 시안 제안 ①).
 * - 값은 세 칸(1박 · 2박 · 직접 1~30). 「감지 기준」 줄 · 「저장하면 N칸이…」 안내는 두지 않는다(2026-10-02 사용자 지시).
 * - 접수되면 부모가 시트를 닫고 알림(「최소숙박 N박 · M칸 완료」 + 되돌리기).
 */

export type MobileMinStaySheetCopy = MinStayPanelCopy & {
  mSelCount: string;
  mmCurrent: string;
  mmNoGap: string;
  mmGapList: string;
  mpNights: string;
  panelListTitle: string;
  panelListRooms: string;
};

export type MobileMinStayCell = {
  roomKey: string;
  roomLabel: string;
  roomIds: string[];
  date: string;
  /** 지금 최소 숙박일(모르면 `null`). 「지금 값」 · 칸별 현재 → 바뀔 값에 쓴다. */
  minStay: number | null;
};

const MIN_STAY_MAX = 30;

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const pad = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
function weekdayLabel(date: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, { timeZone: "Asia/Tokyo", weekday: "short" }).format(
    new Date(`${date}T12:00:00+09:00`),
  );
}

/** 기기 키보드의 「완료」(Enter)로 키보드를 내린다. */
const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter") event.currentTarget.blur();
};

export function MobileOpsMinStaySheet({
  cells,
  copy,
  gapContext,
  onApplied,
  onClear,
  onSubmitted,
  runWrite,
  scopeSummary,
}: {
  cells: MobileMinStayCell[];
  copy: MobileMinStaySheetCopy;
  gapContext: GapContextEntry[];
  onApplied: (sentCells: { roomKey: string; date: string }[]) => void;
  onClear: () => void;
  /** 접수 성공 — 부모가 시트를 닫고 알림을 띄운다. `nights` = 보낸 값. */
  onSubmitted: (submitted: MobilePriceSubmitted & { nights: number }) => void;
  runWrite: RunOpsWrite;
  scopeSummary: PanelScopeSummary | null;
}) {
  const [nights, setNights] = useState(1);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 고른 칸 중 1박 갭인 것(데스크톱 패널과 같은 판정 — 격자가 넘겨 준 갭 맥락).
  const gapRows = useMemo(() => {
    const keys = new Set(cells.map((cell) => `${cell.roomKey}|${cell.date}`));
    return gapContext.filter((entry) => keys.has(`${entry.roomKey}|${entry.date}`));
  }, [cells, gapContext]);
  const gapMode = gapRows.length > 0;

  // 지금 값 — 값별 칸 수(많은 순).
  const distribution = useMemo(() => {
    const counts = new Map<number, number>();
    for (const cell of cells) if (cell.minStay !== null) counts.set(cell.minStay, (counts.get(cell.minStay) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  }, [cells]);

  // 칸별 목록(갭이 없을 때) — 객실 → 날짜.
  const rooms = useMemo(() => {
    const byRoom = new Map<string, { label: string; rows: MobileMinStayCell[] }>();
    for (const cell of cells) {
      const room = byRoom.get(cell.roomKey) ?? { label: cell.roomLabel, rows: [] };
      room.rows.push(cell);
      byRoom.set(cell.roomKey, room);
    }
    for (const room of byRoom.values()) room.rows.sort((a, b) => a.date.localeCompare(b.date));
    return [...byRoom.entries()];
  }, [cells]);

  const pick = (value: number) => {
    setNights(value);
    setCustom("");
    setError(null);
  };
  const pickCustom = (raw: string) => {
    setCustom(raw);
    setError(null);
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= MIN_STAY_MAX) setNights(parsed);
  };
  const customActive = custom !== "" && nights === Number(custom);
  const nightsLabel = (n: number) => copy.mpNights.replace("{n}", String(n));

  const apply = () => {
    if (cells.length === 0) return;
    const targets = cells;
    const value = nights;
    setError(null);
    startTransition(async () => {
      const { result, settled } = await runWrite(
        "minStay",
        targets.map((cell) => ({ key: `${cell.roomKey}|${cell.date}`, value })),
        () =>
          submitMinStayChange({
            cells: targets.map((cell) => ({
              date: cell.date,
              roomIds: cell.roomIds,
              roomKey: cell.roomKey,
              roomLabel: cell.roomLabel,
            })),
            minStay: value,
          }),
      );
      if (!result.ok) {
        setError(copy.msFailed.replace("{error}", minStayErrorText(copy, result.error)));
        return;
      }
      onApplied(targets.map((cell) => ({ date: cell.date, roomKey: cell.roomKey })));
      onSubmitted({ count: targets.length, jobId: result.jobId, nights: value, settled });
    });
  };

  return (
    <div className="mps mops-vars">
      <div className="mps-body">
        <div className="mps-head">
          <div className="mps-head__t">
            <h3>{copy.minStayTitle}</h3>
            {scopeSummary && (
              <p>
                {scopeSummary.rooms}
                <br />
                {scopeSummary.dates}
              </p>
            )}
          </div>
          <span className="mps-cnt">{copy.mSelCount.replace("{n}", String(cells.length))}</span>
        </div>

        {gapMode ? (
          <div className="mms-hero">
            <div className="mms-hero__n">
              <b>{gapRows.length}</b>
              <span>{copy.msGapCount}</span>
            </div>
            <p>{copy.msGapBody}</p>
          </div>
        ) : (
          <div className="mms-hero cur">
            <div className="mms-hero__n">
              <b>{distribution.length > 0 ? nightsLabel(distribution[0][0]) : "—"}</b>
              <span>{copy.mmCurrent}</span>
            </div>
            {distribution.length > 1 && (
              <div className="mms-dist">
                {distribution.map(([value, count]) => (
                  <span key={value}>
                    {nightsLabel(value)} <em>×{count}</em>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mms-seg" role="group" aria-label={copy.minStayTitle}>
          <button aria-pressed={!customActive && nights === 1} className={!customActive && nights === 1 ? "on" : ""} onClick={() => pick(1)} type="button">
            {copy.msOneNight}
          </button>
          <button aria-pressed={!customActive && nights === 2} className={!customActive && nights === 2 ? "on" : ""} onClick={() => pick(2)} type="button">
            {copy.msTwoNights}
          </button>
          <label className={`mms-cust${customActive ? " on" : ""}`}>
            <input
              aria-label={copy.msCustom}
              autoComplete="off"
              enterKeyHint="done"
              inputMode="numeric"
              max={MIN_STAY_MAX}
              min={1}
              onChange={(event) => pickCustom(event.target.value)}
              onKeyDown={blurOnEnter}
              placeholder={copy.msCustomPlaceholder}
              type="number"
              value={custom}
            />
          </label>
        </div>

        {!gapMode && (
          <div className="mps-note warn">
            <i aria-hidden="true" />
            {copy.mmNoGap}
          </div>
        )}

        {error && (
          <div className="mps-note danger" role="alert">
            <i aria-hidden="true" />
            {error}
          </div>
        )}

        <section aria-label={gapMode ? copy.mmGapList : copy.panelListTitle} className="mps-list">
          <div className="mps-lh">
            <b>{gapMode ? copy.mmGapList : copy.panelListTitle}</b>
            <span>
              {gapMode
                ? copy.mSelCount.replace("{n}", String(gapRows.length))
                : copy.panelListRooms.replace("{rooms}", String(rooms.length)).replace("{cells}", String(cells.length))}
            </span>
          </div>
          {gapMode
            ? gapRows.map((entry) => (
                <div className="mms-r" key={`${entry.roomKey}|${entry.date}`}>
                  <span className="b">{entry.propertyName}</span>
                  <span className="rm">{entry.roomLabel}</span>
                  <span className="d">
                    {shortDate(entry.date)}
                    <small>{weekdayLabel(entry.date, copy.localeTag)}</small>
                  </span>
                </div>
              ))
            : rooms.map(([key, room]) => (
                <div key={key}>
                  <div className="mps-rn">{room.label}</div>
                  {room.rows.map((cell) => {
                    const changed = cell.minStay !== nights;
                    return (
                      <div className="mps-r" key={cell.date}>
                        <span className="d">{pad(cell.date)}</span>
                        <span className={`c${changed ? " old" : ""}`}>{cell.minStay === null ? "—" : nightsLabel(cell.minStay)}</span>
                        <i aria-hidden="true">{changed ? "→" : ""}</i>
                        <b>{changed ? nightsLabel(nights) : ""}</b>
                      </div>
                    );
                  })}
                </div>
              ))}
        </section>
      </div>

      <div className="mps-foot">
        <button className="mps-btn ghost" onClick={onClear} type="button">
          {copy.scopeClear}
        </button>
        <button className="mps-btn main" disabled={cells.length === 0 || pending} onClick={apply} type="button">
          {copy.msSave.replace("{count}", String(cells.length))}
        </button>
      </div>
    </div>
  );
}
