/**
 * Who approves Calendar requests. Each member can have an assigned approver (a team lead
 * or above). Every leader of the team still sees the team's requests and may decide them,
 * as may the team's admins; nobody decides their own request.
 */
import { isLeader } from "./constants";
import type { Cal } from "./engine";
import { isNodeAdmin } from "./org";
import type { CalPerson, LeaveRequest } from "./types";

/** A member's assigned approver, if still valid. */
export function approverOf(c: Cal, pid: number): CalPerson | undefined {
  const id = c.people.get(pid)?.approver;
  const a = id !== undefined ? c.people.get(id) : undefined;
  return a && a.id !== pid && isLeader(a.level) && c.alive(a, c.today) ? a : undefined;
}

/** Leaders (team lead and above) of a team: allocated to it, or to its tower or department. */
export function leadersOf(c: Cal, bid: string): CalPerson[] {
  const up = c.O.anc(bid);
  return c.d.people
    .filter((p) => isLeader(p.level) && c.alive(p, c.today) && (c.O.inN(p, bid) || p.assign.some((a) => up.includes(a))))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether `me` may approve or decline this request for team `bid`. */
export function canDecide(c: Cal, me: number, q: Pick<LeaveRequest, "pid">, bid: string): boolean {
  if (q.pid === me) return false;
  const meP = c.people.get(me);
  if (!meP) return false;
  if (meP.sysAdmin || isNodeAdmin(c.O, bid, me)) return true;
  if (approverOf(c, q.pid)?.id === me) return true;
  return leadersOf(c, bid).some((p) => p.id === me);
}

/**
 * The one team that decides a request: the first of the member's teams (profile order) that
 * has a say on it. Requests made before this rule may still list several teams.
 */
export function decidingTeam(c: Cal, q: Pick<LeaveRequest, "pid" | "approvals">): string | undefined {
  const p = c.people.get(q.pid);
  const keys = Object.keys(q.approvals);
  return (p ? c.O.branchesOf(p).map((b) => b.id).find((id) => keys.includes(id)) : undefined) ?? keys[0];
}

/** Waiting on team `bid`: pending there, and `bid` is the team that decides it. */
export const waitsOn = (c: Cal, q: LeaveRequest, bid: string) => q.approvals[bid] === "pending" && decidingTeam(c, q) === bid;

/** Whether `me` sees a team's approvals: its admins and its leaders. */
export const seesApprovals = (c: Cal, me: number, bid: string) =>
  !!c.people.get(me)?.sysAdmin || isNodeAdmin(c.O, bid, me) || leadersOf(c, bid).some((p) => p.id === me);
