"use client";

import { useMemo, useState, useTransition } from "react";
import {
  submitMinStayChange,
  submitPriceChange,
  type PriceChangeCell,
} from "@/app/admin/ops/calendar/actions";
import type { PriceChangeError } from "@/app/admin/ops/calendar/actions";
import {
  outcomeText as writeOutcomeText,
  type OpsWriteOutcome,
  type OpsWriteOutcomeCopy,
  type RunOpsWrite,
} from "@/components/admin/ops/ops-write-tracker";
import {
  amountFromPercent,
  buildAdjustmentPreview,
  findAdjustmentWarnings,
  percentFromAmount,
  PERCENT_PRESETS,
  type AdjustmentInput,
} from "@/lib/ops-price-adjustment";

/**
 * 가격·최소숙박 조작 패널 — **격자 오른쪽 세로 카드**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「조정 방식 두 가지」
 * 시안: Claude Design 「StayOps 운영 관리자 영역」 `3-select.dc.html`
 *
 * ## 왜 옆인가
 *
 * 위에 가로로 두면 그만큼 격자가 아래로 밀린다. **가격을 고칠 때야말로 객실을 아래까지 길게
 * 봐야 한다.** 옆에 두면 세로를 0 먹고, 대신 숫자·제외 목록·설명을 세로로 쌓을 수 있다.
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

export type PanelCopy = OpsWriteOutcomeCopy & {
  panelTitle: string;
  panelAmount: string;
  panelPercent: string;
  panelCurrent: string;
  panelNext: string;
  panelApply: string;
  panelCancel: string;
  panelConfirm: string;
  panelConfirmBody: string;
  panelNoChange: string;
  panelIdle: string;
  panelHint: string;
  /** 「다음 · {count}칸 확인」 — 확인 단계로 넘어가는 버튼. */
  panelGo: string;
  panelTarget: string;
  panelExcluded: string;
  panelChannelNote: string;
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

