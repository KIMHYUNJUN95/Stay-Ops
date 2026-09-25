"use client";

import { useMemo, useState, useTransition } from "react";
import { submitMinStayChange } from "@/app/admin/ops/calendar/actions";
import type { PriceChangeError } from "@/app/admin/ops/calendar/actions";
import type { GapContextEntry, GapNeighbor } from "@/lib/ops-gap-context";

/**
 * 최소 숙박일 패널 — 격자 오른쪽 세로 카드.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「1박 갭 감지」
 * 시안: Claude Design 「StayOps 운영 관리자 영역」 `6-minstay.dc.html`
 *
 * ## 왜 가격과 다른 패널인가
 *
 * 같은 자리에 있지만 **묻는 것이 다르다.** 가격 패널은 「얼마로?」를 묻고 칸마다 다른 값을
 * 계산한다. 여기는 「몇 박으로?」 하나를 묻고 고른 칸 전부에 같은 값을 넣는다. 대신 화면의
 * 대부분이 **왜 이 칸들이 문제인지**를 설명하는 데 쓰인다 — 갭은 눈에 안 띄는 손실이라
 * 「6칸」이라는 숫자만으로는 손이 안 간다.
 *
 * ## 목록에 앞뒤를 같이 적는다
 *
 * `402호 · 12/3` 만으로는 진짜 팔 수 없는 날인지 확인하러 격자를 다시 봐야 한다.
 * `Booking ▸ 1박 ▸ Airbnb` 로 적으면 목록만 보고 판단할 수 있다(`ops-gap-context.ts`).
 *
 * ## 감지 기준을 화면에 적어 둔다
 *
 * 「왜 이건 갭이 아니지?」가 반드시 나온다. 규칙을 숨기면 그때마다 코드를 열어야 한다.
 */

export type MinStayPanelCopy = {
  minStayTitle: string;
  msGapCount: string;
  msGapBody: string;
  msOneNight: string;
  msTwoNights: string;
  msCustom: string;
  msCustomPlaceholder: string;
  msRuleTitle: string;
  msRuleBody: string;
  msRuleNote: string;
  msFootnote: string;
  msSave: string;
  msEmptyTitle: string;
  msEmptyBody: string;
  msQueued: string;
  msDone: string;
  msFailed: string;
  msNeighborNone: string;
  msNeighborBlock: string;
  msNight: string;
  panelCancel: string;
  errForbidden: string;
  errNoCells: string;
  errBadMinStay: string;
  errNoWritableRoom: string;
  errEnqueueFailed: string;
};

export type MinStayPanelCell = {
  roomKey: string;
  roomLabel: string;
  roomIds: string[];
  date: string;
};

/** 최소 숙박일의 상한. 저쪽 모달과 같은 범위(1~30)다. */
const MIN_STAY_MAX = 30;

function errorText(copy: MinStayPanelCopy, error: PriceChangeError): string {
  switch (error) {
    case "forbidden":
      return copy.errForbidden;
    case "no_cells":
      return copy.errNoCells;
    case "bad_min_stay":
      return copy.errBadMinStay;
    case "no_writable_room":
      return copy.errNoWritableRoom;
    default:
      return copy.errEnqueueFailed;
  }
}

/** `2026-12-03` → `12/3`. 목록이 좁아서 연도는 뺀다 — 창이 1년을 넘지 않는다. */
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function neighborLabel(copy: MinStayPanelCopy, neighbor: GapNeighbor): string {
  switch (neighbor.kind) {
    case "airbnb":
      return "Airbnb";
    case "booking":
      return "Booking";
    case "manual":
      return "Direct";
    case "block":
      return copy.msNeighborBlock;
    default:
      return copy.msNeighborNone;
  }
}

