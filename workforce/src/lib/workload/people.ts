/**
 * Workload reads its team from the Calendar: the team's systems and trades, the
 * members with the trades their allocations cover, whether they can take work
 * right now (not on leave, a rest day or holiday, and inside their shift), and
 * the admins.
 */
import type { Cal } from "../calendar/engine";
import type { OrgNode } from "../calendar/types";
import { dayKey, localHour } from "./clock";
import type { Availability, Person, Trade, WlOrg } from "./types";

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
      return {
        id: p.id,
        name: p.name,
        trades,
        avail,
        shift: sh ? `${sh.name} ${sh.start}–${sh.end}` : "—",
        shiftStart: Math.floor(start),
      };
    });
}

/** Team admins of the team plus system admins. */
export function workloadAdmins(c: Cal, teamId: string): number[] {
  const team = c.O.by[teamId];
  const ids = new Set<number>(team?.admins ?? []);
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
    if (p.level === "member" || !c.alive(p, c.today)) return;
    if (c.O.inN(p, teamId) || p.assign.some((a) => above.has(a))) ids.add(p.id);
  });
  return [...ids];
}
