"use client";

import { useMemo, useState, useTransition } from "react";
import { submitPriceChange, type PriceChangeCell, type PriceChangeError } from "@/app/admin/ops/calendar/actions";
import type { PanelCell, PanelCopy, PanelScopeSummary } from "@/components/admin/ops/ops-price-panel";
import type { OpsWriteOutcome, RunOpsWrite } from "@/components/admin/ops/ops-write-tracker";
import {
  amountFromPercent,
  buildAdjustmentPreview,
  findAdjustmentWarnings,
  percentFromAmount,
  PERCENT_PRESETS,
  type AdjustmentInput,
} from "@/lib/ops-price-adjustment";

/**
 * 모바일 가격 시트 — Claude Design 시안 `3a 가격 시트 v3`(2026-10-02 사용자 확정).
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「모바일 판매 캘린더」 → 가격 시트 v3
 *
 * **계산 · 서버 경로는 데스크톱 가격 패널(`OpsPricePanel`)과 같다** — 같은 미리보기(`buildAdjustmentPreview`),
 * 같은 경고(`findAdjustmentWarnings`), 같은 서버 액션(`submitPriceChange`) · 같은 쓰기 추적(`runWrite`). 모양만
 * 모바일 시안으로 다시 그렸다:
 *
 * - 머리: 무엇을 고치는가(건물 · 객실 / 날짜 · 박) + 칸 수.
 * - 현재 · 변경 상자: 둘 다 범위(최저 ~ 최고) + 평균.
 * - 금액 | % 두 칸 + 프리셋 4 × 2(8번째 = 「지우기」). 같은 프리셋을 다시 누르면 해제.
 * - 입력 전에도 **같은 「다음 · N칸 확인」 버튼을 흐리게**(문구를 바꾸지 않는다 — 사용자 지시).
 * - 확인 단계: 위에 요약 카드(경고가 있으면 빨강 · 버튼도 빨강).
 * - 키보드가 떠도 프리셋은 그대로 둔다(2026-10-02 사용자 지시 — 시안 3d 의 「접기」는 뺐다). 시트 높이는 고정이라 값이
 *   바뀌어도 위 끝이 오르내리지 않는다(부모가 `h-[88dvh]`).
 * - **「1박으로」는 없다** — 1박 갭 고치기는 최소숙박 시트에서만(2026-10-02 사용자 지시).
 * - 접수되면 부모가 시트를 닫고 탭 바 위 알림으로 진행 → 완료(되돌리기) / 실패(이력 보기)를 보여 준다.
 */

export type MobilePriceSheetCopy = PanelCopy & {
  mSelCount: string;
  mpClearInput: string;
  mpConfirmHead: string;
  mpAvgDelta: string;
  mpSameValue: string;
  mpPerCell: string;
  mpSkipped: string;
  scopeClear: string;
};

export type MobilePriceSubmitted = {
  jobId: string;
  count: number;
  settled: Promise<OpsWriteOutcome> | null;
};

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

/** 입력칸 표시용 — 숫자만 남겨 쉼표를 넣는다. */
const formatAmountText = (text: string) => {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits).toLocaleString("ja-JP") : "";
};

const shortDate = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
const signedPercent = (value: number) => (value > 0 ? `+${value}%` : value < 0 ? `−${Math.abs(value)}%` : "0%");

/** 기기 키보드의 「완료」(Enter)로 키보드를 내린다. */
const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter") event.currentTarget.blur();
};

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

type ListRow = { date: string; current: number | null; next: number | null };
type ListRoom = { key: string; label: string; rows: ListRow[] };
type ListBuilding = { name: string; rooms: ListRoom[] };

/** 고른 칸을 건물 → 객실 → 날짜로 묶는다(데스크톱 「선택한 칸」 목록과 같은 순서). */
function groupSelection(cells: readonly PanelCell[], nextByCell: ReadonlyMap<string, number>): ListBuilding[] {
  const buildings: ListBuilding[] = [];
  const buildingByName = new Map<string, ListBuilding>();
  const roomByKey = new Map<string, ListRoom>();
  for (const cell of cells) {
    const separator = cell.roomKey.indexOf("::");
    const name = separator >= 0 ? cell.roomKey.slice(0, separator) : "";
    let building = buildingByName.get(name);
    if (!building) {
      building = { name, rooms: [] };
      buildingByName.set(name, building);
      buildings.push(building);
    }
    let room = roomByKey.get(cell.roomKey);
    if (!room) {
      room = { key: cell.roomKey, label: cell.roomLabel, rows: [] };
      roomByKey.set(cell.roomKey, room);
      building.rooms.push(room);
    }
    room.rows.push({ current: cell.price, date: cell.date, next: nextByCell.get(`${cell.roomKey}|${cell.date}`) ?? null });
  }
  for (const room of roomByKey.values()) room.rows.sort((a, b) => a.date.localeCompare(b.date));
  return buildings;
}

