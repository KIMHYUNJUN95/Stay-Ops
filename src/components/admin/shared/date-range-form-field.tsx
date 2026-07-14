"use client";

import { useState } from "react";
import { AdminDateRangePicker, type AdminDateRangePickerLabels } from "./admin-date-range-picker";

type DateRangeFormFieldProps = {
  /** Form field name carrying the range start ("YYYY-MM-DD"). */
  startName: string;
  /** Form field name carrying the range end ("YYYY-MM-DD"). */
  endName: string;
  defaultFrom?: string;
  defaultTo?: string;
  localeTag: string;
  ariaLabel: string;
  labels: AdminDateRangePickerLabels;
};

/**
 * Form-friendly wrapper around the shared `AdminDateRangePicker` — the range sibling of
 * `DateFormField`. Renders the branded calendar popover plus two hidden inputs, so a server-rendered
 * `<form method="get">` filter bar can drop it in where two native `<input type="date">` used to be
 * without becoming a client page. The server still parses/validates the submitted values
 * (`parseRequestDateRange` in src/lib/request-filters.ts).
 */
export function DateRangeFormField({
  startName,
  endName,
  defaultFrom = "",
  defaultTo = "",
  localeTag,
  ariaLabel,
  labels,
}: DateRangeFormFieldProps) {
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo });

  return (
    <>
      <input type="hidden" name={startName} value={range.from} />
      <input type="hidden" name={endName} value={range.to} />
      <AdminDateRangePicker
        from={range.from}
        to={range.to}
        onChange={(from, to) => setRange({ from, to })}
        localeTag={localeTag}
        ariaLabel={ariaLabel}
        labels={labels}
      />
    </>
  );
}
