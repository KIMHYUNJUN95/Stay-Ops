"use client";

import { ChevronDown, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadOpsChangeHistory,
  loadOpsSendLog,
  sendPendingPriceJobs,
} from "@/app/admin/ops/calendar/actions";
import { useAdminPanelA11y } from "@/components/admin/shared/use-admin-panel-a11y";
import {
  appendChangeGroups,
  collapseCellRuns,
  SEND_STALL_MINUTES,
  type ChangeField,
  type ChangeGroup,
  type SendEntry,
  type ValueRange,
} from "@/lib/ops-history";
import { formatHistoryWhen } from "@/lib/ops-price-history";

/**
 * 판매 캘린더 「이력」 — 오른쪽 사이드 패널, 탭 둘.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「이력 · 전송 로그」
 *
 * - **변경 이력**: 수정 한 번 = 한 줄(우리 앱 + Beds24 에서 바뀐 것). 7일씩 거슬러 읽는다.
 * 상태·종류 수식 클래스는 **전부 `is-*`** 다 — `app`·`block` 같은 맨 이름은 콘솔 셸(`.adm .app`)·
 * Tailwind(`.block`)와 겹쳐 레이아웃이 통째로 깨졌다(2026-09-29).
 *
 * - **Beds24 전송**: 가격·최소숙박 작업과 차단 — 반영됨 · 일부 실패 · 실패 · 대기 · 보내는 중,
 *   실패한 객실과 사유. 대기가 `SEND_STALL_MINUTES` 를 넘으면 「안 나감」으로 빨갛게 세우고
 *   「지금 보내기」를 준다. 대기·진행 중인 줄이 있으면 몇 초마다 다시 읽는다.
 */

export type HistoryPanelCopy = {
  hsTitle: string;
  hsTabChanges: string;
  hsTabSend: string;
  hsSourceApp: string;
  hsSourceBeds24: string;
  hsCells: string;
  hsRooms: string;
  hsMore: string;
  hsMoreSend: string;
  hsEmptyWindow: string;
  hsEmptySend: string;
  hsTruncated: string;
  hsLoadFailed: string;
  hsRetry: string;
  hsShowCells: string;
  hsHideCells: string;
  hsCellsMore: string;
  hsDays: string;
  hsKindPrice: string;
  hsKindMinStay: string;
  hsKindBlock: string;
  hsKindUnblock: string;
  hsBlockOn: string;
  hsBlockOff: string;
  hsStatusQueued: string;
  hsStatusProcessing: string;
  hsStatusSucceeded: string;
  hsStatusPartial: string;
  hsStatusFailed: string;
  hsStalled: string;
  hsSendNow: string;
  hsSending: string;
  hsFinished: string;
  hsReasons: Record<string, string>;
  /** 「지금 보내기」 결과 — `sent` · `empty` · `cooldown`({n}초) · `lock_busy` · `lock_error` · `failed` · `forbidden`. */
  hsSendResult: Record<string, string>;
  minStay: string;
  unknownUser: string;
  rcClose: string;
};

const POLL_MS = 4_000;
const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
const shortDate = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;

/** 한 값 — 가격 ¥, 최소숙박 N박, 차단 1 = 차단 · 0 = 열림. */
function formatValue(value: number, field: ChangeField, copy: HistoryPanelCopy): string {
  if (field === "minStay") return copy.minStay.replace("{n}", String(value));
  if (field === "block") return value === 1 ? copy.hsBlockOn : copy.hsBlockOff;
  return yen(value);
}

function formatRange(range: ValueRange, field: ChangeField, copy: HistoryPanelCopy): string {
  if (!range) return "—";
  const one = (value: number) => formatValue(value, field, copy);
  return range.min === range.max ? one(range.min) : `${one(range.min)}~${one(range.max)}`;
}

function dateSpan(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  return from === to ? shortDate(from) : `${shortDate(from)}–${shortDate(to)}`;
}

