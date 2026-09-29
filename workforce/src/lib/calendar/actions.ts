/**
 * Serializable Calendar actions. Applied optimistically in the browser and
 * re-applied by the server (/api/cal/action) to the stored calendar.
 */
import { fmtT } from "../workload/clock";
import { ANNUAL, CODES, LEVELS, TYPE_L, first, isLeader } from "./constants";
import { addDays, dowOf, fmtY, isWk, MONL } from "./dates";
import { Cal, evState, logsDecision, logsSubmit } from "./engine";
import { allocProblem, hcTeamOf, mkOrg, primaryTeamOf, teamDefaults, withHcChange, type Org } from "./org";
import { planOrgImport, type OrgRow } from "./orgImport";
import { applyUpload, checkUpload, type UploadMode, type UploadRow } from "./uploads";
import type { CalPerson, AppLinks, HcTag,
  BcpEvent, BcpStatus, CalendarData, Code, Holiday, LeaveRequest, Level, NodeType, NotifLog, OrgNode, Shift,
} from "./types";
import type { ReadyKey } from "./constants";

export interface RequestForm {
  type: Code;
  start: string;
  end: string;
  half: "AM" | "PM";
  reason: string;
}

export type CalAction =
  | { type: "submitRequest"; pid: number; form: RequestForm; adminBid: string | null; actor: number }
  | { type: "decide"; rid: string; bid: string; st: "approved" | "declined"; actor: number }
  | { type: "cancelRequest"; rid: string; via: "self" | "admin" }
  | { type: "setOverride"; pid: number; date: string; code: Code | null }
  | { type: "setShiftDay"; pid: number; date: string; shift: string }
  | { type: "holidayWork"; pid: number; date: string; code: "RTO" | "WFH" | "HOL" | null; actor: number }
  | { type: "restDayWork"; pid: number; date: string; actor: number }
  | { type: "teamSettings"; id: string; patch: Partial<Pick<OrgNode, "mode" | "notifyAdmin" | "notifyUser" | "invite" | "defaultScope" | "costCentre" | "schedPeriod">> }
  | { type: "setSchedule"; bid: string; pids: number[]; from: string; to: string; shift: string | null; days: Partial<Record<number, SchedDay>> }
  | { type: "setBilled"; pid: number; bid: string; months: string[]; value: number | null }
  | { type: "setLinks"; links: AppLinks }
  | { type: "addAdmin"; id: string; pid: number }
  | { type: "removeAdmin"; id: string; pid: number }
  | { type: "addNode"; ntype: NodeType; parent: string | null; name: string; actor: number }
  | { type: "importOrg"; dept: string; rows: OrgRow[] }
  | { type: "renameNode"; id: string; name: string }
  | { type: "deleteNode"; id: string }
  | { type: "saveMember"; pid: number; level: Level; shift: string; adminHere: boolean; bid: string; assign: string[]; isNew: boolean; details?: MemberDetails; hcFrom?: string }
  | { type: "setHcHistory"; pid: number; history: HcTag[] }
  | { type: "bulkMembers"; pids: number[]; level?: Level; approver?: number; shift?: string; wfhDays?: number[] }
  | { type: "addPerson"; details: MemberDetails & { name: string; email: string }; level: Level; shift: string; adminHere: boolean; bid: string; assign: string[] }
  | { type: "removeFromTeam"; pid: number; bid: string }
  | { type: "setResign"; pid: number; date: string | null }
  | { type: "saveShift"; orig: string | null; rec: Shift }
  | { type: "deleteShift"; id: string }
  | { type: "saveHoliday"; rec: Holiday; isNew: boolean }
  | { type: "deleteHoliday"; id: string }
  | { type: "toggleReady"; pid: number; key: ReadyKey }
  | { type: "checkin"; evId: string; pid: number; status: BcpStatus; note: string; actor: number }
  | { type: "startEvent"; name: string; start: string; scope: string; note: string }
  | { type: "closeEvent"; id: string }
  | { type: "importUpload"; mode: UploadMode; rows: UploadRow[]; bid: string };

/** What a weekday becomes in Update schedules: a status, or "" for the person's usual pattern. */
export type SchedDay = "RTO" | "WFH" | "RD" | "RDOT" | "";
const SCHED_DAYS: SchedDay[] = ["RTO", "WFH", "RD", "RDOT", ""];