export function MobileOpsPriceSheet({
  cells,
  copy,
  onApplied,
  onClear,
  onSubmitted,
  runWrite,
  scopeSummary,
}: {
  cells: PanelCell[];
  copy: MobilePriceSheetCopy;
  /** 보낸 칸만 선택에서 뺀다(데스크톱과 같다). */
  onApplied: (sentCells: { roomKey: string; date: string }[]) => void;
  /** 「선택 해제」 — 선택을 비우고 시트를 닫는다. */
  onClear: () => void;
  /** 접수 성공 — 부모가 시트를 닫고 알림을 띄운다. */
  onSubmitted: (submitted: MobilePriceSubmitted) => void;
  runWrite: RunOpsWrite;
  scopeSummary: PanelScopeSummary | null;
}) {
  const [input, setInput] = useState<AdjustmentInput | null>(null);
  const [amountText, setAmountText] = useState("");
  const [percentText, setPercentText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(
    () =>
      buildAdjustmentPreview(
        cells.map((cell) => ({ date: cell.date, price: cell.price, roomKey: cell.roomKey, roomLabel: cell.roomLabel })),
        input ?? { amount: 0, kind: "amount" },
      ),
    [cells, input],
  );
  const listBuildings = useMemo(() => {
    const nextByCell = new Map<string, number>();
    if (input) for (const row of preview.rows) nextByCell.set(`${row.roomKey}|${row.date}`, row.newPrice);
    return groupSelection(cells, nextByCell);
  }, [cells, input, preview]);
  const warnings = useMemo(() => (input ? findAdjustmentWarnings(preview) : []), [input, preview]);
  const currentRange = useMemo(() => {
    if (preview.rows.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const row of preview.rows) {
      min = Math.min(min, row.currentPrice);
      max = Math.max(max, row.currentPrice);
    }
    return { max, min };
  }, [preview]);

  const hasPriced = preview.rows.length > 0;
  const deltaPercent = input && hasPriced ? percentFromAmount(preview.currentAverage, preview.newAverage) : null;
  const roomCount = listBuildings.reduce((sum, building) => sum + building.rooms.length, 0);
  // 버튼 숫자 — 입력 전에는 「바꿀 수 있는 칸」(요금 있는 칸), 입력 뒤에는 실제로 바뀌는 칸.
  const goCount = input ? preview.changedCount : preview.rows.length;
  const canGo = input !== null && preview.changedCount > 0 && !pending;
  const danger = warnings.length > 0;

  const onAmount = (text: string) => {
    setAmountText(text);
    setError(null);
    const amount = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(amount)) {
      setInput(null);
      setPercentText("");
      return;
    }
    setInput({ amount, kind: "amount" });
    const percent = percentFromAmount(preview.currentAverage, amount);
    setPercentText(percent === null ? "" : String(percent));
  };
  const onPercent = (value: number) => {
    setError(null);
    setPercentText(String(value));
    setInput({ kind: "percent", percent: value });
    const amount = amountFromPercent(preview.currentAverage, value);
    setAmountText(amount === null ? "" : String(amount));
  };
  const clearInput = () => {
    setInput(null);
    setAmountText("");
    setPercentText("");
    setConfirming(false);
  };

  const apply = () => {
    if (!input) return;
    const rows = preview.rows;
    const count = preview.changedCount;
    const sentInput = input;
    const cellsToSend: PriceChangeCell[] = cells.map((cell) => ({
      currentPrice: cell.price,
      date: cell.date,
      roomIds: cell.roomIds,
      roomKey: cell.roomKey,
      roomLabel: cell.roomLabel,
    }));
    setError(null);
    startTransition(async () => {
      const { result, settled } = await runWrite(
        "price",
        rows.map((row) => ({ key: `${row.roomKey}|${row.date}`, value: row.newPrice })),
        () => submitPriceChange({ cells: cellsToSend, input: sentInput }),
      );
      if (!result.ok) {
        setConfirming(false);
        setError(copy.panelFailed.replace("{error}", errorText(copy, result.error)));
        return;
      }
      onApplied(cellsToSend.map((cell) => ({ date: cell.date, roomKey: cell.roomKey })));
      onSubmitted({ count, jobId: result.jobId, settled });
    });
  };

  const range = (min: number, max: number) => (min === max ? yen(min) : `${yen(min)} ~ ${yen(max)}`);
  const confirmDetail = [
    deltaPercent !== null ? copy.mpAvgDelta.replace("{pct}", signedPercent(deltaPercent)) : null,
    input?.kind === "amount"
      ? copy.mpSameValue.replace("{n}", String(preview.changedCount))
      : input?.kind === "percent"
        ? copy.mpPerCell
        : null,
    preview.skippedNoPrice > 0 ? copy.mpSkipped.replace("{n}", String(preview.skippedNoPrice)) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const warningText = (warning: string) =>
    warning === "zero" ? copy.warnZero : warning === "huge_drop" ? copy.warnDrop : copy.warnRise;

  return (
    <div className="mps mops-vars">
      <div className="mps-body">
        <div className="mps-head">
          <div className="mps-head__t">
            <h3>{copy.panelTitle}</h3>
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

        {confirming && input ? (
          <>
            <div className={`mps-ok${danger ? " danger" : ""}`} role="status">
              <div className="mps-ok__k">
                {copy.mpConfirmHead
                  .replace("{total}", String(cells.length))
                  .replace("{n}", String(preview.changedCount))}
              </div>
              <div className="mps-ok__big">
                {currentRange ? range(currentRange.min, currentRange.max) : "—"} → {range(preview.newMin, preview.newMax)}
              </div>
              {confirmDetail && <div className="mps-ok__sm">{confirmDetail}</div>}
            </div>
            {warnings.map((warning) => (
              <div className="mps-note danger" key={warning}>
                <i aria-hidden="true" />
                {warningText(warning)}
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="mps-box">
              <div className="cur">
                <div className="mps-l">{copy.panelCurrent}</div>
                {/* 줄 수를 늘 같게(값 · 범위 끝 · 평균) — 값이 생기거나 범위가 하나로 모여도 상자 높이가 안 바뀐다
                    (2026-10-02 사용자 지적 「퍼센트를 누르면 위아래로 움직인다」). 빈 줄은 자리만 지킨다. */}
                <div className={`mps-v${currentRange ? "" : " dash"}`}>{currentRange ? yen(currentRange.min) : "—"}</div>
                <div className="mps-v2">
                  {currentRange && currentRange.max !== currentRange.min ? `~ ${yen(currentRange.max)}` : "\u00a0"}
                </div>
                <div className="mps-a">
                  {currentRange ? copy.panelAverage.replace("{price}", yen(preview.currentAverage)) : "\u00a0"}
                </div>
              </div>
              <div className="nx">
                <div className="mps-l">
                  {copy.panelNext}
                  {deltaPercent !== null && (
                    <span className={`mps-dl${deltaPercent < 0 ? " dn" : ""}`}>{signedPercent(deltaPercent)}</span>
                  )}
                </div>
                <div className={`mps-v${input && hasPriced ? "" : " dash"}`}>
                  {input && hasPriced ? yen(preview.newMin) : "—"}
                </div>
                <div className="mps-v2">
                  {input && hasPriced && preview.newMax !== preview.newMin ? `~ ${yen(preview.newMax)}` : "\u00a0"}
                </div>
                <div className="mps-a">
                  {input && hasPriced ? copy.panelAverage.replace("{price}", yen(preview.newAverage)) : "\u00a0"}
                </div>
              </div>
            </div>

            <div className="mps-in">
              <label className="mps-fi">
                <span className="u">¥</span>
                <input
                  aria-label={copy.panelAmount}
                  autoComplete="off"
                  disabled={!hasPriced}
                  enterKeyHint="done"
                  inputMode="numeric"
                  onChange={(event) => onAmount(event.target.value)}
                  onKeyDown={blurOnEnter}
                  placeholder={copy.panelAmount}
                  value={formatAmountText(amountText)}
                />
              </label>
              <label className="mps-fi pct">
                <input
                  aria-label={copy.panelPercent}
                  autoComplete="off"
                  disabled={!hasPriced}
                  enterKeyHint="done"
                  inputMode="numeric"
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value.replace(/[^\d-]/g, ""), 10);
                    if (Number.isFinite(value)) onPercent(value);
                    else {
                      setPercentText(event.target.value);
                      setInput(null);
                    }
                  }}
                  onKeyDown={blurOnEnter}
                  placeholder="0"
                  value={percentText}
                />
                <span className="u">%</span>
              </label>
            </div>
            {/* 안내는 늘 둔다 — 입력하자마자 사라지면 그만큼 아래가 위로 튀었다. */}
            <p className="mps-hint">{copy.panelHint}</p>

            <div className="mps-pre">
              {PERCENT_PRESETS.map((preset) => {
                const on = input?.kind === "percent" && input.percent === preset;
                return (
                  <button
                    aria-pressed={on}
                    className={`${preset > 0 ? "up" : "dn"}${on ? " on" : ""}`}
                    disabled={!hasPriced}
                    key={preset}
                    // 같은 프리셋을 다시 누르면 푼다(2026-10-01 사용자 요청).
                    onClick={() => (on ? clearInput() : onPercent(preset))}
                    type="button"
                  >
                    {signedPercent(preset)}
                  </button>
                );
              })}
              <button className="clr" disabled={!input} onClick={clearInput} type="button">
                {copy.mpClearInput}
              </button>
            </div>

            {preview.skippedNoPrice > 0 && (
              <div className="mps-note warn">
                <i aria-hidden="true" />
                {copy.panelExcluded.replace("{count}", String(preview.skippedNoPrice))}
              </div>
            )}
            {input !== null && hasPriced && preview.changedCount === 0 && (
              <div className="mps-note warn">
                <i aria-hidden="true" />
                {copy.panelNoChange}
              </div>
            )}
            {warnings.map((warning) => (
              <div className="mps-note danger" key={warning}>
                <i aria-hidden="true" />
                {warningText(warning)}
              </div>
            ))}
          </>
        )}

        {error && (
          <div className="mps-note danger" role="alert">
            <i aria-hidden="true" />
            {error}
          </div>
        )}

        <p className="mps-ch">{copy.panelChannelNote}</p>

        <section aria-label={copy.panelListTitle} className="mps-list">
          <div className="mps-lh">
            <b>{copy.panelListTitle}</b>
            <span>
              {copy.panelListRooms.replace("{rooms}", String(roomCount)).replace("{cells}", String(cells.length))}
            </span>
          </div>
          {listBuildings.map((building) => (
            <div key={building.name}>
              {listBuildings.length > 1 && <div className="mps-bn">{building.name}</div>}
              {building.rooms.map((room) => (
                <div key={room.key}>
                  <div className="mps-rn">{room.label}</div>
                  {room.rows.map((row) => {
                    const changed = row.current !== null && row.next !== null && row.next !== row.current;
                    return (
                      <div className="mps-r" key={row.date}>
                        <span className="d">{shortDate(row.date)}</span>
                        {row.current === null ? (
                          <span className="none">{copy.panelListNoPrice}</span>
                        ) : (
                          <>
                            <span className={`c${changed ? " old" : ""}`}>{yen(row.current)}</span>
                            <i aria-hidden="true">{changed ? "→" : ""}</i>
                            {changed && row.next !== null ? (
                              <b className={row.next > row.current ? "up" : "dn"}>{yen(row.next)}</b>
                            ) : (
                              <b />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>

      <div className="mps-foot">
        {confirming ? (
          <>
            <button className="mps-btn ghost" disabled={pending} onClick={() => setConfirming(false)} type="button">
              {copy.panelCancel}
            </button>
            <button className={`mps-btn main${danger ? " danger" : ""}`} disabled={!canGo} onClick={apply} type="button">
              {copy.panelConfirmBody.replace("{count}", String(preview.changedCount))}
            </button>
          </>
        ) : (
          <>
            <button className="mps-btn ghost" onClick={onClear} type="button">
              {copy.scopeClear}
            </button>
            {/* 입력 전에도 같은 버튼 · 같은 문구를 흐리게(사용자 지시) — 입력하면 그 자리에서 진해진다. */}
            <button className="mps-btn main" disabled={!canGo} onClick={() => setConfirming(true)} type="button">
              {copy.panelGo.replace("{count}", String(goCount))}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