/**
 * 「가부키초 202, 203, 302 · 9개 객실」 — 건물 이름은 **건물마다 한 번**. 방은 앞 3개까지.
 * `rooms` 는 `건물 방` 문자열이다(건물 이름에 공백이 있을 수 있어 **마지막** 공백으로 가른다).
 */
function roomsText(rooms: string[], copy: HistoryPanelCopy): string {
  const shown = rooms.slice(0, 3);
  const byProperty = new Map<string, string[]>();
  for (const name of shown) {
    const cut = name.lastIndexOf(" ");
    const property = cut > 0 ? name.slice(0, cut) : "";
    const room = cut > 0 ? name.slice(cut + 1) : name;
    byProperty.set(property, [...(byProperty.get(property) ?? []), room]);
  }
  const text = [...byProperty]
    .map(([property, list]) => [property, list.join(", ")].filter(Boolean).join(" "))
    .join(" / ");
  return rooms.length > shown.length ? `${text} · ${copy.hsRooms.replace("{n}", String(rooms.length))}` : text;
}

const kindOf = (field: ChangeField, copy: HistoryPanelCopy) =>
  field === "minStay" ? copy.hsKindMinStay : field === "block" ? copy.hsKindBlock : copy.hsKindPrice;

/**
 * 펼친 칸 표 — 방(번호순)마다, 이어진 날짜가 같은 값이면 한 줄(`collapseCellRuns`).
 * 건물이 하나뿐인 수정이면 건물 이름을 줄마다 되풀이하지 않는다(머리 줄에 이미 있다).
 */
