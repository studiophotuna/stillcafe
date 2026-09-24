/**
 * Who may do what on the Calendar. Members act only as themselves; team admins
 * manage their team's people, schedule and settings; admins of any team (or a
 * system admin) manage org, shifts, holidays and BCP events.
 */
import type { CalAction } from "./actions";
import type { Cal } from "./engine";

export interface Rights {
  sys: boolean;
  teamAdmin: (bid: string) => boolean;
  anyAdmin: boolean;
  adminOf: (pid: number) => boolean;
}

export function rightsOf(c: Cal, me: number): Rights {
  const p = c.people.get(me);
  const sys = !!p?.sysAdmin;
  const teamAdmin = (bid: string) => sys || (c.O.by[bid]?.admins ?? []).includes(me);
  const anyAdmin = sys || c.d.nodes.some((n) => (n.admins ?? []).includes(me));
  const adminOf = (pid: number) => {
    const x = c.people.get(pid);
    return sys || (!!x && c.O.branchesOf(x).some((b) => (b.admins ?? []).includes(me)));
  };
  return { sys, teamAdmin, anyAdmin, adminOf };
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
    case "decide":
      return ok(r.teamAdmin(a.bid), { ...a, actor: me });
    case "cancelRequest": {
      const q = c.d.requests.find((x) => x.id === a.rid);
      if (!q) return NO;
      return a.via === "self" ? ok(q.pid === me) : ok(r.adminOf(q.pid));
    }
    case "setOverride":
    case "setShiftDay":
    case "setResign":
      return ok(r.adminOf(a.pid));
    case "teamSettings":
    case "addAdmin":
    case "removeAdmin":
      return ok(r.teamAdmin(a.id));
    case "saveMember": {
      // Name, email and leave balances: only for people this admin already manages
      // (not someone just being added from another team), and system admins only by one.
      const p = c.people.get(a.pid);
      if (!p || !r.teamAdmin(a.bid)) return NO;
      const mayEdit = r.adminOf(a.pid) && (!p.sysAdmin || r.sys) && !a.isNew;
      return ok(true, mayEdit ? a : { ...a, details: undefined });
    }
    case "addPerson":
    case "importUpload":
      return ok(r.teamAdmin(a.bid));
    case "removeFromTeam":
      return ok(r.teamAdmin(a.bid) && a.pid !== me);
    case "addNode":
      return ok(r.anyAdmin, { ...a, actor: me });
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
