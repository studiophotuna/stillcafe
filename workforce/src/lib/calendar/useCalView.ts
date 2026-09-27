"use client";

import { useMemo } from "react";
import { isNodeAdmin } from "./org";
import { useCalendar } from "./store";
import type { CalPerson, OrgNode } from "./types";

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
    // Teams under a department / tower this person administers.
    data.nodes.forEach((n) => {
      if (n.type === "branch" && !myBranches.includes(n) && !scoped.includes(n) && isNodeAdmin(O, n.id, me)) scoped.push(n);
    });
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
    const isAdmin = sys || isNodeAdmin(O, branch.id, me);
    const anyAdmin = sys || data.nodes.some((n) => (n.admins ?? []).includes(me) && O.anc(n.id).includes(dept.id));
    const isLeader = meP.level !== "member";
    const systems = O.kids(bid, "system");
    const system = systems.some((x) => x.id === sel.system) ? sel.system : "all";
    // With all systems, a trade name used under several systems (e.g. EU under GPM and RCM)
    // is listed once and covers each of them.
    const allTrades = system !== "all" ? O.kids(system, "trade") : O.desc(bid, "trade");
    const tkey = (n: OrgNode) => n.name.trim().toLowerCase();
    const trades = allTrades.filter((t, i) => allTrades.findIndex((x) => tkey(x) === tkey(t)) === i);
    const selT = allTrades.find((x) => x.id === sel.trade);
    const trade = selT ? trades.find((x) => tkey(x) === tkey(selT))!.id : "all";
    const tradeIds = selT ? allTrades.filter((x) => tkey(x) === tkey(selT)).map((x) => x.id) : [];
    const unitIds = tradeIds.length ? tradeIds : [system !== "all" ? system : bid];
    const unitId = unitIds[0];
    const inUnit = (p: CalPerson) => unitIds.some((u) => O.inN(p, u));
    const unitLabel = [
      branch.name,
      system !== "all" ? O.by[system].name : "",
      trade !== "all" ? O.by[trade].name + (tradeIds.length > 1 ? " (all systems)" : "") : "",
    ]
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
      unitId, unitIds, inUnit, unitLabel, deptList, towerOpts, deptShort: dept.name.split(" (")[0], pendingCount,
      branchOpts: viewBranches.filter((b) => O.up(b.id, "tower")!.id === tower.id),
    };
  }, [cal, me, sel, data]);
}

export type CalView = ReturnType<typeof useCalView>;