export function OpsMinStayPanel({
  cells,
  copy,
  gapContext,
  onClear,
  scopeSummary,
}: {
  cells: MinStayPanelCell[];
  copy: MinStayPanelCopy;
  gapContext: GapContextEntry[];
  onClear: () => void;
  scopeSummary: { rooms: string; dates: string } | null;
}) {
  const [nights, setNights] = useState<number>(1);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 고른 칸 중 **갭인 것만** 목록에 나온다. 갭이 아닌 칸도 값은 바뀌지만, 목록은 「왜 문제인가」를
  // 설명하는 자리라 갭이 아닌 것을 섞으면 설명이 흐려진다.
  const selectedKeys = useMemo(
    () => new Set(cells.map((cell) => `${cell.roomKey}|${cell.date}`)),
    [cells],
  );
  const rows = useMemo(
    () => gapContext.filter((entry) => selectedKeys.has(`${entry.roomKey}|${entry.date}`)),
    [gapContext, selectedKeys],
  );

  const apply = () => {
    if (cells.length === 0) return;
    setMessage(copy.msQueued);
    startTransition(async () => {
      const result = await submitMinStayChange({
        cells: cells.map((cell) => ({
          date: cell.date,
          roomIds: cell.roomIds,
          roomKey: cell.roomKey,
          roomLabel: cell.roomLabel,
        })),
        minStay: nights,
      });
      setMessage(
        result.ok ? copy.msDone : copy.msFailed.replace("{error}", errorText(copy, result.error)),
      );
    });
  };

  const pickCustom = (raw: string) => {
    setCustom(raw);
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= MIN_STAY_MAX) setNights(parsed);
  };

  return (
    <aside className="opsp opsp--ms">
      <div className="opsp__head">
        <div className="opsp__title">{copy.minStayTitle}</div>
        <div className="opsp__target">
          {scopeSummary ? (
            <>
              {scopeSummary.rooms}
              <br />
              {scopeSummary.dates}
            </>
          ) : (
            copy.msEmptyTitle
          )}
        </div>
      </div>

      <div className="opsp__body">
        {/* 갭 개수를 크게 적는다 — 눈에 안 띄는 손실이라 숫자가 작으면 손이 안 간다. */}
        <div className="opsms__box">
          <div className="opsms__num">
            <strong>{rows.length}</strong>
            <span>{copy.msGapCount}</span>
          </div>
          <p className="opsms__desc">{copy.msGapBody}</p>
        </div>

        {/* 1박이 기본이다. 2박·직접 입력은 되돌리거나 다른 값으로 바꿀 때 쓴다. */}
        <div className="opsms__acts">
          <button
            className={`opsms__act${nights === 1 ? " on" : ""}`}
            onClick={() => {
              setNights(1);
              setCustom("");
            }}
            type="button"
          >
            {copy.msOneNight}
          </button>
          <button
            className={`opsms__act${nights === 2 ? " on" : ""}`}
            onClick={() => {
              setNights(2);
              setCustom("");
            }}
            type="button"
          >
            {copy.msTwoNights}
          </button>
          <input
            aria-label={copy.msCustom}
            className={`opsms__custom${nights > 2 ? " on" : ""}`}
            inputMode="numeric"
            max={MIN_STAY_MAX}
            min={1}
            onChange={(event) => pickCustom(event.target.value)}
            placeholder={copy.msCustomPlaceholder}
            type="number"
            value={custom}
          />
        </div>

        {rows.length > 0 ? (
          <div className="opsms__tbl">
            {rows.map((entry) => (
              <div className="opsms__trw" key={`${entry.roomKey}|${entry.date}`}>
                <span className="opsms__rm">{entry.roomLabel}</span>
                <span className="opsms__dt">{shortDate(entry.date)}</span>
                <span className="opsms__ctx">
                  <span className={`opsms__pill ${entry.before.kind}`}>
                    {neighborLabel(copy, entry.before)}
                  </span>
                  <span className="opsms__arrow">▸</span>
                  <span className="opsms__pill gap">{copy.msNight.replace("{n}", "1")}</span>
                  <span className="opsms__arrow">▸</span>
                  <span className={`opsms__pill ${entry.after.kind}`}>
                    {neighborLabel(copy, entry.after)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="opsms__empty">{copy.msEmptyBody}</div>
        )}

        {/* 「왜 이건 갭이 아니지?」가 반드시 나온다. 규칙을 숨기면 그때마다 코드를 열어야 한다. */}
        <div className="opsms__rule">
          <strong>{copy.msRuleTitle}</strong>
          {copy.msRuleBody}
          <span className="opsms__rulenote">{copy.msRuleNote}</span>
        </div>

        <div className="opsp__grow" />

        {message && <div className="opsp__msg">{message}</div>}
        <div className="opsp__channel">
          {copy.msFootnote.replace("{count}", String(cells.length)).replace("{n}", String(nights))}
        </div>
      </div>

      <div className="opsp__foot">
        <button
          className="opsp__btn"
          disabled={cells.length === 0}
          onClick={onClear}
          type="button"
        >
          {copy.panelCancel}
        </button>
        <button
          className="opsp__btn go"
          disabled={cells.length === 0 || pending}
          onClick={apply}
          type="button"
        >
          {copy.msSave.replace("{count}", String(cells.length))}
        </button>
      </div>
    </aside>
  );
}
