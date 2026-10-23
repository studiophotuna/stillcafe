"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkloadData } from "./engine";
import { useWorkload } from "./store";

const YEAR = 366 * 24 * 3600_000;

/**
 * The team's data with every task finished between `from` and `to`. Saved data loads only
 * recent finished tasks (from `doneSince`); for earlier dates this fetches that period once
 * and adds it. Sample data has every task already. "All dates" (no start) goes back a year.
 */
export function useTasksIn(fromMs: number, to: number): { data: WorkloadData; loading: boolean } {
  const { data, mode, older, loadDone } = useWorkload();
  const since = data.doneSince;
  const end = Math.min(to, since ?? to);
  const from = Math.max(fromMs, end - YEAR);
  const need = mode === "db" && since !== undefined && from < since;
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!need || end <= from) return;
    let live = true;
    setLoading(true);
    loadDone(from, end).finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [need, from, end, loadDone]);
  const merged = useMemo(() => {
    if (!need || !older.length) return data;
    const have = new Set(data.tasks.map((t) => t.id));
    return { ...data, tasks: data.tasks.concat(older.filter((t) => !have.has(t.id))) };
  }, [need, data, older]);
  return { data: merged, loading: need && loading };
}
