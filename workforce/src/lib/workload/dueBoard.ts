/**
 * Queue board: open tickets by the day they're due, per system — how many are still due
 * (not yet past their due time) and how many are overdue. Days from the oldest overdue
 * (up to two weeks back, older ones grouped) through the next week (later ones grouped).
 */
import { H, dayKey } from "./clock";
import { due, type WorkloadData } from "./engine";
import type { Task } from "./types";

export interface BoardCol {
  key: string;
  label: string;
  sub: string;
  today?: boolean;
}
export interface BoardGroup {
  id: string;
  name: string;
  /** Per column: ids of tickets still due, and overdue. */
  due: string[][];
  over: string[][];
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dueBoard(d: WorkloadData, open: Task[], now: number): { cols: BoardCol[]; groups: BoardGroup[] } {
  const today = dayKey(now);
  const day0 = Date.parse(today + "T00:00:00Z");
  const keyOf = (offset: number) => new Date(day0 + offset * 24 * H).toISOString().slice(0, 10);
  const items = open.map((t) => {
    const dd = due(t, d);
    return { t, day: dayKey(dd), over: now > dd };
  });
  const oldest = items.reduce((a, x) => (x.day < a ? x.day : a), today);
  const back = Math.min(13, Math.max(0, Math.round((day0 - Date.parse(oldest + "T00:00:00Z")) / (24 * H))));
  const days = Array.from({ length: back + 7 }, (_, i) => keyOf(i - back));
  const first = days[0];
  const last = days[days.length - 1];
  const cols: BoardCol[] = [];
  if (items.some((x) => x.day < first)) cols.push({ key: "older", label: "Older", sub: `before ${Number(first.slice(8))} ${MON[Number(first.slice(5, 7)) - 1]}` });
  for (const k of days) {
    const dt = new Date(k + "T00:00:00Z");
    cols.push({ key: k, label: k === today ? "Today" : DOW[dt.getUTCDay()], sub: `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`, today: k === today });
  }
  if (items.some((x) => x.day > last)) cols.push({ key: "later", label: "Later", sub: `after ${Number(last.slice(8))} ${MON[Number(last.slice(5, 7)) - 1]}` });
  const colOf = (day: string) => (day < first ? "older" : day > last ? "later" : day);
  const idx = new Map(cols.map((c, i) => [c.key, i]));
  // Groups: each system in the team, then tickets without one.
  const sysOf = (t: Task) => d.org.trades.find((x) => x.id === t.trade)?.sys || "";
  const sysIds = [...new Set(items.map((x) => sysOf(x.t)))];
  const named = d.org.systems.filter((s) => sysIds.includes(s.id));
  const groups: BoardGroup[] = named
    .map((s) => ({ id: s.id, name: s.name }))
    .concat(sysIds.includes("") ? [{ id: "", name: named.length ? "No system" : d.org.team.name }] : [])
    .map((g) => ({ ...g, due: cols.map(() => []), over: cols.map(() => []) }));
  for (const x of items) {
    const g = groups.find((y) => y.id === sysOf(x.t));
    const i = idx.get(colOf(x.day));
    if (!g || i === undefined) continue;
    (x.over ? g.over : g.due)[i].push(x.t.id);
  }
  return { cols, groups };
}
