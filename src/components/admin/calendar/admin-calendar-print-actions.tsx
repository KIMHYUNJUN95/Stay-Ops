"use client";

type AdminCalendarPrintActionsProps = {
  backHref: string;
  backLabel: string;
  hint: string;
  printLabel: string;
};

export function AdminCalendarPrintActions({
  backHref,
  backLabel,
  hint,
  printLabel,
}: AdminCalendarPrintActionsProps) {
  return (
    <div className="admcal-print__toolbar">
      <a className="admcal-print__ghost" href={backHref}>
        {backLabel}
      </a>
      <p className="admcal-print__hint">{hint}</p>
      <button
        className="admcal-print__primary"
        onClick={() => window.print()}
        type="button"
      >
        {printLabel}
      </button>
    </div>
  );
}
