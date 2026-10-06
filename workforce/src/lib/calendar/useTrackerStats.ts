"use client";

import { useEffect, useMemo, useState } from "react";
import { H, TZ_OFFSET_H, nowMs } from "../workload/clock";
import { trackerStats } from "../workload/metrics";
import { initialData } from "../workload/seed";
import { WORKING } from "./constants";
import { addDays } from "./dates";
import { useCalendar } from "./store";
import { periodRange, type WlStats } from "./trackers";
import type { Code } from "./types";

/** Start and end (ms, team time) of a period. */
export function periodMs(period: string): [number, number] {
  const [a, b] = periodRange(period);
  const at = (d: string) => Date.parse(d + "T00:00:00Z") - TZ_OFFSET_H * H;
  return [at(a), at(addDays(b, 1))];
}

/**
 * Workload figures per team for the trackers: from the server, or in sample mode from the
 * sample Workload team (the only team with sample tasks).
 */
export function useTrackerStats(period: string) {
  const s = useCalendar();
  const [server, setServer] = useState<{ period: string; teams: Record<string, WlStats>; error?: string } | null>(null);
  const [from, to] = periodMs(period);
  useEffect(() => {
    if (s.mode !== "db") return;
    let off = false;
    fetch(`/api/reports/stats?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!off) setServer({ period, teams: r.ok ? (j.teams ?? {}) : {}, error: r.ok ? undefined : j.error || "The Workload figures couldn’t be loaded." });
      })
      .catch(() => !off && setServer({ period, teams: {}, error: "The Workload figures couldn’t be loaded." }));
    return () => {
      off = true;
    };
  }, [s.mode, period, from, to]);
  const sample = useMemo(() => {
    if (s.mode === "db") return null;
    const d = initialData(nowMs());
    const workDays: Record<number, string[]> = {};
    const [a, b] = periodRange(period);
    for (const p of d.people) {
      const cp = s.cal.people.get(p.id);
      if (!cp) continue;
      const days: string[] = [];
      for (let k = a; k <= b && k <= s.today; k = addDays(k, 1)) if (WORKING.includes(s.cal.raw(cp, k, d.org.team.id).code as Code)) days.push(k);
      workDays[p.id] = days;
    }
    return { [d.org.team.id]: trackerStats(d, { from, to, now: nowMs(), workDays, activities: d.activities }) };
  }, [s.mode, s.cal, s.today, period, from, to]);
  if (s.mode !== "db") return { teams: sample ?? {}, loading: false, error: undefined };
  const ready = server?.period === period;
  return { teams: ready ? server!.teams : {}, loading: !ready, error: ready ? server!.error : undefined };
}
