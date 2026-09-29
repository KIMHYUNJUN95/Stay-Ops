"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type CellHistory, viewHistoryEntry } from "@/lib/ops-price-history";

/**
 * 가격 칸 호버 카드 — 「누가 언제 얼마에서 얼마로」.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「가격 이력 호버 카드」
 * 원본: STAY ARI Manager 가격 칸 툴팁(가격+minStay 머리, 증감액, 시각·작성자, 「외 N건」)
 *
 * 브라우저 `title` 을 대신한다 — 1초 늦게 뜨고, 글자만 늘어놓아 증감이 안 읽혔다.
 *
 * - **읽기 전용이다.** 포인터를 받지 않는다(`pointer-events: none`) — 격자 드래그를 가리면 안 된다.
 * - 칸 **아래**에 띄우고 자리가 없으면 위로 뒤집는다. 좌우는 화면 안으로 민다.
 * - `.ops` 안에 `absolute` 로 붙인다. 콘솔 색(`.adm`)·운영 색(`.ops`) 토큰을 그대로 물려받고,
 *   조상에 `transform` 이 있어도 `fixed` 처럼 어긋나지 않는다.
 */

export type CellHistoryCardCopy = {
  hcNow: string;
  hcPrice: string;
  hcMinStay: string;
  hcHistory: string;
  hcCount: string;
  minStay: string;
  historyMore: string;
  unknownUser: string;
};

const GAP = 6;
const EDGE = 8;

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

export function OpsCellHistoryCard({
  anchor,
  container,
  copy,
  currentMinStay,
  currentPrice,
  date,
  history,
  localeTag,
  roomTitle,
}: {
  /** 호버 중인 칸의 화면 좌표. */
  anchor: DOMRect;
  /** 카드를 붙일 `.ops` 요소. */
  container: HTMLElement;
  copy: CellHistoryCardCopy;
  currentMinStay: number | null;
  currentPrice: number | null;
  date: string;
  history: CellHistory;
  localeTag: string;
  roomTitle: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; side: "below" | "above" } | null>(null);

  // 크기를 재야 뒤집을지 안다 — 첫 그림은 숨긴 채로 재고 바로 자리를 잡는다.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { height, width } = card.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const below = anchor.bottom + GAP + height <= window.innerHeight - EDGE;
    const top = below ? anchor.bottom + GAP : Math.max(EDGE, anchor.top - GAP - height);
    const left = Math.min(
      Math.max(EDGE, anchor.left + anchor.width / 2 - width / 2),
      window.innerWidth - width - EDGE,
    );
    setPlace({ left: left - box.left, side: below ? "below" : "above", top: top - box.top });
  }, [anchor, container]);

  const [y, m, d] = date.split("-").map(Number);
  const dateLabel = new Intl.DateTimeFormat(localeTag, {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  const hidden = history.total - history.entries.length;
  const nights = (n: number) => copy.minStay.replace("{n}", String(n));

  return createPortal(
    <div
      className={`opshc${place ? ` is-${place.side}` : ""}`}
      ref={cardRef}
      role="tooltip"
      style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <div className="opshc__head">
        <div className="opshc__where">
          <span className="opshc__room">{roomTitle}</span>
          <span className="opshc__date">{dateLabel}</span>
        </div>
        <div className="opshc__now">
          <span className="opshc__nowlabel">{copy.hcNow}</span>
          <span className={`opshc__price${currentPrice === null ? " none" : ""}`}>
            {currentPrice === null ? "–" : yen(currentPrice)}
          </span>
          {currentMinStay !== null && <span className="opshc__ms">{nights(currentMinStay)}</span>}
        </div>
      </div>

      <div className="opshc__sub">
        <span>{copy.hcHistory}</span>
        <span className="opshc__count">{copy.hcCount.replace("{n}", String(history.total))}</span>
      </div>

      <ol className="opshc__list">
        {history.entries.map((entry, index) => {
          const view = viewHistoryEntry(entry);
          const show = (value: number | null) =>
            value === null ? "—" : view.field === "minStay" ? nights(value) : yen(value);
          const arrow = view.direction === "up" ? "▲" : view.direction === "down" ? "▼" : null;
          return (
            <li className={`opshc__item ${view.direction}${index === 0 ? " latest" : ""}`} key={`${entry.at}-${index}`}>
              <span aria-hidden="true" className="opshc__dot" />
              <div className="opshc__row">
                <span className={`opshc__kind ${view.field}`}>
                  {view.field === "minStay" ? copy.hcMinStay : copy.hcPrice}
                </span>
                <span className="opshc__vals">
                  <span className="opshc__from">{show(view.from)}</span>
                  <span aria-hidden="true" className="opshc__to-arrow">→</span>
                  <strong>{show(view.to)}</strong>
                </span>
              </div>
              {arrow && view.delta !== null && (
                <div className="opshc__chg">
                  {arrow}{" "}
                  {view.field === "minStay" ? nights(Math.abs(view.delta)) : yen(Math.abs(view.delta))}
                  {view.percent !== null && (
                    <em>
                      {view.percent > 0 ? "+" : view.percent < 0 ? "−" : ""}
                      {Math.abs(view.percent)}%
                    </em>
                  )}
                </div>
              )}
              <div className="opshc__meta">
                <span className="opshc__when">{view.when}</span>
                <span className={`opshc__by${view.fromBeds24 ? " beds24" : ""}`}>
                  {entry.by ?? copy.unknownUser}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {hidden > 0 && <div className="opshc__more">{copy.historyMore.replace("{count}", String(hidden))}</div>}
    </div>,
    container,
  );
}
