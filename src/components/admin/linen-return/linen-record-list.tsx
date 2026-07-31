"use client";

// Admin 린넨 반품 콘솔 — 「기록」 뷰. 한 행 = 현장에서 등록된 반품 한 건.
// 행을 잘라서 애매한 단일 품목으로 보이게 하지 않는다: 요약 아래에 항상 전체 품목·수량을 나열하고,
// 품목 필터가 걸리면 해당 품목만 강조 + 전용 수량 열을 덧붙인다.
// See docs/product/19-linen-defect-workflow.md → "Required Information".

import { ChevronRight } from "lucide-react";
import type { AdminLinenRecordVM } from "@/lib/admin-linen-returns";
import type { Dictionary } from "@/lib/i18n";
import {
  avatarColorFor,
  dayOf,
  fmtDate,
  initialOf,
  quantityOfItem,
  summaryOf,
  timeOf,
  tpl,
  weekdayLabel,
} from "./linen-console-data";

export type LinenCopy = Dictionary["linenReturn"];

type Props = {
  records: AdminLinenRecordVM[];
  t: LinenCopy["console"];
  units: Pick<LinenCopy, "quantityUnit" | "kindsUnit" | "summaryMore">;
  localeTag: string;
  /** linen_items.id 또는 "all" — 강조/전용 열 기준. */
  itemFilter: string;
  itemFilterName: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function LinenRecordList({
  records,
  t,
  units,
  localeTag,
  itemFilter,
  itemFilterName,
  selectedId,
  onSelect,
}: Props) {
  const showItemColumn = itemFilter !== "all";
  const totalQuantity = records.reduce((sum, r) => sum + r.totalQuantity, 0);
  const itemQuantity = showItemColumn
    ? records.reduce((sum, r) => sum + quantityOfItem(r, itemFilter), 0)
    : 0;

  return (
    <>
      <div className="hmeta">
        <b style={{ color: "var(--ink-soft)" }}>{tpl(t.metaRecordCount, { n: records.length })}</b>
        <span className="sep" />
        {tpl(t.metaTotal, { n: `${totalQuantity}${units.quantityUnit}` })}
        {showItemColumn ? (
          <>
            <span className="sep" />
            {`${itemFilterName} ${itemQuantity}${units.quantityUnit}`}
          </>
        ) : null}
        <span className="sep" />
        {t.sortLatest}
      </div>

      <div className="card" style={{ overflow: "auto" }}>
        <table className="qtbl mtbl mtbl--linen">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{t.colRegisteredAt}</th>
              <th>{t.colBuilding}</th>
              <th>{t.colItems}</th>
              {showItemColumn ? <th className="num-h">{itemFilterName}</th> : null}
              <th className="num-h">{t.colTotalQty}</th>
              <th>{t.colRegistrant}</th>
              <th className="colchev" />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const day = dayOf(record.registeredAt);
              return (
                <tr
                  className={selectedId === record.id ? "sel" : ""}
                  key={record.id}
                  onClick={() => onSelect(record.id)}
                >
                  <td style={{ paddingLeft: 16 }}>
                    <span className="mono">
                      {fmtDate(day)} {timeOf(record.registeredAt)}
                    </span>
                    <div className="wdsub">{weekdayLabel(day, localeTag)}</div>
                  </td>
                  <td>
                    <span className="issue">{record.buildingName}</span>
                  </td>
                  <td>
                    <span className="tt-title">
                      {summaryOf(record, units.summaryMore, units.kindsUnit)}
                    </span>
                    <div className="tt-items">
                      {record.lines.map((line, index) => (
                        <span key={line.itemId}>
                          {index > 0 ? <span className="dotsep">·</span> : null}
                          <span className={line.itemId === itemFilter ? "hit" : undefined}>
                            {line.name} {line.quantity}
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                  {showItemColumn ? (
                    <td className="num num--hit">
                      {quantityOfItem(record, itemFilter)}
                      <span className="u">{units.quantityUnit}</span>
                    </td>
                  ) : null}
                  <td className="num">
                    {record.totalQuantity}
                    <span className="u">{units.quantityUnit}</span>
                  </td>
                  <td>
                    <span className="who">
                      <span
                        className="who__av"
                        style={{ background: avatarColorFor(record.registeredById) }}
                      >
                        {initialOf(record.registrantName)}
                      </span>
                      <span>
                        <span className="who__nm">{record.registrantName}</span>
                        <span className="who__sub" style={{ display: "block" }}>
                          {record.buildingName}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="colchev">
                    <span className="ic">
                      <ChevronRight aria-hidden="true" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
