/** Day / week / month periods in team-local time, for the Queue and Task history navigators. */
import { TZ_OFFSET_H, H, dayKey } from "./clock";

export type PeriodKind = "day" | "week" | "month" | "all";

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
  const [from, to] = periodRange("month", anchor);
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
  const b = lbl(to - 1);
  return `${a.s} – ${b.s} ${b.y}`;
}
