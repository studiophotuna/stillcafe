"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "@/lib/workload/period";

/**
 * Date filter used across the app: a Today button, then any From – To dates (inclusive).
 * With `allowAll`, an "All dates" button clears it.
 */
export function DateRangePicker({
  value,
  onChange,
  today,
  allowAll = false,
  id = "dr",
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  /** Today, yyyy-mm-dd (team time). */
  today: string;
  allowAll?: boolean;
  id?: string;
}) {
  const isToday = !!value && value.from === today && value.to === today;
  const set = (from: string, to: string) => {
    if (!from && !to) return onChange(allowAll ? null : { from: today, to: today });
    const a = from || to;
    const b = to || from;
    onChange(a <= b ? { from: a, to: b } : { from: b, to: a });
  };
  return (
    <div className="date-range" role="group" aria-label="Dates">
      <button type="button" className={"btn btn-36 " + (isToday ? "btn-primary" : "btn-secondary")} aria-pressed={isToday} onClick={() => onChange({ from: today, to: today })}>
        Today
      </button>
      {allowAll && (
        <button type="button" className={"btn btn-36 " + (!value ? "btn-primary" : "btn-secondary")} aria-pressed={!value} onClick={() => onChange(null)}>
          All dates
        </button>
      )}
      <label className="date-range-field" htmlFor={id + "-from"}>
        <span>From</span>
        <input id={id + "-from"} className="input" type="date" value={value?.from ?? ""} max={value?.to || undefined} onChange={(e) => set(e.target.value, value?.to ?? "")} />
      </label>
      <label className="date-range-field" htmlFor={id + "-to"}>
        <span>To</span>
        <input id={id + "-to"} className="input" type="date" value={value?.to ?? ""} min={value?.from || undefined} onChange={(e) => set(value?.from ?? "", e.target.value)} />
      </label>
    </div>
  );
}

/**
 * A date range kept for this browser tab under `key`, so pages that share a key (e.g.
 * Dashboard and Handling time) show the same dates.
 */
export function useStoredRange(key: string, init: DateRange): [DateRange, (r: DateRange) => void] {
  const [r, setR] = useState<DateRange>(init);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("wfm.range." + key);
      if (raw) setR(raw === "all" ? null : (JSON.parse(raw) as DateRange));
    } catch {}
  }, [key]);
  const set = (x: DateRange) => {
    setR(x);
    try {
      sessionStorage.setItem("wfm.range." + key, x ? JSON.stringify(x) : "all");
    } catch {}
  };
  return [r, set];
}
