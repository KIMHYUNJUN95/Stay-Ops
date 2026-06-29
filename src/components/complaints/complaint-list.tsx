"use client";

import { useState } from "react";
import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformBadge, PlatformSource, RatingPill, PLATFORMS, type ComplaintPlatform } from "./cx-platform";
import { MobileFab } from "@/components/shell/mobile-fab";
import { getDictionary } from "@/lib/i18n";
import type { Complaint } from "@/lib/complaints";

// 목록 상단 필터칩에 노출할 플랫폼 (UI 단계에서 3개 고정; 추후 확장 가능)
const FILTERS: ("all" | ComplaintPlatform)[] = ["all", "airbnb", "booking", "direct"];

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(iso));
}

export function ComplaintList({
  locale,
  complaints,
  canCreate,
}: {
  locale: string;
  complaints: Complaint[];
  canCreate: boolean;
}) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const [filter, setFilter] = useState<"all" | ComplaintPlatform>("all");
  const [seg, setSeg] = useState<"open" | "resolved">("open");

  const openCount = complaints.filter((c) => c.status === "open").length;
  const resolvedCount = complaints.length - openCount;

  const rows = complaints.filter(
    (c) => c.status === seg && (filter === "all" || c.platform === filter),
  );

  return (
    <div className="cx">
      <div className="cx-lhead">
        <h2>{t.listTitle}</h2>
      </div>

      {/* Platform filter chips */}
      <div className="cx-fchips">
        {FILTERS.map((f) => {
          const on = filter === f;
          if (f === "all") {
            return (
              <button
                key={f}
                type="button"
                className={`cx-fchip${on ? " on" : ""}`}
                onClick={() => setFilter("all")}
              >
                {t.filterAll}
              </button>
            );
          }
          const p = PLATFORMS[f];
          return (
            <button
              key={f}
              type="button"
              className={`cx-fchip${on ? " on" : ""}`}
              onClick={() => setFilter(f)}
            >
              <span className="d" style={{ background: p.solid }} />
              {f === "direct" ? t.platformDirect : p.name}
            </button>
          );
        })}
      </div>

      {/* Open / Resolved segment */}
      <div className="cx-seg">
        <button type="button" className={seg === "open" ? "on" : ""} onClick={() => setSeg("open")}>
          {t.segOpen} <span className="cnt">{openCount}</span>
        </button>
        <button
          type="button"
          className={seg === "resolved" ? "on" : ""}
          onClick={() => setSeg("resolved")}
        >
          {t.segDone} <span className="cnt">{resolvedCount}</span>
        </button>
      </div>

      {/* Card list */}
      <div className="cx-list">
        {rows.length === 0 ? (
          <div className="cx-empty">—</div>
        ) : (
          rows.map((c) => (
            <Link key={c.id} href={`/mobile/complaints/${c.id}`} className="cx-card">
              <PlatformBadge plat={c.platform} />
              <div className="cx-card__b">
                <div className="cx-card__top">
                  <PlatformSource plat={c.platform} dict={dict} />
                  <RatingPill plat={c.platform} rating={c.rating} />
                  <span className="cx-card__date mono">{formatDate(c.createdAt, locale)}</span>
                </div>
                <div className="cx-card__t">{c.title}</div>
                <div className="cx-card__meta">
                  <CIc>{CxIcon.building}</CIc>
                  {c.propertyName ?? ""}
                  {c.roomLabel && (
                    <>
                      <span className="sep">·</span>
                      {c.roomLabel}
                    </>
                  )}
                  {c.guestName && (
                    <>
                      <span className="sep">·</span>
                      {c.guestName}
                    </>
                  )}
                </div>
              </div>
              <div className="cx-card__r">
                <span className={`cx-sdot ${c.status}`} />
                {c.imageUrls.length > 0 && (
                  <span className="imgi">
                    <CIc>{CxIcon.image}</CIc>
                  </span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      {canCreate && <MobileFab href="/mobile/complaints/new" label={t.createTitle} />}
    </div>
  );
}
