/**
 * Workload reads its team from the Calendar: the team's systems and trades, the
 * members with the trades their allocations cover, whether they can take work
 * right now (not on leave, a rest day or holiday, and inside their shift), and
 * the admins.
 */
import type { Cal } from "../calendar/engine";
import type { OrgNode } from "../calendar/types";
import { isLeader } from "../calendar/constants";
import { approversOf } from "../calendar/org";
import { teamHeadcount } from "../calendar/headcount";
import { activeCovers } from "../calendar/covers";
import { dayKey, localHour } from "./clock";
import type { Availability, BillRow, Person, Trade, WlOrg } from "./types";

const workingOn = (o: string | undefined) => (o === "WFH" ? "WFH" : o && o !== "HOL" ? "RTO" : null);

const OUT = ["VL", "SL", "EL", "BT", "HOL", "RD"];

/**
 * Where tasks can go in a team: its trades; a system with no trades is one unit;
 * a team with no systems or trades is a single unit (the team itself).
 */
export function unitsOf(c: Cal, teamId: string): Trade[] {
  const { O } = c;
  const units: Trade[] = [];
  const systems = O.kids(teamId, "system");
  for (const sy of systems) {
    const trs = O.kids(sy.id, "trade");
    if (trs.length) trs.forEach((t) => units.push({ id: t.id, name: t.name, sys: sy.id }));
    else units.push({ id: sy.id, name: sy.name, sys: "" });
  }
  O.kids(teamId, "trade").forEach((t) => units.push({ id: t.id, name: t.name, sys: "" }));
  if (!units.length && O.by[teamId]) units.push({ id: teamId, name: O.by[teamId].name, sys: "" });
  return units;
}

export function orgFor(c: Cal, teamId: string, teams: OrgNode[]): WlOrg {
  const team = c.O.by[teamId];
  return {
    team: { id: teamId, name: team?.name ?? teamId },
    systems: c.O.kids(teamId, "system").map((s) => ({ id: s.id, name: s.name })),
    trades: unitsOf(c, teamId),
    teams: teams.map((b) => ({ id: b.id, name: b.name, tower: c.O.up(b.id, "tower")?.name ?? "" })),
  };
}

export function peopleFromCalendar(c: Cal, now: number, teamId: string): Person[] {
  const today = dayKey(now);
  const hour = localHour(now);
  const { O } = c;
  if (!O.by[teamId]) return [];
  const units = unitsOf(c, teamId);
  return c.d.people
    .filter((p) => O.inN(p, teamId) && c.alive(p, today))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      // A unit is covered by an allocation to it or to a system above it. An allocation
      // to the team itself covers the team only when the team is its one unit.
      const mine = p.assign.filter((a) => O.anc(a).includes(teamId));
      const trades = units.filter((u) => mine.some((a) => a === u.id || (a !== teamId && O.anc(u.id).includes(a)))).map((u) => u.id);
      const cell = c.raw(p, today, teamId);
      const sh = c.d.shifts.find((x) => x.id === c.shiftFor(p, today));
      const start = sh ? Number(sh.start.slice(0, 2)) + Number(sh.start.slice(3, 5)) / 60 : 8;
      const inShift = (hour - start + 24) % 24 < 9;
      let avail: Availability = "available";
      if (OUT.includes(cell.code) && !cell.pending) avail = "leave";
      else if (!cell.code || !inShift) avail = "offshift";
      const hol = cell.code === "HOL" || cell.code === "HDY";
      // A weekend or rest day: with no schedule (or a rest day) they may still work it, as
      // rest day overtime (RDOT); a weekend scheduled RTO / WFH is a regular day.
      const restDay = cell.code === "RDOT" || cell.code === "RD" || (cell.wk && !cell.code);
      if (restDay && cell.code !== "RDOT") avail = "offshift";
      const onToday = hol ? !!workingOn(c.d.overrides[p.id + "|" + today]) : restDay || (avail !== "leave" && !!cell.code);
      const otDay = hol && workingOn(c.d.overrides[p.id + "|" + today]) ? ("holiday" as const) : restDay && !hol ? ("restday" as const) : undefined;
      return {
        id: p.id,
        name: p.name,
        trades,
        avail,
        shift: sh ? `${sh.name} ${sh.start}–${sh.end}` : "—",
        shiftStart: Math.floor(start),
        onToday,
        ...(otDay ? { otDay } : {}),
        ...(p.approver && p.approver !== p.id ? { approver: p.approver } : {}),
        // Working an unscheduled weekend / rest day: the Calendar gets tagged RDOT once they start.
        ...(otDay === "restday" && cell.code !== "RDOT" ? { rdTag: true } : {}),
        ...(hol
          ? { holiday: { name: cell.note ?? "Holiday", date: today, working: workingOn(c.d.overrides[p.id + "|" + today]), answered: !!c.d.overrides[p.id + "|" + today] } }
          : {}),
      };
    });
}

/** Calendar holidays that apply to the team: for everyone, or for the team or anything above it. */
export function holidaysFor(c: Cal, teamId: string): string[] {
  const up = c.O.anc(teamId);
  return [...new Set(c.d.holidays.filter((h) => h.scope === "all" || up.includes(h.scope)).map((h) => h.date))].sort();
}

/** Team admins of the team plus system admins. */
/** Pricing (business case) is for managers and above: the team's Workload admins who are managers or directors, and system admins. */
export function workloadPricers(c: Cal, teamId: string): number[] {
  return workloadAdmins(c, teamId).filter((id) => {
    const p = c.people.get(id);
    return !!p && (p.sysAdmin || p.level === "manager" || p.level === "director");
  });
}

export function workloadAdmins(c: Cal, teamId: string): number[] {
  // The team's admins and the admins of its tower and department.
  const ids = new Set<number>(approversOf(c.O, teamId)); // listed admins and admins by role
  c.d.people.forEach((p) => p.sysAdmin && ids.add(p.id));
  return [...ids];
}

/**
 * Who may approve overtime in a team: its Workload admins, plus leads, managers and
 * directors allocated to the team, anything under it, or its tower or department.
 */
export function workloadApprovers(c: Cal, teamId: string): number[] {
  const ids = new Set(workloadAdmins(c, teamId));
  const above = new Set(c.O.anc(teamId));
  c.d.people.forEach((p) => {
    if (!isLeader(p.level) || !c.alive(p, c.today)) return;
    if (c.O.inN(p, teamId) || p.assign.some((a) => above.has(a))) ids.add(p.id);
  });
  // Stand-ins covering for one of them (leave cover).
  for (const x of activeCovers(c.d, c.today)) if (ids.has(x.leader) && c.people.has(x.standIn)) ids.add(x.standIn);
  return [...ids];
}

/** The team's billed FTE this year by person and month (Calendar › Headcount, with overrides), for the business case. */
export function billedFor(c: Cal, teamId: string): { year: number; rows: BillRow[] } | undefined {
  const team = c.O.by[teamId];
  if (!team) return undefined;
  const year = Number(c.today.slice(0, 4));
  const hc = teamHeadcount(c, team, year);
  return { year, rows: hc.rows.map((r) => ({ pid: r.pid, name: r.name, level: r.level, billed: r.months.map((m) => m.billed) })) };
}
