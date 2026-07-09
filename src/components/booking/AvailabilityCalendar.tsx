"use client";

import { useMemo, useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

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
    <div className="space-y-3 rounded-xl border border-latte bg-cream/40 p-4">
      <div className="flex items-center justify-between">
        <strong className="text-sm font-bold text-espresso">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </strong>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={!canGoPrev}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-latte bg-white font-bold text-espresso hover:bg-cream disabled:opacity-40"
          >
            &lt;
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-latte bg-white font-bold text-espresso hover:bg-cream"
          >
            &gt;
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-espresso/50">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
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
              className={`flex aspect-square items-center justify-center rounded-lg text-xs font-semibold transition ${
                isSel
                  ? "bg-mocha text-cream"
                  : disabled
                    ? "cursor-not-allowed bg-latte/40 text-espresso/30 line-through"
                    : "bg-white text-espresso hover:bg-mocha/10"
              }`}
              title={isBooked ? "Booked" : isPast ? "Past date" : "Available"}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="border-t border-latte pt-2 text-xs font-bold text-espresso/60">
        {status}
      </div>
    </div>
  );
}
