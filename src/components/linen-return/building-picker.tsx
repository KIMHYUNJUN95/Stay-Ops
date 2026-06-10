"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { cn } from "@/lib/utils";

type BuildingStat = { count: number; lastAt: string | null };

type BuildingPickerProps = {
  buildingLabels: Record<string, string>;
  buildings: string[];
  copy: Dictionary["linenReturn"];
  locale: Locale;
  stats: Record<string, BuildingStat>;
};

function formatShortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

export function BuildingPicker({
  buildingLabels,
  buildings,
  copy,
  locale,
  stats,
}: BuildingPickerProps) {
  const localized = useMemo(
    () =>
      buildings.map((name) => ({
        name,
        label: localizePropertyName(name, buildingLabels),
      })),
    [buildings, buildingLabels],
  );

  return (
    <div className="pb-4">
      <div className="mb-4 mt-1.5 px-0.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          {copy.eyebrow}
        </p>
        <h1 className="mt-1.5 text-[26px] font-black tracking-[-0.03em] text-foreground">
          {copy.pickerTitle}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.pickerSubtitle}</p>
      </div>

      {buildings.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 flex size-[60px] items-center justify-center rounded-[18px] bg-slate-50 text-slate-400">
            <Building2 className="size-7" aria-hidden="true" />
          </span>
          <p className="text-[15px] font-extrabold text-foreground">{copy.noBuildings}</p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{copy.noBuildingsSub}</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 px-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            <span>{copy.buildingsLabel}</span>
            <span className="rounded-full bg-slate-50 px-[7px] py-px font-mono text-[10.5px] font-semibold">
              {localized.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-[11px]">
            {localized.map((b) => {
              const stat = stats[b.name];
              const count = stat?.count ?? 0;
              return (
                <Link
                  className="group flex flex-col items-start rounded-[20px] border border-border bg-surface p-[15px] transition-all active:scale-[0.98] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.45)]"
                  href={`/mobile/linen-return/list?building=${encodeURIComponent(b.name)}`}
                  key={b.name}
                >
                  <span className="mb-3 flex size-[42px] items-center justify-center rounded-[13px] bg-primary/10 text-primary">
                    <Building2 className="size-[22px]" aria-hidden="true" />
                  </span>
                  <span className="text-[14.5px] font-extrabold leading-tight tracking-[-0.02em] text-foreground">
                    {b.label}
                  </span>
                  <span className="mt-[13px] flex w-full items-center justify-between gap-1.5 border-t border-slate-100 pt-[11px]">
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold",
                        count > 0 ? "text-muted-foreground" : "text-slate-400",
                      )}
                    >
                      {count > 0 && stat?.lastAt
                        ? `${copy.lastReturnLabel} ${formatShortDate(stat.lastAt, locale)}`
                        : copy.noRecordYet}
                    </span>
                    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary/10 px-[7px] font-mono text-[11px] font-bold text-primary">
                      {count}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
