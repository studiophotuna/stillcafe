"use client";

import { useMemo } from "react";
import { useCalendar } from "./store";
import type { OrgNode } from "./types";

/**
 * Who is viewing and what is selected: the person's teams, the selected
 * Department › Tower › Team › System › Trade, and their rights there.
 */
export function useCalView() {
  const s = useCalendar();
  const { cal, me, sel, data } = s;
  return useMemo(() => {
    const { O } = cal;
    const meP = cal.person(me);
    const myBranches = O.branchesOf(meP);
    const branch: OrgNode =
      myBranches.find((b) => b.id === sel.branch && O.up(b.id, "dept")?.id === sel.dept) ||
      myBranches.find((b) => b.id === sel.branch) ||
      myBranches[0];
    const dept = O.up(branch.id, "dept")!;
    const tower = O.up(branch.id, "tower")!;
    const bid = branch.id;
    const isAdmin = (branch.admins ?? []).includes(me);
    const anyAdmin = O.desc(dept.id, "branch").some((b) => (b.admins ?? []).includes(me));
    const isLeader = meP.level !== "member";
    const systems = O.kids(bid, "system");
    const system = systems.some((x) => x.id === sel.system) ? sel.system : "all";
    const trades = system !== "all" ? O.kids(system, "trade") : O.desc(bid, "trade");
    const trade = trades.some((x) => x.id === sel.trade) ? sel.trade : "all";
    const unitId = trade !== "all" ? trade : system !== "all" ? system : bid;
    const unitLabel = [branch.name, system !== "all" ? O.by[system].name : "", trade !== "all" ? O.by[trade].name : ""]
      .filter(Boolean)
      .join(" › ");
    const deptList: OrgNode[] = [];
    myBranches.forEach((b) => {
      const d = O.up(b.id, "dept")!;
      if (!deptList.includes(d)) deptList.push(d);
    });
    const towerOpts: OrgNode[] = [];
    myBranches.forEach((b) => {
      const t = O.up(b.id, "tower")!;
      if (O.up(b.id, "dept")!.id === dept.id && !towerOpts.includes(t)) towerOpts.push(t);
    });
    const pendingCount = data.requests.filter((q) => q.approvals[bid] === "pending").length;
    return {
      meP, myBranches, branch, dept, tower, bid, isAdmin, anyAdmin, isLeader, systems, system, trades, trade,
      unitId, unitLabel, deptList, towerOpts, deptShort: dept.name.split(" (")[0], pendingCount,
      branchOpts: myBranches.filter((b) => O.up(b.id, "tower")!.id === tower.id),
    };
  }, [cal, me, sel, data]);
}

export type CalView = ReturnType<typeof useCalView>;
