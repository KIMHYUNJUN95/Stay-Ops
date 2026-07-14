"use client";

import { useState } from "react";
import { AdmDropdown, type AdmOption } from "./adm-dropdown";

type DdFormSelectProps = {
  /** form field name — a hidden input carries the selected value into a native <form> submit. */
  name: string;
  options: AdmOption[];
  defaultValue?: string;
  placeholder?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  wide?: boolean;
};

/**
 * Form-friendly wrapper around the shared `AdmDropdown` (.dd). Renders the dropdown plus a hidden
 * input so it can stand in for a native <select> inside a server-action <form>. Server actions still
 * validate the submitted value, so a hidden field (which browsers don't `required`-validate) is fine.
 */
export function DdFormSelect({
  name,
  options,
  defaultValue = "",
  placeholder,
  ariaLabel,
  size,
  wide,
}: DdFormSelectProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <AdmDropdown
        options={options}
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        size={size}
        wide={wide}
      />
    </>
  );
}
