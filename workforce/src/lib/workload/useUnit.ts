"use client";

import { sysName, tradeOf, trPathOf } from "./constants";
import { useWorkload } from "./store";
import type { Task } from "./types";

/** The System › Trade selection from the filter bar (the team's structure comes from the Calendar). */
export function useUnit() {
  const { sys, tr, data } = useWorkload();
  const { org } = data;
  // A system with no trades is itself a unit (id = system id).
  const inSys = (id: string) => sys === "all" || tradeOf(org, id)?.sys === sys || id === sys;
  const trOpts = org.trades.filter((t) => inSys(t.id));
  const unitTrades = trOpts.filter((t) => tr === "all" || t.id === tr);
  const inUnit = (t: Task) => {
    if (tr !== "all") return t.trade === tr;
    if (sys !== "all") return inSys(t.trade);
    return true;
  };
  const people = data.people.filter((p) => p.trades.some((x) => unitTrades.some((t) => t.id === x)));
  const unitLabel = tr !== "all" ? trPathOf(org, tr) : sys !== "all" ? sysName(org, sys) : org.team.name;
  return { inUnit, unitTrades, trOpts, people, unitLabel };
}