function CellRunsTable({ copy, group }: { copy: HistoryPanelCopy; group: ChangeGroup }) {
  const runs = collapseCellRuns(group.cells);
  const singleProperty = new Set(runs.map((run) => run.property)).size <= 1;
  const show = (value: number | null, field: ChangeField) => (value === null ? "—" : formatValue(value, field, copy));
  const multiField = group.fields.length > 1;
  return (
    <table className="opshs__cells">
      <tbody>
        {runs.map((run) => (
          <tr key={`${run.property}-${run.room}-${run.field}-${run.dateFrom}`}>
            <th scope="row">
              {singleProperty ? run.room : [run.property, run.room].filter(Boolean).join(" ")}
              {multiField && (
                <span className={`opshs__cellkind is-${run.field}`}>
                  {kindOf(run.field, copy)}
                </span>
              )}
            </th>
            <td className="opshs__cdate">
              {dateSpan(run.dateFrom, run.dateTo)}
              {run.nights > 1 && <span className="opshs__cdays">{copy.hsDays.replace("{n}", String(run.nights))}</span>}
            </td>
            <td className="opshs__cval">
              <span className="opshs__from">{show(run.from, run.field)}</span>
              <span aria-hidden="true" className="opshs__arrow">→</span>
              <strong>{show(run.to, run.field)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
      {group.cellCount > group.cells.length && (
        <tfoot>
          <tr>
            <td colSpan={3}>{copy.hsCellsMore.replace("{n}", String(group.cellCount - group.cells.length))}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

type Loadable<T> = { status: "idle" | "loading" | "ready" | "error"; data: T };

type ChangesState = Loadable<{
  groups: ChangeGroup[];
  nextBefore: string | null;
  windowFrom: string | null;
  truncated: boolean;
}>;

/** 한 쪽을 받은 뒤의 상태. `before` 가 있으면 「더 보기」 — 붙인다(갈라진 수정은 합친다). */
function applyChanges(
  previous: ChangesState,
  result: Awaited<ReturnType<typeof loadOpsChangeHistory>>,
  before: string | null,
): ChangesState {
  if (!result.ok) return { ...previous, status: "error" };
  return {
    data: {
      groups: before ? appendChangeGroups(previous.data.groups, result.groups) : result.groups,
      nextBefore: result.nextBefore,
      truncated: previous.data.truncated || result.truncated,
      windowFrom: result.windowFrom,
    },
    status: "ready",
  };
}

export function OpsHistoryPanel({ copy, onClose }: { copy: HistoryPanelCopy; onClose: () => void }) {
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose);
  const [tab, setTab] = useState<"changes" | "send">("changes");

  // ── 변경 이력
  const [changes, setChanges] = useState<ChangesState>({ data: { groups: [], nextBefore: null, truncated: false, windowFrom: null }, status: "loading" });
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // 「불러오는 중」 표시는 **부르는 쪽**이 켠다(버튼 · 첫 상태) — 이펙트 안에서 바로 상태를 바꾸지 않는다.
  const loadChanges = useCallback(async (before: string | null) => {
    const result = await loadOpsChangeHistory({ before });
    setChanges((previous) => applyChanges(previous, result, before));
  }, []);

  // ── Beds24 전송
  const [sends, setSends] = useState<Loadable<{ entries: SendEntry[]; nextBefore: string | null }>>({
    data: { entries: [], nextBefore: null },
    status: "idle",
  });
  const [kicking, setKicking] = useState(false);
  const [sendResult, setSendResult] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const sendPagesRef = useRef(1);

  const loadSends = useCallback(async (before: string | null) => {
    const result = await loadOpsSendLog({ before });
    if (!result.ok) {
      setSends((previous) => ({ ...previous, status: "error" }));
      return;
    }
    setSends((previous) => ({
      data: {
        entries: before ? [...previous.data.entries, ...result.entries] : result.entries,
        nextBefore: result.nextBefore,
      },
      status: "ready",
    }));
  }, []);

  // 처음엔 변경 이력만 읽는다. 전송 탭은 처음 누를 때 읽는다 — 안 보는 탭까지 미리 읽을 이유가 없다.
  useEffect(() => {
    let alive = true;
    void loadOpsChangeHistory({ before: null }).then((result) => {
      if (!alive) return;
      setChanges((previous) => applyChanges(previous, result, null));
    });
    return () => {
      alive = false;
    };
  }, []);
  const openSendTab = () => {
    setTab("send");
    if (sends.status === "idle") {
      setSends((previous) => ({ ...previous, status: "loading" }));
      void loadSends(null);
    }
  };
  const reloadChanges = (before: string | null) => {
    setChanges((previous) => ({ ...previous, status: "loading" }));
    void loadChanges(before);
  };
  const reloadSends = (before: string | null) => {
    setSends((previous) => ({ ...previous, status: "loading" }));
    void loadSends(before);
  };

  // 대기·진행 중인 줄이 있으면 첫 쪽을 몇 초마다 다시 읽는다 — 「나갔나?」를 새로고침 없이 본다.
  const hasActive = sends.data.entries.some((entry) => entry.status === "queued" || entry.status === "processing");
  useEffect(() => {
    if (tab !== "send" || !hasActive || sendPagesRef.current > 1) return;
    const timer = window.setInterval(() => void loadSends(null), POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, loadSends, tab]);

  const stalled = sends.data.entries.some(
    (entry) => entry.waitingMinutes !== null && entry.waitingMinutes >= SEND_STALL_MINUTES,
  );

  // 첫 작업은 서버가 기다렸다 결과를 준다 — 반응이 없는 것처럼 보이면 사람은 계속 누른다.
  const sendNow = async () => {
    setKicking(true);
    setSendResult(null);
    const result = await sendPendingPriceJobs();
    const text = (copy.hsSendResult[result.outcome] ?? copy.hsSendResult.failed).replace(
      "{n}",
      String(result.cooldownSec ?? 0),
    );
    setSendResult({ text, tone: result.outcome === "sent" || result.outcome === "empty" ? "ok" : "warn" });
    await loadSends(null);
    setKicking(false);
  };

  const kindLabel = (entry: SendEntry) =>
    entry.kind === "minStay"
      ? copy.hsKindMinStay
      : entry.kind === "block"
        ? copy.hsKindBlock
        : entry.kind === "unblock"
          ? copy.hsKindUnblock
          : copy.hsKindPrice;
  const statusLabel = (entry: SendEntry) =>
    ({
      failed: copy.hsStatusFailed,
      partial: copy.hsStatusPartial,
      processing: copy.hsStatusProcessing,
      queued: copy.hsStatusQueued,
      succeeded: copy.hsStatusSucceeded,
    })[entry.status];

  return (
    <>
      <div className="panel-scrim" onClick={onClose} />
      <aside aria-label={copy.hsTitle} aria-modal="true" className="panel opshs" ref={panelRef} role="dialog" tabIndex={-1}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{copy.hsTitle}</span>
            <button aria-label={copy.rcClose} className="panel__x" onClick={onClose} type="button">
              <X />
            </button>
          </div>
          <div className="seg opshs__tabs" role="tablist">
            <button
              aria-selected={tab === "changes"}
              className={`segb${tab === "changes" ? " on" : ""}`}
              onClick={() => setTab("changes")}
              role="tab"
              type="button"
            >
              {copy.hsTabChanges}
            </button>
            <button
              aria-selected={tab === "send"}
              className={`segb${tab === "send" ? " on" : ""}`}
              onClick={openSendTab}
              role="tab"
              type="button"
            >
              {copy.hsTabSend}
              {stalled && <span aria-hidden="true" className="opshs__alertdot" />}
            </button>
          </div>
        </div>

        <div className="panel__body opshs__body">
          {tab === "changes" ? (
            <>
              {changes.status === "error" && (
                <div className="opshs__state">
                  {copy.hsLoadFailed}
                  <button className="opshs__link" onClick={() => reloadChanges(null)} type="button">
                    {copy.hsRetry}
                  </button>
                </div>
              )}
              {changes.data.truncated && <p className="opshs__note">{copy.hsTruncated}</p>}
              <ol className="opshs__list">
                {changes.data.groups.map((group) => {
                  const open = openGroups.has(group.id);
                  return (
                    <li className="opshs__item" key={group.id}>
                      <div className="opshs__meta">
                        <span className="opshs__when">{formatHistoryWhen(group.at)}</span>
                        {/* Beds24 에서 바뀐 줄은 작성자도 「Beds24」라 배지 하나로 충분하다. */}
                        {group.source === "app" && <span className="opshs__by">{group.by ?? copy.unknownUser}</span>}
                        <span className={`opshs__src is-${group.source}`}>
                          {group.source === "beds24" ? copy.hsSourceBeds24 : copy.hsSourceApp}
                        </span>
                      </div>
                      {group.fields.map((summary) => (
                        <div className="opshs__change" key={summary.field}>
                          <span className={`opshs__kind is-${summary.field}`}>{kindOf(summary.field, copy)}</span>
                          <span className="opshs__from">{formatRange(summary.from, summary.field, copy)}</span>
                          <span aria-hidden="true" className="opshs__arrow">→</span>
                          <strong>{formatRange(summary.to, summary.field, copy)}</strong>
                        </div>
                      ))}
                      <div className="opshs__scope">
                        {roomsText(group.rooms, copy)} · {dateSpan(group.dateFrom, group.dateTo)} ·{" "}
                        {copy.hsCells.replace("{n}", String(group.cellCount))}
                      </div>
                      <button
                        aria-expanded={open}
                        className="opshs__toggle"
                        onClick={() =>
                          setOpenGroups((previous) => {
                            const next = new Set(previous);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })
                        }
                        type="button"
                      >
                        {open ? copy.hsHideCells : copy.hsShowCells}
                        <ChevronDown className={open ? "is-open" : undefined} />
                      </button>
                      {open && (
                        <CellRunsTable copy={copy} group={group} />
                      )}
                    </li>
                  );
                })}
              </ol>
              {changes.status === "ready" && changes.data.groups.length === 0 && changes.data.windowFrom && (
                <p className="opshs__empty">
                  {copy.hsEmptyWindow.replace("{from}", shortDate(changes.data.windowFrom.slice(0, 10)))}
                </p>
              )}
              {changes.status === "loading" && <div className="opshs__loading" />}
              {changes.status === "ready" && changes.data.nextBefore && (
                <button
                  className="opshs__more"
                  onClick={() => reloadChanges(changes.data.nextBefore)}
                  type="button"
                >
                  {copy.hsMore}
                </button>
              )}
            </>
          ) : (
            <>
              {sends.status === "error" && (
                <div className="opshs__state">
                  {copy.hsLoadFailed}
                  <button className="opshs__link" onClick={() => reloadSends(null)} type="button">
                    {copy.hsRetry}
                  </button>
                </div>
              )}
              {stalled && (
                <div className="opshs__stall" role="status">
                  <span>{copy.hsStalled.replace("{n}", String(SEND_STALL_MINUTES))}</span>
                  <button className="opshs__sendnow" disabled={kicking} onClick={() => void sendNow()} type="button">
                    <RefreshCw className={kicking ? "is-spin" : undefined} />
                    {kicking ? copy.hsSending : copy.hsSendNow}
                  </button>
                </div>
              )}
              {sendResult && (
                <p className={`opshs__result is-${sendResult.tone}`} role="status">
                  {sendResult.text}
                </p>
              )}
              <ol className="opshs__list">
                {sends.data.entries.map((entry) => {
                  const stuck = entry.waitingMinutes !== null && entry.waitingMinutes >= SEND_STALL_MINUTES;
                  return (
                    <li className={`opshs__item is-send is-${entry.status}${stuck ? " is-stuck" : ""}`} key={entry.id}>
                      <div className="opshs__head">
                        <span className={`opshs__status is-${entry.status}${stuck ? " is-stuck" : ""}`}>
                          {statusLabel(entry)}
                          {entry.waitingMinutes !== null && entry.waitingMinutes > 0 && (
                            <em>{entry.waitingMinutes}′</em>
                          )}
                        </span>
                        <span className={`opshs__kind is-${entry.kind}`}>{kindLabel(entry)}</span>
                        {entry.values && (
                          <strong className="opshs__value">
                            {formatRange(entry.values, entry.kind === "minStay" ? "minStay" : "price", copy)}
                          </strong>
                        )}
                      </div>
                      <div className="opshs__scope">
                        {roomsText(entry.rooms, copy)} · {dateSpan(entry.dateFrom, entry.dateTo)} ·{" "}
                        {copy.hsCells.replace("{n}", String(entry.cellCount))}
                      </div>
                      <div className="opshs__meta">
                        <span className="opshs__when">{formatHistoryWhen(entry.at)}</span>
                        <span className="opshs__by">{entry.by ?? copy.unknownUser}</span>
                        {entry.finishedAt && entry.source === "job" && (
                          <span className="opshs__done">
                            {copy.hsFinished.replace("{time}", formatHistoryWhen(entry.finishedAt).slice(6))}
                          </span>
                        )}
                      </div>
                      {(entry.error || entry.failures.length > 0) && (
                        <div className="opshs__errors">
                          {entry.error && (
                            <div className="opshs__err">
                              {copy.hsReasons[entry.error] ?? entry.error}
                              {entry.detail && <span className="opshs__errdetail">{entry.detail}</span>}
                            </div>
                          )}
                          {entry.failures.map((failure, index) => (
                            <div className="opshs__err" key={`${failure.room}-${index}`}>
                              <b>{failure.room}</b>
                              <span className="opshs__errdetail">{failure.error}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {sends.status === "ready" && sends.data.entries.length === 0 && (
                <p className="opshs__empty">{copy.hsEmptySend}</p>
              )}
              {sends.status === "loading" && <div className="opshs__loading" />}
              {sends.status === "ready" && sends.data.nextBefore && (
                <button
                  className="opshs__more"
                  onClick={() => {
                    sendPagesRef.current += 1;
                    reloadSends(sends.data.nextBefore);
                  }}
                  type="button"
                >
                  {copy.hsMoreSend}
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
