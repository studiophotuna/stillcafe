"use client";

import { SYS, TEAM, TRADES, trade, trPath } from "./constants";
import { useWorkload } from "./store";
import type { Task } from "./types";

/** The System › Trade selection from the filter bar. */
export function useUnit() {
  const { sys, tr, data } = useWorkload();
  const trOpts = TRADES.filter((t) => sys === "all" || t.sys === sys);
  const unitTrades = trOpts.filter((t) => tr === "all" || t.id === tr);
  const inUnit = (t: Task) => {
    if (tr !== "all") return t.trade === tr;
    if (sys !== "all") return trade(t.trade)?.sys === sys;
    return true;
  };
  const people = data.people.filter((p) => p.trades.some((x) => unitTrades.some((t) => t.id === x)));
  const unitLabel = tr !== "all" ? trPath(tr) : sys !== "all" ? SYS[sys] : TEAM.name;
  return { inUnit, unitTrades, people, unitLabel };
}
