/**
 * Break and lunch over the allowance: each day, a member's break and lunch time together
 * (ongoing ones up to now) against the team's planned breaks (Admin › Targets › Working
 * time: 1st + 2nd break). Anything over is flagged to their leads.
 */
import { M, dayKey } from "./clock";
import type { WorkloadData } from "./engine";

export interface BreakFlag {
  pid: number;
  day: string;
  /** Break + lunch minutes that day. */
  min: number;
  allowed: number;
  over: number;
}

export const breakAllowance = (d: Pick<WorkloadData, "settings">) => Math.max(0, (d.settings.work.b1 || 0) + (d.settings.work.b2 || 0));

/** Break + lunch minutes per person and day between from and to. */
export function breakTotals(d: Pick<WorkloadData, "activities">, from: number, to: number, now: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of d.activities) {
    if (a.kind !== "break" && a.kind !== "lunch") continue;
    const end = Math.min(a.end ?? now, to);
    const start = Math.max(a.start, from);
    if (end <= start) continue;
    const k = `${a.pid}|${dayKey(a.start)}`;
    out.set(k, (out.get(k) ?? 0) + (end - start) / M);
  }
  return out;
}

/** Days where break + lunch went over the allowance, most recent first. */
export function breakFlags(d: Pick<WorkloadData, "activities" | "settings">, from: number, to: number, now: number): BreakFlag[] {
  const allowed = breakAllowance(d);
  if (!allowed) return [];
  const flags: BreakFlag[] = [];
  for (const [k, raw] of breakTotals(d, from, to, now)) {
    const min = Math.round(raw);
    if (min <= allowed) continue;
    const [pid, day] = k.split("|");
    flags.push({ pid: Number(pid), day, min, allowed, over: min - allowed });
  }
  return flags.sort((a, b) => b.day.localeCompare(a.day) || b.over - a.over);
}
