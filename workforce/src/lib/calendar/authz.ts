/**
 * Who may do what on the Calendar. Members act only as themselves; team admins
 * manage their team's people, schedule and settings; admins of any team (or a
 * system admin) manage org, shifts, holidays and BCP events.
 */
import { canDecide } from "./approvals";
import { canTrack } from "./trackers";
import { coveredLeaders } from "./covers";
import type { CalAction } from "./actions";
import type { Cal } from "./engine";
import { isNodeAdmin } from "./org";
import type { OrgNode } from "./types";

export interface Rights {
  sys: boolean;
  teamAdmin: (bid: string) => boolean;
  anyAdmin: boolean;
  adminOf: (pid: number) => boolean;
}

export function rightsOf(c: Cal, me: number): Rights {
  const p = c.people.get(me);
  const sys = !!p?.sysAdmin;
  // Admin of a node or anything above it (department / tower admins cover their teams).
  const teamAdmin = (bid: string) => sys || isNodeAdmin(c.O, bid, me);
  const anyAdmin = sys || c.d.nodes.some((n) => (n.admins ?? []).includes(me)) || Object.values(c.O.role ?? {}).some((x) => x.includes(me));
  const adminOf = (pid: number) => {
    const x = c.people.get(pid);
    if (sys) return true;
    if (!x) return false;
    return c.O.branchesOf(x).some((b) => isNodeAdmin(c.O, b.id, me)) || x.assign.some((a) => isNodeAdmin(c.O, a, me));
  };
  return { sys, teamAdmin, anyAdmin, adminOf };
}

/**
 * Teams a person can open: their own teams, teams they administer, and every team
 * under a department or tower they're allocated to. System admins: all teams.
 */
export function visibleTeams(c: Cal, me: number, cover = true): OrgNode[] {
  const p = c.people.get(me);
  // A stand-in also sees the teams of the leaders they cover for.
  if (cover) {
    const extra = coveredLeaders(c.d, me, c.today).flatMap((l) => visibleTeams(c, l, false));
    if (extra.length) {
      const own = visibleTeams(c, me, false);
      return own.concat(extra.filter((b) => !own.includes(b)));
    }
  }
  const all = c.d.nodes.filter((n) => n.type === "branch");
  if (!p) return [];
  if (p.sysAdmin) return all;
  const ids = new Set(c.O.branchesOf(p).map((b) => b.id));
  all.forEach((b) => isNodeAdmin(c.O, b.id, me) && ids.add(b.id));
  p.assign.forEach((a) => {
    const n = c.O.by[a];
    if (n && (n.type === "dept" || n.type === "tower")) c.O.desc(a, "branch").forEach((b) => ids.add(b.id));
  });
  return all.filter((b) => ids.has(b.id));
}

const NO = { error: "You don’t have permission to do that." };

