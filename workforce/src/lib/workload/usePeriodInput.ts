"use client";

import { useEffect, useMemo, useState } from "react";
import { H, dayKey } from "./clock";
import type { PeriodInput } from "./metrics";
import { useWorkload } from "./store";
import type { Activity } from "./types";

const ACT_DAYS = 34; // activity already loaded with the team (the server loads 35 days)

/**
 * Working days per person and time away for the period: from the server (Calendar and
 * saved activity), or sample weekdays in demo mode.
 */
export function usePeriodInput(from: number, to: number): { input: PeriodInput | null; error: string } {
  const { data, now, mode } = useWorkload();
  const [got, setGot] = useState<{ key: string; workDays: PeriodInput["workDays"]; activities: Activity[] } | null>(null);
  const [error, setError] = useState("");
  const team = data.org.team.id;
  const key = `${team}|${from}|${to}`;
  useEffect(() => {
    if (mode !== "db") return;
    let live = true;
    setError("");
    fetch(`/api/wl/period?team=${encodeURIComponent(team)}&from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setError(j.error || "The dashboard couldn’t be loaded.");
        else setGot({ key, workDays: j.workDays ?? {}, activities: j.activities ?? [] });
      })
      .catch(() => live && setError("The dashboard couldn’t be loaded. Check your connection."));
    return () => {
      live = false;
    };
  }, [mode, team, from, to, key]);
  // Days count from when the team started using Workload (its first task), so earlier
  // months don't show as days worked with nothing done.
  const start = useMemo(() => (data.tasks.length ? dayKey(Math.min(...data.tasks.map((t) => t.received))) : dayKey(now)), [data.tasks, now]);
  return useMemo(() => {
    const since = (w: PeriodInput["workDays"]) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.filter((x) => x >= start)]));
    if (mode !== "db") {
      const workDays: PeriodInput["workDays"] = {};
      const today = dayKey(now);
      for (const p of data.people) {
        const days: string[] = [];
        for (let t = from; t < to && dayKey(t) <= today; t += 24 * H) {
          const dow = new Date(t + 8 * H).getUTCDay();
          if (dow !== 0 && dow !== 6 && (dayKey(t) !== today || p.avail !== "leave")) days.push(dayKey(t));
        }
        workDays[p.id] = days;
      }
      return { input: { from, to, now, workDays: since(workDays), activities: data.activities }, error: "" };
    }
    if (!got || got.key !== key) return { input: null, error };
    // Recent activity is already loaded with the team and stays current; older periods use the server's.
    const recent = from >= now - ACT_DAYS * 24 * H;
    return { input: { from, to, now, workDays: since(got.workDays), activities: recent ? data.activities : got.activities }, error };
  }, [mode, got, key, from, to, now, data.people, data.activities, error, start]);
}

