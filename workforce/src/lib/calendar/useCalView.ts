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
    // System admins can open every team; everyone else sees the teams they're allocated to.
    // Directors and managers allocated to a department or tower see the teams under it.
    const above = meP.assign.filter((a) => O.by[a] && (O.by[a].type === "dept" || O.by[a].type === "tower"));
    const scoped = above.flatMap((a) => O.desc(a, "branch")).filter((b) => !myBranches.includes(b));
    const viewBranches = meP.sysAdmin
      ? myBranches.concat(data.nodes.filter((n) => n.type === "branch" && !myBranches.includes(n)))
      : myBranches.concat([...new Set(scoped)]);
    const branch: OrgNode =
      viewBranches.find((b) => b.id === sel.branch && O.up(b.id, "dept")?.id === sel.dept) ||
      viewBranches.find((b) => b.id === sel.branch) ||
      viewBranches[0] ||
      data.nodes.find((n) => n.type === "branch")!;
    const dept = O.up(branch.id, "dept")!;
    const tower = O.up(branch.id, "tower")!;
    const bid = branch.id;
    const sys = !!meP.sysAdmin;
    const isAdmin = sys || (branch.admins ?? []).includes(me);
    const anyAdmin = sys || O.desc(dept.id, "branch").some((b) => (b.admins ?? []).includes(me));
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
    viewBranches.forEach((b) => {
      const d = O.up(b.id, "dept")!;
      if (!deptList.includes(d)) deptList.push(d);
    });
    const towerOpts: OrgNode[] = [];
    viewBranches.forEach((b) => {
      const t = O.up(b.id, "tower")!;
      if (O.up(b.id, "dept")!.id === dept.id && !towerOpts.includes(t)) towerOpts.push(t);
    });
    // Management view tower filter ("all" when the saved one isn't in this department).
    const mTowers = O.kids(dept.id, "tower");
    const mTower = mTowers.some((t) => t.id === sel.mTower) ? sel.mTower : "all";
    const pendingCount = data.requests.filter((q) => q.approvals[bid] === "pending").length;
    return {
      meP, myBranches, viewBranches, mTowers, mTower, branch, dept, tower, bid, isAdmin, anyAdmin, isLeader, systems, system, trades, trade,
      unitId, unitLabel, deptList, towerOpts, deptShort: dept.name.split(" (")[0], pendingCount,
      branchOpts: viewBranches.filter((b) => O.up(b.id, "tower")!.id === tower.id),
    };
  }, [cal, me, sel, data]);
}

export type CalView = ReturnType<typeof useCalView>;
