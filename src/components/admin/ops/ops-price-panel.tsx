"use client";

import { useMemo, useState, useTransition } from "react";
import {
  submitMinStayChange,
  submitPriceChange,
  type PriceChangeCell,
} from "@/app/admin/ops/calendar/actions";
import type { PriceChangeError } from "@/app/admin/ops/calendar/actions";
import {
  amountFromPercent,
  buildAdjustmentPreview,
  findAdjustmentWarnings,
  percentFromAmount,
  PERCENT_PRESETS,
  type AdjustmentInput,
} from "@/lib/ops-price-adjustment";

/**
 * 가격·최소숙박 조작 패널.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「조정 방식 두 가지」
 *
 * ## 모드 토글이 없다
 *
 * 저쪽은 `adjustMode` 로 「직접 입력」과 「퍼센트」를 갈라 놓았지만, **둘은 같은 값을 정하는
 * 두 가지 방법일 뿐**이라 한 화면에 둔다(2026-09-16 확정). 금액을 쓰면 % 배지가 계산되고,
 * 퍼센트를 누르면 금액이 채워진다.
 *
 * **적용 결과는 다르다.** 금액은 고른 칸 전부를 그 값으로, 퍼센트는 칸마다 자기 현재가
 * 기준이다. 그래서 퍼센트일 때 「변경」을 **범위**로 보여준다.
 *
 * ## 확인을 한 번 더 받는다
 *
 * 잘못 쓰면 채널에 그대로 나간다 — 0원에 팔리거나 자릿수 하나가 더 붙어 아무도 안 사는 방이
 * 된다. 막지는 않되 **무엇이 몇 칸 바뀌는지 보여주고 한 번 더 묻는다.**
 */

export type PanelCopy = {
  panelTitle: string;
  panelAmount: string;
  panelPercent: string;
  panelCurrent: string;
  panelNext: string;
  panelApply: string;
  panelCancel: string;
  panelConfirm: string;
  panelConfirmBody: string;
  panelSkippedNoPrice: string;
  panelNoChange: string;
  panelQueued: string;
  panelDone: string;
  panelFailed: string;
  errForbidden: string;
  errNoCells: string;
  errNoPricedCells: string;
  errBadMinStay: string;
  errNoWritableRoom: string;
  errInvalidValues: string;
  errEnqueueFailed: string;
  warnZero: string;
  warnDrop: string;
  warnRise: string;
  gapAction: string;
  gapActionBody: string;
  minStayTitle: string;
};

export type PanelCell = {
  roomKey: string;
  roomLabel: string;
  roomIds: string[];
  date: string;
  price: number | null;
  isGap: boolean;
};

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

/** 서버가 준 **코드**를 사용자의 언어로 바꾼다. 서버는 문구를 모른다. */
function errorText(copy: PanelCopy, code: PriceChangeError): string {
  switch (code) {
    case "forbidden":
      return copy.errForbidden;
    case "no_cells":
      return copy.errNoCells;
    case "no_priced_cells":
      return copy.errNoPricedCells;
    case "bad_min_stay":
      return copy.errBadMinStay;
    case "no_writable_room":
      return copy.errNoWritableRoom;
    case "invalid_values":
      return copy.errInvalidValues;
    default:
      return copy.errEnqueueFailed;
  }
}

