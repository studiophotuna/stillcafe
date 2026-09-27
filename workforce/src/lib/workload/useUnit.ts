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
  const inSysTr = org.trades.filter((t) => inSys(t.id));
  // With all systems, a trade name used under several systems is listed once and covers each.
  const key = (n: { name: string }) => n.name.trim().toLowerCase();
  const trOpts = inSysTr.filter((t, i) => inSysTr.findIndex((x) => key(x) === key(t)) === i);
  const selT = inSysTr.find((t) => t.id === tr);
  const unitTrades = inSysTr.filter((t) => tr === "all" || (selT && key(t) === key(selT)));
  const inUnit = (t: Task) => {
    if (tr !== "all") return unitTrades.some((u) => u.id === t.trade);
    if (sys !== "all") return inSys(t.trade);
    return true;
  };
  const people = data.people.filter((p) => p.trades.some((x) => unitTrades.some((t) => t.id === x)));
  const unitLabel =
    tr !== "all" && unitTrades.length > 1 ? `${selT!.name} (all systems)` : tr !== "all" ? trPathOf(org, tr) : sys !== "all" ? sysName(org, sys) : org.team.name;
  return { inUnit, unitTrades, trOpts, people, unitLabel };
}