/** 패널 머리말에 뜨는 「무엇을 고치는가」. */
export type PanelScopeSummary = { rooms: string; dates: string };

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
  clearLabel,
  copy,
  onClear,
  runWrite,
  scopeSummary,
}: {
  cells: PanelCell[];
  clearLabel: string;
  copy: PanelCopy;
  onClear: () => void;
  /** 격자가 흐린 값 → 접수 → 반영 대기 → 데이터 다시 받기를 맡는다(`ops-write-tracker.ts`). */
  runWrite: RunOpsWrite;
  scopeSummary: PanelScopeSummary | null;
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
  /** 현재 평균 대비 몇 %인가. 금액을 직접 썼을 때 배지로 보여준다. */
  const deltaPercent =
    input && preview.rows.length > 0
      ? percentFromAmount(preview.currentAverage, preview.newAverage)
      : null;

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

  /**
   * 「반영 완료」는 **Beds24 에 실제로 들어간 뒤에** 띄운다. 예전에는 접수만 되면 바로 「반영
   * 완료」라고 했는데, 그때는 아직 큐에 있을 뿐이었다(2026-09-28).
   */
  const reportSettled = (settled: Promise<OpsWriteOutcome> | null) => {
    void settled?.then((outcome) => setMessage(writeOutcomeText(copy.panelDone, copy, outcome)));
  };

  const apply = () => {
    if (!input) return;
    const rows = preview.rows;
    const cellsToSend = toRequestCells();
    const sentInput = input;
    setMessage(copy.panelQueued);
    setConfirming(false);
    startTransition(async () => {
      // 흐린 새 값은 격자가 **보내기 전에** 그린다(저쪽도 같은 이유로 낙관적 표시를 앞으로 당겼다).
      const { result, settled } = await runWrite(
        "price",
        rows.map((row) => ({ key: `${row.roomKey}|${row.date}`, value: row.newPrice })),
        () => submitPriceChange({ cells: cellsToSend, input: sentInput }),
      );
      if (!result.ok) {
        setMessage(copy.panelFailed.replace("{error}", errorText(copy, result.error)));
        return;
      }
      reset();
      // **보낸 칸은 선택에서 뺀다**(2026-09-30 버그) — 남겨 두면 다음에 한 칸을 눌렀을 때 앞서 보낸
      // 칸까지 같이 잡혀 「5칸 저장」이 되고, 요약에서 새로 누른 객실이 「외 N」에 가려진다.
      // 결과 문구(반영됨·실패)는 패널에 그대로 남는다.
      onClear();
      reportSettled(settled);
    });
  };

  /** 「1박으로」 — 이 기능의 본래 목적이다. 갭 칸의 최소 숙박일을 1로 만든다. */
  const applyOneNight = () => {
    if (gapCells.length === 0) return;
    setMessage(copy.panelQueued);
    const targets = gapCells;
    startTransition(async () => {
      const { result, settled } = await runWrite(
        "minStay",
        targets.map((cell) => ({ key: `${cell.roomKey}|${cell.date}`, value: 1 })),
        () =>
          submitMinStayChange({
            cells: targets.map((cell) => ({
              date: cell.date,
              roomIds: cell.roomIds,
              roomKey: cell.roomKey,
              roomLabel: cell.roomLabel,
            })),
            minStay: 1,
          }),
      );
      if (!result.ok) {
        setMessage(copy.panelFailed.replace("{error}", errorText(copy, result.error)));
        return;
      }
      onClear();
      reportSettled(settled);
    });
  };

  const warningText = (warning: string) =>
    warning === "zero" ? copy.warnZero : warning === "huge_drop" ? copy.warnDrop : copy.warnRise;

  const hasSelection = preview.rows.length > 0;

  return (
    <aside className="opsp">
      <div className="opsp__head">
        <div className="opsp__title">{copy.panelTitle}</div>
        {/* **무엇을 고치는가**를 먼저 적는다. 「9칸」만으로는 어느 방 어느 날인지 모른 채
            적용하게 되는데, 가격은 채널로 그대로 나간다. */}
        <div className="opsp__target">
          {scopeSummary ? (
            <>
              {scopeSummary.rooms}
              <br />
              {scopeSummary.dates}
            </>
          ) : (
            copy.panelIdle
          )}
        </div>
      </div>

      <div className="opsp__body">
        {/* 현재 평균 → 변경. 이 상자가 패널에서 가장 크다 — 무엇을 바꾸는지 모르고 누르는
            일을 막는 것이 확인 단계의 전부다. */}
        <div>
          <div className="opsp__box">
            <div className="opsp__cur">
              <div className="opsp__lbl">{copy.panelCurrent}</div>
              <div className="opsp__curv">{hasSelection ? yen(preview.currentAverage) : "—"}</div>
            </div>
            <div className="opsp__nx">
              <div className="opsp__lbl">
                {copy.panelNext}
                {deltaPercent !== null && (
                  <span className={`opsp__delta${deltaPercent < 0 ? " dn" : ""}`}>
                    {deltaPercent > 0 ? `+${deltaPercent}%` : `${deltaPercent}%`}
                  </span>
                )}
              </div>
              {/* 퍼센트는 칸마다 결과가 달라 **범위**로 쓴다. */}
              <div className="opsp__nxv">
                {input && hasSelection
                  ? preview.newMin === preview.newMax
                    ? yen(preview.newMin)
                    : `${yen(preview.newMin)} ~ ${yen(preview.newMax)}`
                  : "—"}
              </div>
            </div>
          </div>
          <div className="opsp__hint">{copy.panelHint}</div>
        </div>

        {/* 금액과 퍼센트는 같은 값을 정하는 **두 가지 방법**이라 한 덩어리로 둔다. */}
        <div className="opsp__inputs">
          <label className="opsp__in">
            <span className="opsp__unit">¥</span>
            <input
              aria-label={copy.panelAmount}
              disabled={!hasSelection}
              inputMode="numeric"
              onChange={(event) => onAmount(event.target.value)}
              placeholder={copy.panelAmount}
              value={amountText}
            />
          </label>
          <label className="opsp__in pct">
            <input
              aria-label={copy.panelPercent}
              disabled={!hasSelection}
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
              className={`opsp__preset${preset > 0 ? " up" : " dn"}${
                input?.kind === "percent" && input.percent === preset ? " on" : ""
              }`}
              disabled={!hasSelection}
              key={preset}
              onClick={() => onPercent(preset)}
              type="button"
            >
              {preset > 0 ? `+${preset}%` : `${preset}%`}
            </button>
          ))}
        </div>

        {/* 빠진 칸은 **개수가 아니라 이유**를 적는다 — 「아, 502호가 블록이었지」가 되어야 한다. */}
        {preview.skippedNoPrice > 0 && (
          <div className="opsp__note warn">
            <span className="opsp__dot" />
            <span>{copy.panelExcluded.replace("{count}", String(preview.skippedNoPrice))}</span>
          </div>
        )}

        {input !== null && preview.changedCount === 0 && (
          <div className="opsp__note warn">
            <span className="opsp__dot" />
            <span>{copy.panelNoChange}</span>
          </div>
        )}
        {warnings.map((warning) => (
          <div className="opsp__note danger" key={warning}>
            <span className="opsp__dot" />
            <span>{warningText(warning)}</span>
          </div>
        ))}

        {/* 1박 갭이 선택에 들어 있으면 그 자리에서 고칠 수 있어야 한다 —
            찾아만 주고 못 고치면 오히려 일이 한 단계 는다. */}
        {gapCells.length > 0 && (
          <button
            className="opsp__gapgo"
            disabled={pending}
            onClick={applyOneNight}
            type="button"
          >
            {copy.gapAction}
            <span className="opsp__gapn">{gapCells.length}</span>
          </button>
        )}

        <div className="opsp__grow" />

        {message && <div className="opsp__msg">{message}</div>}
        {/* 채널 규칙을 화면에 적어 둔다 — 「왜 부킹닷컴은 안 바뀌지?」가 나오지 않게. */}
        <div className="opsp__channel">{copy.panelChannelNote}</div>
      </div>

      <div className="opsp__foot">
        {confirming ? (
          <>
            <button className="opsp__btn" onClick={() => setConfirming(false)} type="button">
              {copy.panelCancel}
            </button>
            {/* 버튼은 짧게 — 「몇 칸 반영」만(2026-09-29 사용자 요청: 문장이 버튼에 두 줄로 차 거추장스러웠다).
                채널 규칙은 바로 위 안내 줄이 이미 말한다. */}
            <button className="opsp__btn go" disabled={pending} onClick={apply} type="button">
              {copy.panelConfirmBody.replace("{count}", String(preview.changedCount))}
            </button>
          </>
        ) : (
          <>
            <button
              className="opsp__btn"
              disabled={!hasSelection}
              // 적어 둔 금액도 같이 비운다 — 남겨 두면 다음에 고른 칸에 그 값이 그대로 걸린다.
              onClick={() => {
                reset();
                setMessage(null);
                onClear();
              }}
              title="Esc"
              type="button"
            >
              {clearLabel}
            </button>
            <button
              className="opsp__btn go"
              disabled={!input || preview.changedCount === 0 || pending}
              onClick={() => setConfirming(true)}
              type="button"
            >
              {copy.panelGo.replace("{count}", String(preview.changedCount))}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
