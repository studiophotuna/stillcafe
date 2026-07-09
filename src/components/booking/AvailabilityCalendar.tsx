"use client";

import { useMemo, useState } from "react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function AvailabilityCalendar({
  bookedDates,
  selected,
  onSelect,
}: {
  bookedDates: string[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const bookedSet = useMemo(() => new Set(bookedDates), [bookedDates]);

  const [view, setView] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    return out;
  }, [view]);

  const canGoPrev =
    view.getFullYear() > today.getFullYear() ||
    (view.getFullYear() === today.getFullYear() &&
      view.getMonth() > today.getMonth());

  function shift(delta: number) {
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  const status = selected
    ? bookedSet.has(selected)
      ? "That date is already booked. Please choose another."
      : `Selected ${selected} — available!`
    : "Select an available date to continue.";

  return (
    <div className="rounded-xl border border-latte/60 bg-white p-4 shadow-soft sm:p-5">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <strong className="text-sm font-semibold text-espresso">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </strong>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={!canGoPrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-latte/60 bg-white text-xs font-bold text-espresso transition-colors hover:bg-sand disabled:opacity-30"
          >
            &lt;
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-latte/60 bg-white text-xs font-bold text-espresso transition-colors hover:bg-sand"
          >
            &gt;
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wider text-espresso/30">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const key = ymd(date);
          const isPast = date < today;
          const isBooked = bookedSet.has(key);
          const disabled = isPast || isBooked;
          const isSel = selected === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(key)}
              className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition-all ${
                isSel
                  ? "bg-espresso text-cream shadow-soft"
                  : disabled
                    ? "cursor-not-allowed text-espresso/20 line-through"
                    : "text-espresso hover:bg-sand"
              }`}
              title={isBooked ? "Booked" : isPast ? "Past date" : "Available"}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Status */}
      <div className="mt-3 flex items-center gap-4 border-t border-latte/40 pt-3">
        <div className="flex items-center gap-3 text-[10px] text-espresso/30">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-espresso" />
            Selected
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-latte/60 line-through" />
            Unavailable
          </span>
        </div>
        <p className="ml-auto text-[11px] font-medium text-espresso/40">
          {status}
        </p>
      </div>
    </div>
  );
}
