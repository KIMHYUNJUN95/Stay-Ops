"use client";

import { useState } from "react";
import { AdminDatePicker } from "./admin-date-picker";

type DateFormFieldProps = {
  /** form field name — a hidden input carries the "YYYY-MM-DD" value into a native <form> submit. */
  name: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  localeTag: string;
  ariaLabel: string;
  placeholder?: string;
  labels: { prevMonth: string; nextMonth: string; today: string };
};

/**
 * Form-friendly wrapper around the shared `AdminDatePicker`. Renders the branded calendar picker plus
 * a hidden input so it can replace a native `<input type="date">` inside a server-action <form>.
 * The server action still validates the submitted value.
 */
export function DateFormField({
  name,
  defaultValue = "",
  min,
  max,
  localeTag,
  ariaLabel,
  placeholder,
  labels,
}: DateFormFieldProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <AdminDatePicker
        value={value}
        onChange={setValue}
        min={min}
        max={max}
        localeTag={localeTag}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        labels={labels}
      />
    </>
  );
}
