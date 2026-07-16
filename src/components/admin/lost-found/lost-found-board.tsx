"use client";

// Admin 분실물 console — 현황 보드. 3개 상태 컬럼(접수 / 보관중 / 폐기예정); 종결(반환·폐기)은 별도
// "완료"/"폐기 내역" 뷰에서만 본다. Mirrors maintenance-board.tsx.
import { Clock, MapPin, Search } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { AdminLostItemVM } from "@/lib/admin-lost-found";
import {
  BOARD_ORDER,
  LOST_STATUS,
  locationLabel,
  sortForBoard,
  tpl,
} from "./lost-found-console-data";
import {
  CATEGORY_ICON,
  CategoryChip,
  DdayBadge,
  ExtBadge,
  PhotoBadge,
  ReporterAvatar,
  STATUS_ICON,
  copyOf,
  type LFCopy,
} from "./lost-found-console-shared";

type BoardProps = {
  items: AdminLostItemVM[];
  t: LFCopy;
  locale: Locale;
  query: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearQuery: () => void;
};

function LFCard({
  item,
  t,
  selected,
  onSelect,
}: {
  item: AdminLostItemVM;
  t: LFCopy;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const cls = ["mcard", `is-${LOST_STATUS[item.status].cls}`, item.isExpired ? "is-expired" : "", selected ? "sel" : ""]
    .filter(Boolean)
    .join(" ");
  const CatIcon = CATEGORY_ICON[item.category];

  return (
    <div
      className={cls}
      onClick={() => onSelect(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
    >
      <div className="mcard__head">
        <span className="mcard__thumb">
          <span className="ic">
            <CatIcon aria-hidden="true" />
          </span>
        </span>
        <div className="mcard__hbody">
          <div className="mcard__top">
            <CategoryChip category={item.category} t={t} />
            <span className="mcard__sp" />
            {item.isExtended ? <ExtBadge t={t} /> : null}
            <PhotoBadge count={item.photoCount} t={t} />
          </div>
          <div className="mcard__title">{item.itemName}</div>
        </div>
      </div>
      <div className="mcard__mid">
        <span className="mcard__loc">
          <span className="ic">
            <MapPin aria-hidden="true" />
          </span>
          {item.room ? (
            <>
              <span className="mono">{item.room}</span> · {item.buildingLabel}
            </>
          ) : (
            `${item.buildingLabel} · ${t.buildingWhole}`
          )}
        </span>
        <DdayBadge item={item} t={t} />
      </div>
      <div className="mcard__foot">
        <span className="mcard__rep">
          <ReporterAvatar id={item.reporterId} name={item.reporterName} className="mcard__av" />
          <span>{item.reporterName}</span>
        </span>
        <span className={`mcard__el${item.isDueSoon ? " is-soon" : ""}`}>
          <span className="ic">
            <Clock aria-hidden="true" />
          </span>
          {tpl(t.storedFor, item.storedDays)}
        </span>
      </div>
    </div>
  );
}

export function LostFoundBoard({ items, t, query, selectedId, onSelect, onClearQuery }: BoardProps) {
  const q = query.trim().toLowerCase();
  const matched = items.filter((i) => {
    if (i.status === "disposed" || i.status === "returned") return false;
    if (!q) return true;
    return (
      i.itemName.toLowerCase().includes(q) ||
      locationLabel(i, t.buildingWhole).toLowerCase().includes(q) ||
      i.reporterName.toLowerCase().includes(q) ||
      (i.room ? i.room.toLowerCase().includes(q) : false)
    );
  });

  if (!matched.length) {
    return (
      <div className="card">
        <div className="state">
          <div className="state__ic empty">
            <Search aria-hidden="true" />
          </div>
          <div className="state__t">{t.emptyBoardT}</div>
          <div className="state__s">{t.emptyBoardS}</div>
          {q ? (
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 16 }} onClick={onClearQuery}>
              {t.clearFilter}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mboard-wrap">
      <div className="mbkgrid">
        {BOARD_ORDER.map((status) => {
          const meta = LOST_STATUS[status];
          const Icon = STATUS_ICON[status];
          const col = sortForBoard(matched.filter((i) => i.status === status));
          return (
            <section className={`mbkcol mbkcol--${meta.cls}`} key={status}>
              <div className="mbkcol__h">
                <span className="mbkcol__ic">
                  <span className="ic">
                    <Icon aria-hidden="true" />
                  </span>
                </span>
                <span className="mbkcol__t">{copyOf(t, meta.key)}</span>
                <span className="mbkcol__c">{col.length}</span>
              </div>
              <div className="mbkcol__body">
                {col.length ? (
                  col.map((i) => (
                    <LFCard key={i.id} item={i} t={t} selected={selectedId === i.id} onSelect={onSelect} />
                  ))
                ) : (
                  <div className="mnone">{t.colNone}</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