/** Editable person details (Members › Add / Edit). */
export interface MemberDetails {
  name?: string;
  email?: string;
  hire?: string;
  entitle?: number;
  elEnt?: number;
  carry?: number;
  ytd?: number;
  ytdEl?: number;
  /** Weekdays worked from home by default, 1 = Mon … 5 = Fri. */
  wfhDays?: number[];
  /** Headcount team when allocated to several teams ("" = the first allocation's team). */
  primaryTeam?: string;
  /** Assigned approver (a team leader or above); 0 = none. */
  approver?: number;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Keep primaryTeam only when it's one of several teams the person is allocated to. */
function fixPrimary<T extends CalPerson>(O: Cal["O"], p: T): T {
  const bs = O.branchesOf(p);
  if (bs.length > 1 && bs.some((b) => b.id === p.primaryTeam)) return p;
  const { primaryTeam: _drop, ...rest } = p;
  return (bs.length > 1 ? { ...rest, primaryTeam: bs[0].id } : rest) as T;
}

/** Clean and validate details; returns an error message or the cleaned patch. */
export function cleanDetails(d: CalendarData, m: MemberDetails, selfId: number | null): { error: string } | { patch: MemberDetails } {
  const out: MemberDetails = {};
  if (m.name !== undefined) {
    const n = m.name.trim().replace(/\s+/g, " ");
    if (!n) return { error: "Enter the person’s name." };
    out.name = n;
  }
  if (m.email !== undefined) {
    const e = m.email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return { error: "Enter a valid email address." };
    if (d.people.some((p) => p.id !== selfId && p.email.toLowerCase() === e)) return { error: "Someone already has that email." };
    out.email = e;
  }
  if (m.hire !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.hire)) return { error: "Enter the hire date." };
    out.hire = m.hire;
  }
  const num = (v: number | undefined, lo: number, hi: number, label: string) => {
    if (v === undefined) return undefined;
    if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${label} must be between ${lo} and ${hi}.`);
    return Math.round(v * 2) / 2;
  };
  try {
    const e1 = num(m.entitle, 0, 60, "VL + SL entitlement");
    const e2 = num(m.elEnt, 0, 30, "Emergency leave");
    const e3 = num(m.carry, 0, 5, "Carry-over");
    const e4 = num(m.ytd, 0, 60, "VL + SL already used");
    const e5 = num(m.ytdEl, 0, 30, "EL already used");
    if (e1 !== undefined) out.entitle = e1;
    if (e2 !== undefined) out.elEnt = e2;
    if (e3 !== undefined) out.carry = e3;
    if (e4 !== undefined) out.ytd = e4;
    if (e5 !== undefined) out.ytdEl = e5;
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (m.wfhDays !== undefined) out.wfhDays = [...new Set(m.wfhDays.filter((x) => x >= 1 && x <= 5))].sort();
  if (typeof m.primaryTeam === "string") out.primaryTeam = m.primaryTeam;
  if (m.approver !== undefined) {
    const ap = d.people.find((p) => p.id === m.approver);
    if (m.approver && (!ap || ap.id === selfId || !isLeader(ap.level))) return { error: "The approver must be a team lead, manager or director (not the person themselves)." };
    out.approver = m.approver || undefined;
  }
  return { patch: out };
}

export interface CalOutcome {
  data: CalendarData;
  message?: string;
  /** Validation problem; data is unchanged. */
  error?: string;
  /** Id of a person created by this action. */
  newPersonId?: number;
}

const pushLogs = (d: CalendarData, ls: Omit<NotifLog, "id">[]): CalendarData => {
  let seq = d.seq;
  const nl = ls.map((l) => ({ ...l, id: "N" + seq++ }));
  return { ...d, logs: nl.reverse().concat(d.logs), seq };
};
const setNode = (d: CalendarData, id: string, patch: Partial<OrgNode>): CalendarData => ({
  ...d,
  nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
});
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Create a request with per-team approvals; returns the new data, the request and its notifications. */
export function createRequest(c: Cal, pid: number, f: RequestForm, adminBid: string | null, now: number) {
  const d = c.d;
  const approvals: LeaveRequest["approvals"] = {};
  const p = c.person(pid);
  // Team leads and above don't need approval; members' requests follow the team's setting
  // (approved when an admin enters them on the calendar).
  const lead = isLeader(p.level);
  c.O.branchesOf(p).forEach((b) => {
    approvals[b.id] = lead || b.id === adminBid || b.mode === "auto" ? "approved" : "pending";
  });
  const q: LeaveRequest = {
    id: "LR" + String(d.seq).padStart(6, "0"),
    pid,
    type: f.type,
    start: f.start,
    end: f.type === "HD" ? f.start : f.end,
    half: f.type === "HD" ? f.half : null,
    reason: f.reason || "",
    created: c.today,
    approvals,
  };
  const next: CalendarData = { ...d, requests: [q].concat(d.requests), seq: d.seq + 1 };
  return { data: pushLogs(next, logsSubmit(new Cal(next, c.today), q, fmtT(now), adminBid)), q };
}

/**
 * Apply an action. Afterwards, anyone whose headcount team changed (moved, primary team
 * changed, removed from a team) gets it recorded from this month (or the month an admin
 * chose), so earlier months stay with the team they were in.
 */
export function applyCalAction(d: CalendarData, a: CalAction, today: string, now: number): CalOutcome {
  const out = applyInner(d, a, today, now);
  if (out.error || out.data === d || a.type === "setHcHistory") return out;
  const month = a.type === "saveMember" && a.hcFrom && /^\d{4}-\d{2}$/.test(a.hcFrom) ? a.hcFrom : today.slice(0, 7);
  return { ...out, data: recordHcChanges(d, out.data, month) };
}

const subsIn = (O: Org, p: CalPerson, team: string | undefined) =>
  team ? [...new Set(p.assign.filter((x) => O.anc(x).includes(team)).map((x) => O.sub(x)).filter(Boolean))].join(", ") : "";

export function recordHcChanges(before: CalendarData, after: CalendarData, month: string): CalendarData {
  if (before.people === after.people && before.nodes === after.nodes) return after;
  const Ob = mkOrg(before.nodes);
  const Oa = after.nodes === before.nodes ? Ob : mkOrg(after.nodes);
  const prev = new Map(before.people.map((p) => [p.id, p]));
  let changed = false;
  const people = after.people.map((p) => {
    const q = prev.get(p.id);
    if (!q) return p;
    const was = primaryTeamOf(Ob, q);
    const now = primaryTeamOf(Oa, p);
    if (was === now) return p;
    changed = true;
    return withHcChange(p, hcTeamOf(Ob, q, month) ?? was, subsIn(Ob, q, was), now, month);
  });
  return changed ? { ...after, people } : after;
}

function applyInner(d: CalendarData, a: CalAction, today: string, now: number): CalOutcome {
  const c = new Cal(d, today);
  const at = fmtT(now);
  switch (a.type) {
    case "submitRequest": {
      const f = a.form;
      if (!c.people.has(a.pid) || !CODES[f.type] || f.type === "HOL" || f.type === "HDY") return { data: d };
      const n = f.type === "HD" ? (c.workdays(f.start, f.start) ? 0.5 : 0) : c.workdays(f.start, f.end);
      if (!n || (f.type !== "HD" && f.end < f.start)) return { data: d };
      const { data, q } = createRequest(c, a.pid, f, a.adminBid, now);
      const p = c.person(a.pid);
      if (a.adminBid && q.approvals[a.adminBid] === "approved") return { data, message: `${CODES[f.type].label} recorded for ${first(p.name)}. Notifications sent.` };
      const pend = Object.keys(q.approvals).filter((k) => q.approvals[k] === "pending").map((k) => c.O.by[k].name);
      return {
        data,
        message: pend.length
          ? `Request sent. The ${pend.join(" and ")} admin${pend.length > 1 ? "s" : ""} will get an email to approve it.`
          : "Approved automatically. It’s on the calendar now.",
      };
    }
    case "decide": {
      const q = d.requests.find((x) => x.id === a.rid);
      if (!q || q.approvals[a.bid] !== "pending") return { data: d };
      const upd = { ...q, approvals: { ...q.approvals, [a.bid]: a.st }, decided: { ...(q.decided ?? {}), [a.bid]: { by: a.actor, at } } };
      const next: CalendarData = { ...d, requests: d.requests.map((x) => (x.id === q.id ? upd : x)) };
      const ls = logsDecision(new Cal(next, today), upd, a.bid, a.st, at, "admin");
      const p = c.person(q.pid);
      const inv = ls.find((l) => l.kind === "invite");
      return {
        data: pushLogs(next, ls),
        message:
          a.st === "approved"
            ? `Approved. ${first(p.name)} has been emailed` +
              (inv ? ` and an Outlook reminder was sent to ${inv.toIds.length} ${c.O.by[a.bid].name} members.` : ".")
            : `Declined. ${first(p.name)} has been emailed.`,
      };
    }
    case "cancelRequest": {
      const q = d.requests.find((x) => x.id === a.rid);
      if (!q) return { data: d };
      return {
        data: { ...d, requests: d.requests.filter((x) => x.id !== a.rid) },
        message: a.via === "self" ? "Request cancelled. Your admins have been told." : `Leave removed. ${first(c.person(q.pid).name)} has been emailed.`,
      };
    }
    case "setOverride": {
      const k = a.pid + "|" + a.date;
      const overrides = { ...d.overrides };
      if (a.code) overrides[k] = a.code;
      else delete overrides[k];
      return { data: { ...d, overrides } };
    }
    case "holidayWork": {
      // A member working on a holiday (or back to not working): shows as holiday duty.
      const p = c.people.get(a.pid);
      const h = p && c.holFor(p, a.date);
      if (!p || !h || isWk(a.date) || (p.resign && a.date > p.resign) || (a.code !== null && a.code !== "RTO" && a.code !== "WFH" && a.code !== "HOL")) return { data: d };
      const k = a.pid + "|" + a.date;
      const overrides = { ...d.overrides };
      if (a.code) overrides[k] = a.code;
      else delete overrides[k];
      const self = a.actor === a.pid;
      const work = a.code === "RTO" || a.code === "WFH";
      // Confirming a holiday nobody was told otherwise about needs no message to admins.
      const wasWorking = ["RTO", "WFH", "HDY"].includes(d.overrides[k] ?? "");
      const what = work ? `working on ${h.name} (${a.code === "WFH" ? "from home" : "in the office"})` : `not working on ${h.name}`;
      const logs = c.O.branchesOf(p).flatMap((b) => {
        const admins = (b.admins ?? []).filter((i) => i !== a.actor).map((i) => c.people.get(i)).filter((x): x is CalPerson => !!x);
        if (!b.notifyAdmin || !admins.length || (!work && !wasWorking)) return [];
        return [{
          kind: "email" as const, at, did: b.id, toIds: admins.map((x) => x.id),
          toLine: admins.map((x) => `${x.name} <${x.email}>`).join("; "), toShort: admins.map((x) => x.name).join(", "),
          subject: `Holiday update: ${p.name} is ${what}`,
          lines: [
            `Hi ${first(admins[0].name)},`,
            `${p.name} is ${what}, ${fmtY(a.date)}.` + (self ? "" : ` Updated by ${c.person(a.actor).name}.`),
            "The calendar shows this day as holiday duty" + (work ? "." : " no longer."),
          ],
        }];
      });
      return {
        data: pushLogs({ ...d, overrides }, logs),
        message: work
          ? `${self ? "You’re" : first(p.name) + " is"} on holiday duty ${fmtY(a.date)} (${a.code === "WFH" ? "work from home" : "in office"}).`
          : `${fmtY(a.date)} is back to a holiday${self ? " for you" : " for " + first(p.name)}.`,
      };
    }
    case "restDayWork": {
      // Working on a weekend (or rest day) with no schedule: it becomes rest day overtime.
      const p = c.people.get(a.pid);
      if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(a.date) || (p.resign && a.date > p.resign)) return { data: d };
      const cell = c.raw(p, a.date, null);
      // Members tag their own weekends; admins may also tag a weekday rest day.
      const self = a.actor === a.pid;
      if (!(isWk(a.date) || (!self && cell.code === "RD")) || c.holFor(p, a.date) || (cell.code && cell.code !== "RD")) return { data: d };
      return { data: { ...d, overrides: { ...d.overrides, [a.pid + "|" + a.date]: "RDOT" } }, message: `${fmtY(a.date)} is marked as rest day OT.` };
    }
    case "setSchedule": {
      // Several members at once, for a week or a month: shift and/or each weekday's status.
      // Holidays keep their own status (members reply to those); approved leave still shows over it.
      const days = Object.entries(a.days ?? {}).filter(([k, v]) => /^[0-6]$/.test(k) && SCHED_DAYS.includes(v as SchedDay));
      const shift = a.shift && d.shifts.some((x) => x.id === a.shift) ? a.shift : null;
      const pids = [...new Set(a.pids)].filter((id) => c.people.has(id) && c.O.inN(c.person(id), a.bid));
      if (!pids.length || !/^\d{4}-\d{2}-\d{2}$/.test(a.from) || !/^\d{4}-\d{2}-\d{2}$/.test(a.to) || a.to < a.from) return { data: d, error: "Pick members and dates." };
      if (!shift && !days.length) return { data: d, error: "Choose a shift or a status for at least one day." };
      const overrides = { ...d.overrides };
      const roster = { ...d.roster };
      let n = 0;
      for (let dt = a.from, g = 0; dt <= a.to && g < 62; dt = addDays(dt, 1), g++) {
        const dow = String(dowOf(dt));
        const set = days.find(([k]) => k === dow)?.[1] as SchedDay | undefined;
        for (const pid of pids) {
          const p = c.person(pid);
          if (!c.alive(p, dt)) continue;
          const k = pid + "|" + dt;
          if (!isWk(dt) && c.holFor(p, dt)) continue;
          if (set !== undefined) {
            if (set) overrides[k] = set;
            else delete overrides[k];
            n++;
          }
          if (shift) {
            if (shift === p.shift) delete roster[k];
            else roster[k] = shift;
          }
        }
      }
      const who = pids.length === 1 ? first(c.person(pids[0]).name) : `${pids.length} members`;
      return { data: { ...d, overrides, roster }, message: `Schedule updated for ${who}, ${fmtY(a.from)} – ${fmtY(a.to)}.` + (n || shift ? "" : " Nothing to change.") };
    }
    case "setShiftDay":
      return {
        data: { ...d, roster: { ...d.roster, [a.pid + "|" + a.date]: a.shift } },
        message: `Shift updated for ${first(c.person(a.pid).name)}.`,
      };
    case "teamSettings": {
      // Only these settings; admins, parent etc. change through their own actions.
      const p = a.patch ?? {};
      const patch: Partial<OrgNode> = {};
      if (p.mode === "auto" || p.mode === "approval") patch.mode = p.mode;
      if (p.defaultScope === "all" || p.defaultScope === "me") patch.defaultScope = p.defaultScope;
      for (const k of ["notifyAdmin", "notifyUser", "invite"] as const) if (typeof p[k] === "boolean") patch[k] = p[k];
      if (typeof p.costCentre === "string") patch.costCentre = p.costCentre.trim().slice(0, 40);
      if (p.schedPeriod === "week" || p.schedPeriod === "month") patch.schedPeriod = p.schedPeriod;
      if (!c.O.by[a.id] || !Object.keys(patch).length) return { data: d };
      return { data: setNode(d, a.id, patch), message: "Saved." };
    }
    case "setBilled": {
      // Headcount report: billed FTE for a person in a team for some months (null = back to the default).
      if (!c.people.has(a.pid) || !c.O.by[a.bid] || !Array.isArray(a.months) || a.months.length > 12) return { data: d };
      if (a.value !== null && !(typeof a.value === "number" && a.value >= 0 && a.value <= 1)) return { data: d, error: "Billed must be between 0 and 1." };
      const billing = { ...(d.billing ?? {}) };
      for (const m of a.months) {
        if (!/^\d{4}-\d{2}$/.test(m)) continue;
        const k = `${a.pid}|${a.bid}|${m}`;
        if (a.value === null) delete billing[k];
        else billing[k] = Math.round(a.value * 100) / 100;
      }
      return { data: { ...d, billing }, message: "Billed updated." };
    }
    case "setLinks": {
      const ok = (u: unknown) => typeof u === "string" && /^https:\/\/\S{3,490}$/.test(u.trim());
      const l = a.links ?? {};
      const payDates = [...new Set((Array.isArray(l.payrollDates) ? l.payrollDates : []).filter((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x))))].sort().slice(-120);
      const links: AppLinks = {
        bipoLeave: ok(l.bipoLeave) ? l.bipoLeave!.trim() : undefined,
        bipoOt: ok(l.bipoOt) ? l.bipoOt!.trim() : undefined,
        quick: (Array.isArray(l.quick) ? l.quick : [])
          .filter((q) => q && ok(q.url) && typeof q.label === "string" && q.label.trim())
          .slice(0, 20)
          .map((q) => ({ label: q.label.trim().slice(0, 40), url: q.url.trim() })),
        payrollDates: payDates.length ? payDates : undefined,
        payrollNote: typeof l.payrollNote === "string" && l.payrollNote.trim() ? l.payrollNote.trim().slice(0, 200) : undefined,
      };
      return { data: { ...d, links }, message: "Links saved." };
    }
    case "addAdmin": {
      const b = c.O.by[a.id];
      if (!b || b.admins?.includes(a.pid)) return { data: d };
      return { data: setNode(d, a.id, { admins: (b.admins ?? []).concat(a.pid) }), message: `${c.person(a.pid).name} is now an admin of ${b.name}.` };
    }
    case "removeAdmin": {
      const b = c.O.by[a.id];
      // A team keeps at least one admin; a department or tower may have none.
      if (!b || !(b.admins ?? []).includes(a.pid) || (b.type === "branch" && (b.admins ?? []).length < 2)) return { data: d };
      return { data: setNode(d, a.id, { admins: b.admins!.filter((x) => x !== a.pid) }), message: `${c.person(a.pid).name} is no longer an admin.` };
    }
    case "addNode": {
      const nm = a.name.trim();
      if (!nm) return { data: d };
      const n: OrgNode = {
        id: "n" + now.toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        type: a.ntype,
        name: nm,
        parent: a.parent,
        ...(a.ntype === "branch" ? teamDefaults({ admins: [a.actor] }) : {}),
      };
      return { data: { ...d, nodes: d.nodes.concat(n) }, message: `${TYPE_L[a.ntype]} “${nm}” added.` };
    }
    case "importOrg": {
      if (!Array.isArray(a.rows) || a.rows.length > 2000) return { data: d, error: "Paste up to 2,000 rows." };
      const plan = planOrgImport(d, a.dept, a.rows.map((r) => (Array.isArray(r) ? r.map(String) : [])), "n" + now.toString(36) + "_");
      if (plan.errors.length) return { data: d, error: plan.errors[0] };
      if (!plan.add.length) return { data: d, message: "Nothing new to add — everything in the list is already there." };
      const n = (t: NodeType) => plan.add.filter((x) => x.type === t).length;
      const parts = (["tower", "branch", "system", "trade"] as NodeType[]).filter((t) => n(t)).map((t) => `${n(t)} ${TYPE_L[t].toLowerCase()}${n(t) === 1 ? "" : "s"}`);
      return { data: { ...d, nodes: plan.nodes }, message: `Added ${parts.join(", ")}.` };
    }
    case "renameNode": {
      const nm = a.name.trim();
      if (!nm || !c.O.by[a.id]) return { data: d };
      return { data: setNode(d, a.id, { name: nm }), message: `Renamed to ${nm}.` };
    }
    case "deleteNode": {
      const n = c.O.by[a.id];
      if (!n) return { data: d };
      const ids = [n.id].concat(c.O.desc(n.id).map((x) => x.id));
      const soft = n.type === "system" || n.type === "trade";
      return {
        data: {
          ...d,
          nodes: d.nodes.filter((x) => !ids.includes(x.id)),
          people: d.people.map((p) => {
            let as = p.assign.map((x) => (ids.includes(x) ? (soft ? n.parent : null) : x)).filter((x): x is string => !!x);
            as = as.filter((x, i) => as.indexOf(x) === i);
            return { ...p, assign: as };
          }),
        },
        message: `${TYPE_L[n.type]} “${n.name}” deleted.`,
      };
    }
    case "addPerson": {
      const b = c.O.by[a.bid];
      if (!b || !LEVELS[a.level]) return { data: d, error: "Choose a role and team." };
      const bad = allocProblem(c.O, a.level, a.assign);
      if (bad) return { data: d, error: bad };
      const cl = cleanDetails(d, { hire: today, entitle: 25, elEnt: 5, carry: 0, ytd: 0, ytdEl: 0, wfhDays: [], ...a.details }, null);
      if ("error" in cl) return { data: d, error: cl.error };
      if (!cl.patch.name || !cl.patch.email) return { data: d, error: "Enter the person’s name and email." };
      const id = Math.max(0, ...d.people.map((p) => p.id)) + 1;
      const person = {
        id, name: cl.patch.name, email: cl.patch.email, level: a.level, assign: [...new Set(a.assign)], pattern: "A" as const,
        shift: d.shifts.some((x) => x.id === a.shift) ? a.shift : d.shifts[0]?.id ?? "D", hire: cl.patch.hire!, resign: null,
        ytd: cl.patch.ytd ?? 0, ytdEl: cl.patch.ytdEl ?? 0, carry: cl.patch.carry ?? 0, entitle: cl.patch.entitle ?? 25,
        elEnt: cl.patch.elEnt ?? 5, wfhDays: cl.patch.wfhDays ?? [],
        primaryTeam: cl.patch.primaryTeam,
      };
      let next: CalendarData = { ...d, people: d.people.concat(fixPrimary(c.O, person)) };
      if (a.adminHere && a.assign.some((x) => c.O.anc(x).includes(a.bid))) next = setNode(next, a.bid, { admins: (b.admins ?? []).concat(id) });
      return { data: next, message: `${person.name} added.`, newPersonId: id };
    }
    case "saveMember": {
      const p = c.people.get(a.pid);
      const b = c.O.by[a.bid];
      if (!p || !b || !LEVELS[a.level]) return { data: d, error: "Choose a role and team." };
      const bad = allocProblem(c.O, a.level, a.assign);
      if (bad) return { data: d, error: bad };
      const cl = cleanDetails(d, a.details ?? {}, a.pid);
      if ("error" in cl) return { data: d, error: cl.error };
      let next: CalendarData = {
        ...d,
        people: d.people.map((x) => (x.id === a.pid ? fixPrimary(c.O, { ...x, ...cl.patch, assign: [...new Set(a.assign)], level: a.level, shift: a.shift || x.shift }) : x)),
      };
      const inHere = a.assign.some((x) => c.O.anc(x).includes(a.bid));
      let na = (b.admins ?? []).filter((x) => x !== a.pid);
      if (a.adminHere && inHere) na = na.concat(a.pid);
      if (na.join() !== (b.admins ?? []).join()) next = setNode(next, a.bid, { admins: na });
      return { data: next, message: p.name + (a.isNew ? " added." : " updated.") };
    }
    case "bulkMembers": {
      // Several members at once: only the fields given change. A role that doesn't fit
      // someone's allocations (e.g. Manager without a tower) is skipped for them.
      const pids = [...new Set(a.pids)].filter((id) => c.people.has(id));
      if (!pids.length) return { data: d, error: "Select members first." };
      if (a.level && !LEVELS[a.level]) return { data: d, error: "Choose a role." };
      if (a.shift && !d.shifts.some((x) => x.id === a.shift)) return { data: d, error: "Choose a shift." };
      const ap = a.approver ? c.people.get(a.approver) : undefined;
      if (a.approver && (!ap || !isLeader(ap.level))) return { data: d, error: "The approver must be a team lead, manager or director." };
      const wfh = a.wfhDays ? [...new Set(a.wfhDays.filter((x) => x >= 1 && x <= 5))].sort() : undefined;
      const skipped: string[] = [];
      let n = 0;
      const people = d.people.map((p) => {
        if (!pids.includes(p.id)) return p;
        const next = { ...p };
        if (a.level && a.level !== p.level) {
          if (allocProblem(c.O, a.level, p.assign)) skipped.push(p.name);
          else next.level = a.level;
        }
        if (a.approver !== undefined) {
          if (a.approver === 0) delete next.approver;
          else if (a.approver !== p.id) next.approver = a.approver;
        }
        if (a.shift) next.shift = a.shift;
        if (wfh) next.wfhDays = wfh;
        n++;
        return next;
      });
      return {
        data: { ...d, people },
        message: `${plural(n, "member")} updated.` + (skipped.length ? ` Role not changed for ${skipped.join(", ")} (their allocations don’t fit it).` : ""),
      };
    }
    case "setHcHistory": {
      // Admin edits a person's headcount tagging: months must be yyyy-mm, teams real teams (or none).
      const p = c.people.get(a.pid);
      if (!p || !Array.isArray(a.history)) return { data: d };
      const rows = a.history
        .filter((x) => x && /^(\d{4}-(0[1-9]|1[0-2])|0000-00)$/.test(x.from) && (x.team === "" || c.O.by[x.team]?.type === "branch"))
        .map((x) => ({ from: x.from, team: x.team, ...(x.sub?.trim() ? { sub: x.sub.trim().slice(0, 80) } : {}) }))
        .sort((x, y) => x.from.localeCompare(y.from))
        .filter((x, i, all) => i === all.length - 1 || all[i + 1].from !== x.from);
      if (!rows.length) return { data: d, error: "Add at least one period." };
      rows[0] = { ...rows[0], from: "0000-00" };
      return {
        data: { ...d, people: d.people.map((x) => (x.id === a.pid ? { ...x, hcHistory: rows } : x)) },
        message: `Headcount tagging saved for ${p.name}.`,
      };
    }
    case "removeFromTeam": {
      const p = c.people.get(a.pid);
      if (!p) return { data: d };
      const left = p.assign.filter((x) => !c.O.anc(x).includes(a.bid));
      if (!left.length) return { data: d, message: `${first(p.name)} has no other allocation. Use Edit to move them, or record a resignation.` };
      return {
        data: { ...d, people: d.people.map((x) => (x.id === a.pid ? fixPrimary(c.O, { ...x, assign: left }) : x)) },
        message: `${p.name} removed from ${c.O.by[a.bid]?.name}. Their other allocations are unchanged.`,
      };
    }
    case "setResign": {
      const p = c.people.get(a.pid);
      if (!p) return { data: d };
      if (!a.date)
        return {
          data: { ...d, people: d.people.map((x) => (x.id === a.pid ? { ...x, resign: null } : x)) },
          message: `Resignation withdrawn for ${p.name}.`,
        };
      const dt = a.date;
      const [y, m] = dt.split("-").map(Number);
      const nm = `${MONL[m % 12]} ${m === 12 ? y + 1 : y}`;
      return {
        data: {
          ...d,
          people: d.people.map((x) => (x.id === a.pid ? { ...x, resign: dt } : x)),
          requests: d.requests.filter((q) => !(q.pid === a.pid && q.start > dt)),
        },
        message: `${p.name} will not appear from ${nm} onwards.`,
      };
    }
    case "saveShift": {
      const r = a.rec;
      if (!r.id.trim() || !r.name.trim() || !r.start || !r.end) return { data: d };
      if (!a.orig && d.shifts.some((x) => x.id.toLowerCase() === r.id.toLowerCase())) return { data: d };
      const rec = { ...r, id: r.id.trim(), name: r.name.trim() };
      return {
        data: { ...d, shifts: a.orig ? d.shifts.map((x) => (x.id === a.orig ? { ...rec, id: a.orig } : x)) : d.shifts.concat(rec) },
        message: `${rec.name} saved.`,
      };
    }
    case "deleteShift": {
      const x = d.shifts.find((s) => s.id === a.id);
      if (!x || d.shifts.length < 2) return { data: d };
      const fb = d.shifts.find((y) => y.id !== a.id)!.id;
      return {
        data: {
          ...d,
          shifts: d.shifts.filter((y) => y.id !== a.id),
          people: d.people.map((p) => (p.shift === a.id ? { ...p, shift: fb } : p)),
          roster: Object.fromEntries(Object.entries(d.roster).filter(([, v]) => v !== a.id)),
        },
        message: `${x.name} deleted. People on it moved to ${fb}.`,
      };
    }
    case "saveHoliday": {
      const r = a.rec;
      if (!r.date || !r.name.trim()) return { data: d };
      const rec = { ...r, name: r.name.trim() };
      const scopeName = rec.scope === "all" ? "everyone" : (c.O.by[rec.scope]?.name ?? "Removed");
      return {
        data: { ...d, holidays: a.isNew ? d.holidays.concat(rec) : d.holidays.map((x) => (x.id === rec.id ? rec : x)) },
        message: `${rec.name} (${fmtY(rec.date)}) ` + (a.isNew ? `added. It shows as HOL for ${scopeName}.` : "updated."),
      };
    }
    case "deleteHoliday": {
      const h = d.holidays.find((x) => x.id === a.id);
      if (!h) return { data: d };
      return { data: { ...d, holidays: d.holidays.filter((x) => x.id !== a.id) }, message: `${h.name} removed from the calendar.` };
    }
    case "toggleReady": {
      const cur = d.bcpReady[a.pid] || {};
      return { data: { ...d, bcpReady: { ...d.bcpReady, [a.pid]: { ...cur, [a.key]: !cur[a.key], updated: today } } } };
    }
    case "checkin": {
      const ev = d.bcpEvents.find((e) => e.id === a.evId);
      if (!ev || evState(ev, today) !== "active" || !c.people.has(a.pid)) return { data: d };
      const by = a.actor !== a.pid ? ` (by ${c.person(a.actor).name})` : "";
      return {
        data: {
          ...d,
          checkins: { ...d.checkins, [ev.id]: { ...(d.checkins[ev.id] || {}), [a.pid]: { status: a.status, note: a.note, at: at + by } } },
        },
        message: a.actor === a.pid ? "Thanks. Your status is recorded." : `Status updated for ${c.person(a.pid).name}.`,
      };
    }
    case "startEvent": {
      if (!a.name.trim() || !a.start || !c.O.by[a.scope]) return { data: d };
      if (a.start < today) return { data: d, error: "Pick today or a later date." };
      const id = "E" + now.toString(36);
      const n = d.people.filter((p) => c.O.inN(p, a.scope) && !(p.resign && p.resign < a.start)).length;
      return {
        data: {
          ...d,
          bcpEvents: [{ id, name: a.name.trim(), start: a.start, end: "", scope: a.scope, status: "active", note: a.note } as BcpEvent].concat(d.bcpEvents),
          checkins: { ...d.checkins, [id]: {} },
        },
        message:
          a.start === today
            ? `BCP event started for today. ${n} people will be asked to check in by email.`
            : `BCP event set for ${fmtY(a.start)}. ${n} people will be asked to check in on that day.`,
      };
    }
    case "closeEvent": {
      const ev = d.bcpEvents.find((e) => e.id === a.id);
      if (!ev) return { data: d };
      return {
        data: { ...d, bcpEvents: d.bcpEvents.map((e) => (e.id === a.id ? { ...e, status: "closed" as const, end: today < e.start ? "" : today } : e)) },
        message: evState(ev, today) === "scheduled" ? `${ev.name} cancelled.` : `${ev.name} closed.`,
      };
    }
    case "importUpload": {
      if (!c.O.by[a.bid]) return { data: d };
      const checked = checkUpload(c, a.mode, a.rows, a.bid).filter((x) => !x.skip);
      const ok = checked.filter((x) => x.ok);
      if (!ok.length) return { data: d };
      return {
        data: applyUpload(c, a.mode, ok),
        message:
          a.mode === "members"
            ? `${plural(ok.length, "member row")} imported.`
            : `${plural(ok.length, "schedule row")} imported. No emails were sent for imported rows.`,
      };
    }
  }
}