export function OpsPricePanel({
  cells,
  copy,
  onApplied,
}: {
  cells: PanelCell[];
  copy: PanelCopy;
  /** 접수되면 화면이 낙관적으로 새 값을 그린다. */
  onApplied: (applied: { roomKey: string; date: string; price: number }[]) => void;
}) {
  const [input, setInput] = useState<AdjustmentInput | null>(null);
  const [amountText, setAmountText] = useState("");
  const [percentText, setPercentText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(
    () =>
      buildAdjustmentPreview(
        cells.map((cell) => ({
          date: cell.date,
          price: cell.price,
          roomKey: cell.roomKey,
          roomLabel: cell.roomLabel,
        })),
        input ?? { amount: 0, kind: "amount" },
      ),
    [cells, input],
  );

  const warnings = useMemo(
    () => (input ? findAdjustmentWarnings(preview) : []),
    [input, preview],
  );
  const gapCells = useMemo(() => cells.filter((cell) => cell.isGap), [cells]);
  const roomCount = new Set(preview.rows.map((row) => row.roomKey)).size;

  /** 금액을 쓰면 % 배지가 따라온다 — 모드 토글을 없앤 대가다. */
  const onAmount = (text: string) => {
    setAmountText(text);
    const amount = Number.parseInt(text.replace(/[^\d-]/g, ""), 10);
    if (!Number.isFinite(amount)) {
      setInput(null);
      setPercentText("");
      return;
    }
    setInput({ amount, kind: "amount" });
    const percent = percentFromAmount(preview.currentAverage, amount);
    setPercentText(percent === null ? "" : String(percent));
  };

  /** 퍼센트를 누르거나 쓰면 금액칸이 **평균 기준으로** 채워진다(적용은 칸마다 다르다). */
  const onPercent = (value: number) => {
    setPercentText(String(value));
    setInput({ kind: "percent", percent: value });
    const amount = amountFromPercent(preview.currentAverage, value);
    setAmountText(amount === null ? "" : String(amount));
  };

  const reset = () => {
    setInput(null);
    setAmountText("");
    setPercentText("");
    setConfirming(false);
  };

  const toRequestCells = (): PriceChangeCell[] =>
    cells.map((cell) => ({
      currentPrice: cell.price,
      date: cell.date,
      roomIds: cell.roomIds,
      roomKey: cell.roomKey,
      roomLabel: cell.roomLabel,
    }));

  const apply = () => {
    if (!input) return;
    // **서버 응답을 기다리기 전에 화면부터 바꾼다.** 왕복 동안 옛 값이 보이면 사람은
    // 「안 됐나?」 하고 다시 누른다(저쪽도 같은 이유로 낙관적 표시를 앞으로 당겼다).
    const applied = preview.rows.map((row) => ({
      date: row.date,
      price: row.newPrice,
      roomKey: row.roomKey,
    }));
    onApplied(applied);
    setMessage(copy.panelQueued);
    setConfirming(false);
    startTransition(async () => {
      const result = await submitPriceChange({ cells: toRequestCells(), input });
      setMessage(
        result.ok ? copy.panelDone : copy.panelFailed.replace("{error}", errorText(copy, result.error)),
      );
      if (result.ok) reset();
    });
  };

  /** 「1박으로」 — 이 기능의 본래 목적이다. 갭 칸의 최소 숙박일을 1로 만든다. */
  const applyOneNight = () => {
    if (gapCells.length === 0) return;
    setMessage(copy.panelQueued);
    startTransition(async () => {
      const result = await submitMinStayChange({
        cells: gapCells.map((cell) => ({
          date: cell.date,
          roomIds: cell.roomIds,
          roomKey: cell.roomKey,
          roomLabel: cell.roomLabel,
        })),
        minStay: 1,
      });
      setMessage(
        result.ok ? copy.panelDone : copy.panelFailed.replace("{error}", errorText(copy, result.error)),
      );
    });
  };

  const warningText = (warning: string) =>
    warning === "zero" ? copy.warnZero : warning === "huge_drop" ? copy.warnDrop : copy.warnRise;

  return (
    <div className="opsp">
      <div className="opsp__row">
        {/* 입력 둘을 **한 덩어리**로 묶는다. 같은 값을 정하는 두 방법이라 떨어져 있으면
            서로 다른 기능처럼 보인다. */}
        <div className="opsp__inputs">
          <label className="opsp__in">
            <span className="opsp__unit">¥</span>
            <input
              aria-label={copy.panelAmount}
              inputMode="numeric"
              onChange={(event) => onAmount(event.target.value)}
              placeholder={copy.panelAmount}
              value={amountText}
            />
          </label>
          <label className="opsp__in pct">
            <input
              aria-label={copy.panelPercent}
              inputMode="numeric"
              onChange={(event) => {
                const value = Number.parseInt(event.target.value.replace(/[^\d-]/g, ""), 10);
                if (Number.isFinite(value)) onPercent(value);
                else {
                  setPercentText(event.target.value);
                  setInput(null);
                }
              }}
              placeholder={copy.panelPercent}
              value={percentText}
            />
            <span className="opsp__unit">%</span>
          </label>
        </div>

        <div className="opsp__presets">
          {PERCENT_PRESETS.map((preset) => (
            <button
              className={`opsp__preset${input?.kind === "percent" && input.percent === preset ? " on" : ""}`}
              key={preset}
              onClick={() => onPercent(preset)}
              type="button"
            >
              {preset > 0 ? `+${preset}` : preset}
            </button>
          ))}
        </div>

        <span className="opsp__spacer" />

        {/* 「현재 → 변경」. 이 줄이 이 패널에서 가장 중요하다 — 무엇을 바꾸는지 모르고
            누르는 일을 막는 것이 확인 단계의 전부다. 퍼센트는 칸마다 결과가 달라 범위로 쓴다. */}
        <span className="opsp__sum">
          <span className="opsp__cur">{yen(preview.currentAverage)}</span>
          <span className="opsp__arrow">→</span>
          <strong className="opsp__new">
            {input && preview.rows.length > 0
              ? preview.newMin === preview.newMax
                ? yen(preview.newMin)
                : `${yen(preview.newMin)} ~ ${yen(preview.newMax)}`
              : "—"}
          </strong>
        </span>

        {confirming ? (
          <div className="opsp__acts">
            <button className="opsp__cancel" onClick={() => setConfirming(false)} type="button">
              {copy.panelCancel}
            </button>
            <button className="opsp__go on" disabled={pending} onClick={apply} type="button">
              {copy.panelConfirm}
            </button>
          </div>
        ) : (
          <div className="opsp__acts">
            <button
              className="opsp__go"
              disabled={!input || preview.changedCount === 0 || pending}
              onClick={() => setConfirming(true)}
              type="button"
            >
              {copy.panelApply}
            </button>
          </div>
        )}
      </div>

      {/* 아래 줄은 **할 말이 있을 때만** 뜬다. 빈 줄이 자리만 차지하면 격자가 밀린다. */}
      {(confirming ||
        message ||
        warnings.length > 0 ||
        gapCells.length > 0 ||
        preview.skippedNoPrice > 0 ||
        (input !== null && preview.changedCount === 0)) && (
        <div className="opsp__row opsp__notes">
          {confirming && (
            <span className="opsp__confirm">
              {copy.panelConfirmBody
                .replace("{count}", String(preview.changedCount))
                .replace("{rooms}", String(roomCount))}
            </span>
          )}
          {input !== null && preview.changedCount === 0 && (
            <span className="opsp__warn">{copy.panelNoChange}</span>
          )}
          {preview.skippedNoPrice > 0 && (
            <span className="opsp__skip">
              {copy.panelSkippedNoPrice.replace("{count}", String(preview.skippedNoPrice))}
            </span>
          )}
          {warnings.map((warning) => (
            <span className="opsp__warn" key={warning}>
              {warningText(warning)}
            </span>
          ))}
          {message && <span className="opsp__msg">{message}</span>}

          {/* 1박 갭이 선택에 들어 있으면 그 자리에서 고칠 수 있어야 한다 —
              찾아만 주고 못 고치면 오히려 일이 한 단계 는다. */}
          {gapCells.length > 0 && (
            <>
              <span className="opsp__spacer" />
              <span className="opsp__gaptext">
                {copy.gapActionBody.replace("{count}", String(gapCells.length))}
              </span>
              <button
                className="opsp__gapgo"
                disabled={pending}
                onClick={applyOneNight}
                type="button"
              >
                {copy.gapAction}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
