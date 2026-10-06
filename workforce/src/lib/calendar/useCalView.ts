"use client";

import { useMemo } from "react";
import { inViewOf, isNodeAdmin, onlyAbove } from "./org";
import { isLeader as isLeaderLevel } from "./constants";
import { canDecide, seesApprovals, waitsOn } from "./approvals";
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
    const isLeader = isLeaderLevel(meP.level);
    // All teams in the tower / all towers in the department, within what this person can see
    // (directors: their department, managers: their tower, leads: their team).
    const towerTeams = viewBranches.filter((b) => O.up(b.id, "tower")!.id === tower.id);
    const deptTeams = viewBranches.filter((b) => O.up(b.id, "dept")!.id === dept.id);
    const span: "team" | "tower" | "dept" =
      // Tower and department views also show their managers and directors, so they're
      // available even with one team.
      sel.span === "dept" && deptTeams.length > 0 ? "dept" : sel.span && sel.span !== "team" && towerTeams.length > 0 ? "tower" : "team";
    const multi = span !== "team";
    const scopeBranches = span === "dept" ? deptTeams : span === "tower" ? towerTeams : [branch];
    const scopeId = span === "dept" ? dept.id : span === "tower" ? tower.id : bid;
    /** The team for per-team cells and approvals: none when several teams are shown. */
    const cellBid = multi ? null : bid;
    const systems = multi ? [] : O.kids(bid, "system");
    const system = systems.some((x) => x.id === sel.system) ? sel.system : "all";
    // With all systems, a trade name used under several systems (e.g. EU under GPM and RCM)
    // is listed once and covers each of them.
    const allTrades = multi ? [] : system !== "all" ? O.kids(system, "trade") : O.desc(bid, "trade");
    const tkey = (n: OrgNode) => n.name.trim().toLowerCase();
    const trades = allTrades.filter((t, i) => allTrades.findIndex((x) => tkey(x) === tkey(t)) === i);
    const selT = allTrades.find((x) => x.id === sel.trade);
    const trade = selT ? trades.find((x) => tkey(x) === tkey(selT))!.id : "all";
    const tradeIds = selT ? allTrades.filter((x) => tkey(x) === tkey(selT)).map((x) => x.id) : [];
    const unitIds = multi ? scopeBranches.map((b) => b.id) : tradeIds.length ? tradeIds : [system !== "all" ? system : bid];
    const unitId = multi ? scopeId : unitIds[0];
    const inUnit = (p: CalPerson) => unitIds.some((u) => O.inN(p, u));
    // Members of the teams plus directors / managers allocated to the tower or department above.
    const scopeIds = scopeBranches.map((b) => b.id);
    const inView = inViewOf(O, scopeIds, unitIds, system !== "all" || trade !== "all", multi);
    const isAbove = onlyAbove(O, scopeIds);
    const unitLabel = multi
      ? span === "dept"
        ? `All towers · ${dept.name.split(" (")[0]}`
        : `All teams · ${tower.name}`
      : [
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
    // Team admins and the team's leaders see its approvals; the badge counts what I can decide.
    const canApprove = scopeBranches.some((b) => seesApprovals(cal, me, b.id));
    const pendingCount = data.requests.filter((q) => scopeBranches.some((b) => waitsOn(cal, q, b.id) && canDecide(cal, me, q, b.id))).length;
    // Admin of every team shown (several teams: each one).
    const adminOfAll = sys || scopeBranches.every((b) => isNodeAdmin(O, b.id, me));
    return {
      canApprove, span, multi, scopeBranches, scopeId, cellBid, adminOfAll, towerTeams, deptTeams,
      meP, myBranches, viewBranches, mTowers, mTower, branch, dept, tower, bid, isAdmin, anyAdmin, isLeader, systems, system, trades, trade,
      unitId, unitIds, inUnit, inView, isAbove, unitLabel, deptList, towerOpts, deptShort: dept.name.split(" (")[0], pendingCount,
      branchOpts: viewBranches.filter((b) => O.up(b.id, "tower")!.id === tower.id),
    };
  }, [cal, me, sel, data]);
}

export type CalView = ReturnType<typeof useCalView>;
