/** Day / week / month / year periods in team-local time, for the Queue, Task history and Dashboard navigators. */
import { TZ_OFFSET_H, H, dayKey } from "./clock";

export type PeriodKind = "day" | "week" | "month" | "year" | "all";

/** Midnight team-local time of the day `ms` falls on, as a timestamp. */
const dayStart = (ms: number) => Date.parse(dayKey(ms) + "T00:00:00Z") - TZ_OFFSET_H * H;

/** [from, to) for the period containing `anchor`; weeks start on Monday. */
export function periodRange(kind: PeriodKind, anchor: number): [number, number] {
  if (kind === "all") return [-Infinity, Infinity];
  const d0 = dayStart(anchor);
  if (kind === "day") return [d0, d0 + 24 * H];
  if (kind === "week") {
    const dow = (new Date(d0 + TZ_OFFSET_H * H).getUTCDay() + 6) % 7; // Mon = 0
    const from = d0 - dow * 24 * H;
    return [from, from + 7 * 24 * H];
  }
  const [y, m] = dayKey(anchor).split("-").map(Number);
  if (kind === "year") return [Date.parse(`${y}-01-01T00:00:00Z`) - TZ_OFFSET_H * H, Date.parse(`${y + 1}-01-01T00:00:00Z`) - TZ_OFFSET_H * H];
  const from = Date.parse(`${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`) - TZ_OFFSET_H * H;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return [from, Date.parse(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00Z`) - TZ_OFFSET_H * H];
}

/** Move the anchor one period back (-1) or forward (+1). */
export function shiftPeriod(kind: PeriodKind, anchor: number, dir: -1 | 1): number {
  if (kind === "all") return anchor;
  if (kind === "day") return anchor + dir * 24 * H;
  if (kind === "week") return anchor + dir * 7 * 24 * H;
  const [from, to] = periodRange(kind, anchor);
  return dir < 0 ? from - 12 * H : to + 12 * H;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lbl = (ms: number) => {
  const [y, m, d] = dayKey(ms).split("-").map(Number);
  return { y, m, d, s: `${d} ${MON[m - 1]}` };
};

export function periodLabel(kind: PeriodKind, anchor: number, now: number): string {
  if (kind === "all") return "All dates";
  const [from, to] = periodRange(kind, anchor);
  const a = lbl(from);
  if (kind === "day") return (dayKey(anchor) === dayKey(now) ? "Today · " : "") + `${a.s} ${a.y}`;
  if (kind === "month") return `${MON[a.m - 1]} ${a.y}`;
  if (kind === "year") return String(a.y);
  const b = lbl(to - 1);
  return `${a.s} – ${b.s} ${b.y}`;
}

/**
 * Sub-periods for a breakdown: the days of a week or month, the months of a year.
 * Each is [label, from, to).
 */
export function periodBuckets(kind: PeriodKind, anchor: number): [string, number, number][] {
  const [from, to] = periodRange(kind, anchor);
  const out: [string, number, number][] = [];
  if (kind === "week" || kind === "month") {
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let t = from; t < to; t += 24 * H) out.push([`${DOW[new Date(t + TZ_OFFSET_H * H).getUTCDay()]} ${lbl(t).s}`, t, t + 24 * H]);
  } else if (kind === "year") {
    for (let t = from; t < to; ) {
      const [a, b] = periodRange("month", t);
      out.push([MON[lbl(a).m - 1], a, b]);
      t = b;
    }
  }
  return out;
}
