/**
 * Dashboard metrics for any period (a day, week, month or year), per person and for the
 * team. Same definitions as today's figures on My work:
 * - Productivity = work done ÷ work expected. Work done is the share of a day's target the
 *   finished tasks make (task type targets, else the member's target); work expected is the
 *   number of days the Calendar had them working in the period (today pro-rated).
 * - Utilization = time on tasks ÷ time available (working days × shift, minus time away,
 *   or minus the planned breaks when none were logged).
 * - Timeliness = tasks finished within SLA ÷ tasks finished.
 */
import { H, M, dayKey } from "./clock";
import { dayShare, due, elapsedFrac, output, targetOf, taskTypeOf, taskWorkMs, type WorkloadData } from "./engine";
import type { Activity, Person, Task } from "./types";

export interface PeriodInput {
  from: number;
  to: number;
  now: number;
  /** Days (yyyy-mm-dd) each person was scheduled to work, from the Calendar. */
  workDays: Record<number, string[]>;
  /** Breaks, meetings etc. and end-of-day entries in the period. */
  activities: Activity[];
}

export interface PersonPeriod {
  p: Person;
  /** Working days in the period so far (today as the part of the shift that has passed). */
  days: number;
  done: Task[];
  out: number;
  share: number;
  mix: string;
  target: number;
  prod: number | null;
  handle: number;
  avail: number;
  util: number | null;
  onTime: number;
  time: number | null;
  avgMs: number | null;
  away: Record<string, number>;
  awayMin: number;
  otMin: number;
  otPending: number;
}

const clip = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));

export function personPeriod(d: WorkloadData, p: Person, x: PeriodInput): PersonPeriod {
  const s = d.settings;
  const until = Math.min(x.now, x.to);
  const today = dayKey(x.now);
  const acts = x.activities.filter((a) => a.pid === p.id);
  const endToday = acts.find((a) => a.kind === "end" && dayKey(a.start) === today);
  const days = (x.workDays[p.id] ?? [])
    .filter((k) => k >= dayKey(x.from) && k <= dayKey(until - 1) && k <= today)
    .reduce((a, k) => a + (k === today ? elapsedFrac(p, s, endToday ? Math.min(x.now, endToday.start) : x.now) : 1), 0);
  const done = d.tasks.filter((t) => t.assignee === p.id && t.status === "done" && t.doneAt !== null && t.doneAt >= x.from && t.doneAt < until);
  const target = targetOf(p, s);
  const { share, mix } = dayShare(d, done, target);
  // Time away in the period (to now for ongoing breaks) and overtime reported at End work.
  const away: Record<string, number> = {};
  let awayMs = 0;
  let otMin = 0;
  let otPending = 0;
  for (const a of acts) {
    if (a.kind === "end") {
      if (a.start >= x.from && a.start < x.to) {
        if (a.otStatus === "approved") otMin += a.otMin;
        if (a.otStatus === "pending") otPending += a.otMin;
      }
      continue;
    }
    const ms = clip(a.start, a.end ?? x.now, x.from, until);
    if (!ms) continue;
    away[a.kind] = (away[a.kind] ?? 0) + Math.round(ms / 60000);
    awayMs += ms;
  }
  const withActs = { ...d, activities: x.activities };
  const working = x.now >= x.from && x.now < x.to ? d.tasks.filter((t) => t.assignee === p.id && t.status === "in_progress") : [];
  // Time on the tasks finished in the period (and the one in progress now).
  const handle = done.concat(working).reduce((a, t) => a + taskWorkMs(withActs, t, until), 0);
  const avail = Math.max(0, s.work.shift * H * days - Math.max(awayMs, (s.work.b1 + s.work.b2) * M * days));
  const onTime = done.filter((t) => t.doneAt! <= due(t, d)).length;
  const timed = done.filter((t) => t.startedAt);
  return {
    p,
    days,
    done,
    out: output(d, done),
    share,
    mix,
    target,
    prod: days && (target > 0 || share > 0) ? Math.round((share / days) * 100) : null,
    handle,
    avail,
    util: avail ? Math.round((handle / avail) * 100) : null,
    onTime,
    time: done.length ? Math.round((onTime / done.length) * 100) : null,
    avgMs: timed.length ? timed.reduce((a, t) => a + taskWorkMs(withActs, t, until), 0) / timed.length : null,
    away,
    awayMin: Math.round(awayMs / 60000),
    otMin,
    otPending,
  };
}

export interface TeamPeriod {
  received: number;
  done: number;
  onTime: number;
  prod: number | null;
  util: number | null;
  time: number | null;
  avgMs: number | null;
  otMin: number;
  awayMin: number;
}

/** Team totals: each person weighted by their own days and targets. */
export function teamPeriod(d: WorkloadData, rows: PersonPeriod[], tasks: Task[], x: Pick<PeriodInput, "from" | "to" | "now">): TeamPeriod {
  const sum = (f: (r: PersonPeriod) => number) => rows.reduce((a, r) => a + f(r), 0);
  const days = sum((r) => (r.target > 0 || r.share > 0 ? r.days : 0));
  const done = tasks.filter((t) => t.status === "done" && t.doneAt !== null && t.doneAt >= x.from && t.doneAt < Math.min(x.now, x.to));
  const onTime = done.filter((t) => t.doneAt! <= due(t, d)).length;
  const timed = rows.flatMap((r) => (r.avgMs !== null ? [[r.avgMs, r.done.filter((t) => t.startedAt).length]] : []));
  const n = timed.reduce((a, [, c]) => a + c, 0);
  return {
    received: tasks.filter((t) => t.received >= x.from && t.received < x.to).length,
    done: done.length,
    onTime,
    prod: days ? Math.round((sum((r) => r.share) / days) * 100) : null,
    util: sum((r) => r.avail) ? Math.round((sum((r) => r.handle) / sum((r) => r.avail)) * 100) : null,
    time: done.length ? Math.round((onTime / done.length) * 100) : null,
    avgMs: n ? timed.reduce((a, [ms, c]) => a + ms * c, 0) / n : null,
    otMin: sum((r) => r.otMin),
    awayMin: sum((r) => r.awayMin),
  };
}

/** Task type name for exports and tables ("Standard" for requests without one). */
export const typeLabel = (d: Pick<WorkloadData, "settings">, t: Task) => (t.ttype ? (taskTypeOf(d.settings, t)?.name ?? "Deleted type") : "Standard");
