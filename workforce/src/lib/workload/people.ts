/**
 * Workload people from the Calendar: members of the team, their trades (from
 * their allocations) and whether they can take work right now (not on leave,
 * a rest day or holiday, and inside their shift).
 */
import type { Cal } from "../calendar/engine";
import { dayKey, localHour } from "./clock";
import { TEAM, TRADES } from "./constants";
import type { Availability, Person } from "./types";

const OUT = ["VL", "SL", "EL", "BT", "HOL", "RD"];

export function peopleFromCalendar(c: Cal, now: number, teamId = TEAM.id): Person[] {
  const today = dayKey(now);
  const hour = localHour(now);
  const { O } = c;
  if (!O.by[teamId]) return [];
  return c.d.people
    .filter((p) => O.inN(p, teamId) && c.alive(p, today))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const trades = TRADES.filter((t) => p.assign.some((a) => a === t.id || a === t.sys)).map((t) => t.id);
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

/** Team admins of the Workload team plus system admins. */
export function workloadAdmins(c: Cal, teamId = TEAM.id): number[] {
  const team = c.O.by[teamId];
  const ids = new Set<number>(team?.admins ?? []);
  c.d.people.forEach((p) => p.sysAdmin && ids.add(p.id));
  return [...ids];
}
