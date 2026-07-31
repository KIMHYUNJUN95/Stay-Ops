"use client";

// Admin 린넨 반품 콘솔 — 「품목별 수량」 뷰. 같은 기간·건물·등록자 조건의 기록을 품목별로 합산한
// 대조표다. 품목 필터는 이 뷰에서 의도적으로 무시하고(항상 전체 품목 기준), 대신 행을 누르면
// 그 품목으로 「기록」 뷰를 좁혀 준다. 반품이 없던 품목도 0으로 남겨 누락과 구분한다.

import { ChevronRight } from "lucide-react";
import type { AdminLinenItemOption, AdminLinenRecordVM } from "@/lib/admin-linen-returns";
import {
  aggregateByItem,
  fmtDateTime,
  quantityByItemOf,
  tpl,
  type ItemAggregate,
} from "./linen-console-data";
import type { LinenCopy } from "./linen-record-list";

type Props = {
  /** 현재 조건(기간·건물·등록자)으로 좁혀진 기록. */
  records: AdminLinenRecordVM[];
  /** 같은 기간·등록자 조건의 전체 건물 기록 — 건물을 좁혔을 때 대조 열에 쓴다. */
  allBuildingRecords: AdminLinenRecordVM[];
  catalog: AdminLinenItemOption[];
  t: LinenCopy["console"];
  units: Pick<LinenCopy, "quantityUnit" | "countUnit">;
  /** "all" 이 아니면 건물을 좁힌 상태. */
  building: string;
  selectedItem: string;
  onSelectItem: (itemId: string) => void;
};

export function LinenItemSummary({
  records,
  allBuildingRecords,
  catalog,
  t,
  units,
  building,
  selectedItem,
  onSelectItem,
}: Props) {
  const rows: ItemAggregate[] = aggregateByItem(records, catalog);
  const max = rows[0]?.quantity || 1;
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const returnedKinds = rows.filter((row) => row.quantity > 0).length;

  const scoped = building !== "all";
  const allQuantities = scoped ? quantityByItemOf(allBuildingRecords) : null;
  const allTotal = scoped ? allBuildingRecords.reduce((sum, r) => sum + r.totalQuantity, 0) : 0;

  return (
    <>
      <div className="hmeta">
        <b style={{ color: "var(--ink-soft)" }}>
          {tpl(t.metaItemKinds, { n: returnedKinds, total: rows.length })}
        </b>
        <span className="sep" />
        {scoped ? `${building} ` : ""}
        {tpl(t.metaRecords, { n: records.length })}
        <span className="sep" />
        {tpl(t.metaTotal, { n: `${totalQuantity}${units.quantityUnit}` })}
        {scoped ? (
          <span style={{ color: "var(--faint)", marginLeft: 5 }}>
            {tpl(t.metaAllBuildings, { n: `${allTotal}${units.quantityUnit}` })}
          </span>
        ) : null}
        <span className="sep" />
        {t.sortQty}
      </div>

      <div className="card" style={{ overflow: "auto" }}>
        <table className="qtbl mtbl mtbl--linen">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{t.colItem}</th>
              <th className="num-h">{scoped ? building : t.colQty}</th>
              <th />
              {scoped ? <th className="num-h">{t.colAllBuildings}</th> : null}
              <th className="num-h">{t.colRecordCount}</th>
              <th>{t.colLastReturn}</th>
              <th className="colchev" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const zero = row.quantity === 0;
              return (
                <tr
                  className={`${selectedItem === row.itemId ? "sel" : ""}${zero ? " is-zero" : ""}`}
                  key={row.itemId}
                  onClick={() => {
                    if (!zero) onSelectItem(row.itemId);
                  }}
                >
                  <td style={{ paddingLeft: 16 }}>
                    <span className="tt-title">{row.name}</span>
                  </td>
                  <td className="num">
                    {row.quantity}
                    <span className="u">{units.quantityUnit}</span>
                  </td>
                  <td style={{ width: 170 }}>
                    <span className="pbar" style={{ width: 150 }}>
                      <i style={{ width: `${Math.round((row.quantity / max) * 100)}%` }} />
                    </span>
                  </td>
                  {scoped ? (
                    <td className="num dim-cell">
                      {allQuantities?.get(row.itemId) ?? 0}
                      <span className="u">{units.quantityUnit}</span>
                    </td>
                  ) : null}
                  <td className="num">
                    {row.recordCount}
                    <span className="u">{units.countUnit}</span>
                  </td>
                  <td className="dim-cell mono">{row.lastAt ? fmtDateTime(row.lastAt) : "—"}</td>
                  <td className="colchev">
                    {zero ? null : (
                      <span className="ic">
                        <ChevronRight aria-hidden="true" />
                      </span>
                    )}
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