export function authorizeCal(a: CalAction, c: Cal, me: number): { action: CalAction } | { error: string } {
  const r = rightsOf(c, me);
  const ok = (cond: boolean, action: CalAction = a) => (cond ? { action } : NO);
  switch (a.type) {
    case "submitRequest":
      if (a.adminBid) {
        const p = c.people.get(a.pid);
        return ok(!!p && r.teamAdmin(a.adminBid) && c.O.inN(p, a.adminBid), { ...a, actor: me });
      }
      return ok(c.people.has(me), { ...a, pid: me, actor: me });
    case "decide": {
      const q = c.d.requests.find((x) => x.id === a.rid);
      return ok(!!q && canDecide(c, me, q, a.bid), { ...a, actor: me });
    }
    case "decideMany": {
      const qs = a.rids.map((id) => c.d.requests.find((x) => x.id === id));
      return ok(qs.length > 0 && qs.length <= 200 && qs.every((q) => !!q && canDecide(c, me, q, a.bid)), { ...a, actor: me });
    }
    case "cancelRequest": {
      const q = c.d.requests.find((x) => x.id === a.rid);
      if (!q) return NO;
      return a.via === "self" ? ok(q.pid === me) : ok(r.adminOf(q.pid));
    }
    case "holidayWork":
      return ok(a.pid === me || r.adminOf(a.pid), { ...a, actor: me });
    case "restDayWork":
      return ok(a.pid === me || r.adminOf(a.pid), { ...a, actor: me });
    case "bulkMembers":
      return ok(a.pids.length > 0 && a.pids.every((pid) => r.adminOf(pid)));
    case "setHcHistory":
    case "setOverride":
    case "setShiftDay":
    case "setResign":
      return ok(r.adminOf(a.pid));
    case "teamSettings":
    case "addAdmin":
    case "removeAdmin":
      return ok(r.teamAdmin(a.id));
    case "setSchedule": {
      // Only the members this admin manages.
      if (!r.teamAdmin(a.bid)) return NO;
      const pids = (a.pids ?? []).filter((pid) => r.adminOf(pid));
      return pids.length ? { action: { ...a, pids } } : NO;
    }
    case "setBilled":
      return ok(r.teamAdmin(a.bid));
    case "setLinks":
      return ok(r.sys);
    case "saveMember": {
      // Name, email and leave balances: only for people this admin already manages
      // (not someone just being added from another team), and system admins only by one.
      const p = c.people.get(a.pid);
      if (!p || !r.teamAdmin(a.bid)) return NO;
      // Editing someone already allocated needs rights over them (a team admin can't
      // change a director or manager allocated above their team).
      if (!a.isNew && !r.adminOf(a.pid)) return NO;
      const mayEdit = r.adminOf(a.pid) && (!p.sysAdmin || r.sys) && !a.isNew;
      return ok(true, mayEdit ? a : { ...a, details: undefined });
    }
    case "addPerson":
    case "importUpload":
      return ok(r.teamAdmin(a.bid));
    case "removeFromTeam":
      return ok(r.teamAdmin(a.bid) && a.pid !== me);
    case "setCover": {
      // The leader themself, or an admin over them (e.g. setting it up for a lead who's away).
      const ok0 = a.leader === me || (r.adminOf(a.leader) && a.leader !== a.standIn);
      const old = a.id ? (c.d.covers ?? []).find((x) => x.id === a.id) : undefined;
      return ok(ok0 && (!old || old.leader === a.leader), { ...a, actor: me });
    }
    case "endCover": {
      const x = (c.d.covers ?? []).find((y) => y.id === a.id);
      return ok(!!x && (x.leader === me || r.adminOf(x.leader)));
    }
    case "setKpi":
      return ok(canTrack(c, me, a.team), { ...a, actor: me });
    case "saveIssue": {
      // Editing: also the team the issue was logged for.
      const old = a.issue.id ? (c.d.issues ?? []).find((x) => x.id === a.issue.id) : undefined;
      return ok(canTrack(c, me, a.issue.team) && (!old || canTrack(c, me, old.team)), { ...a, actor: me });
    }
    case "deleteIssue": {
      const old = (c.d.issues ?? []).find((x) => x.id === a.id);
      return ok(!!old && canTrack(c, me, old.team));
    }
    case "deleteMember": {
      // Only someone this admin fully manages: every team they're in is one this admin
      // runs (a team admin can't delete a person other teams still have), never themselves.
      const p = c.people.get(a.pid);
      if (!p || a.pid === me || (p.sysAdmin && !r.sys) || !r.adminOf(a.pid)) return NO;
      return ok(r.sys || c.O.branchesOf(p).every((b) => r.teamAdmin(b.id)));
    }
    case "addNode":
      return ok(r.anyAdmin, { ...a, actor: me });
    case "importOrg":
    case "renameNode":
    case "deleteNode":
    case "saveShift":
    case "deleteShift":
    case "saveHoliday":
    case "deleteHoliday":
    case "startEvent":
    case "closeEvent":
      return ok(r.anyAdmin);
    case "toggleReady":
      return ok(c.people.has(me), { ...a, pid: me });
    case "checkin":
      return ok(a.pid === me || r.adminOf(a.pid), { ...a, actor: me });
  }
}
