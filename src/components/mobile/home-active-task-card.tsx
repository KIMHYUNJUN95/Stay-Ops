"use client";

import { Clock3, Sparkles } from "lucide-react";

type HomeActiveTaskCardProps = {
  activeTaskLabel: string;
  title: string;
  subtitle: string;
  stopLabel: string;
  timeText: string;
};

export function HomeActiveTaskCard({
  activeTaskLabel,
  title,
  subtitle,
  stopLabel,
  timeText,
}: HomeActiveTaskCardProps) {
  return (
    <section className="rounded-[28px] border border-slate-300/80 bg-[#f1f3f5] p-6 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          <Clock3 className="size-4" aria-hidden="true" />
          {activeTaskLabel}
        </span>
        <span className="text-[36px] font-black leading-none tabular-nums text-slate-900">{timeText}</span>
      </div>
      <h2 className="mt-5 text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-slate-900">{title}</h2>
      <p className="mt-2 text-[28px] font-medium leading-tight text-slate-600">{subtitle}</p>
      <div className="mt-6 flex gap-3">
        <button
          className="flex-1 rounded-2xl border border-red-200 bg-[#f5eaea] px-4 py-3 text-[31px] font-medium text-red-600"
          type="button"
        >
          {stopLabel}
        </button>
        <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-[#eceff3]">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.75),rgba(226,232,240,0.55))]" />
          <Sparkles className="relative z-10 size-[18px] text-slate-600" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
