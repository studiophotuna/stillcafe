/**
 * Leave limit per day: a team can cap how many people may be on approved leave on the same
 * day, for the whole team and/or per system. Filing past it isn't blocked: the requester is
 * told (with other dates to try) and the approver is warned before approving. Only approved
 * leave counts.
 */
import { ANNUAL } from "./constants";
import { addDays, fmt } from "./dates";
import { Cal } from "./engine";
import type { CalPerson, Code, LeaveRequest } from "./types";

export interface CapHit {
  date: string;
  /** The team or system whose limit is reached. */
  unit: string;
  unitName: string;
  /** People already on approved leave there that day (the requester aside). */
  n: number;
  max: number;
}

const days = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = a, g = 0; d <= b && g < 400; d = addDays(d, 1), g++) out.push(d);
  return out;
};

/** People on approved leave in a unit (team or system) on a date, seen from team `bid`. */
export function onLeave(c: Cal, bid: string, unit: string, date: string, except?: number): CalPerson[] {
  return c.d.people.filter((p) => {
    if (p.id === except || !c.O.inN(p, unit) || !c.alive(p, date)) return false;
    const x = c.raw(p, date, bid);
    return !x.pending && ANNUAL.includes(x.code as Code);
  });
}

/** The limits that apply to a person: each of their teams', and their systems' in those teams. */
function limitsFor(c: Cal, p: CalPerson) {
  const out: { bid: string; unit: string; unitName: string; max: number }[] = [];
  for (const b of c.O.branchesOf(p)) {
    if ((b.leaveMax ?? 0) > 0) out.push({ bid: b.id, unit: b.id, unitName: b.name, max: b.leaveMax! });
    for (const sy of c.O.kids(b.id, "system")) {
      const max = b.leaveMaxSys?.[sy.id] ?? 0;
      if (max > 0 && c.O.inN(p, sy.id)) out.push({ bid: b.id, unit: sy.id, unitName: `${b.name} › ${sy.name}`, max });
    }
  }
  return out;
}

/** Working days in the range where a limit is already reached without this person. */
export function capHits(c: Cal, pid: number, start: string, end: string, type: Code = "VL"): CapHit[] {
  const p = c.people.get(pid);
  if (!p || !ANNUAL.includes(type)) return [];
  const lims = limitsFor(c, p);
  if (!lims.length) return [];
  const out: CapHit[] = [];
  for (const d of days(start, type === "HD" ? start : end)) {
    if (type !== "ML" && !c.workdays(d, d)) continue;
    for (const l of lims) {
      const n = onLeave(c, l.bid, l.unit, d, pid).length;
      if (n >= l.max) out.push({ date: d, unit: l.unit, unitName: l.unitName, n, max: l.max });
    }
  }
  return out;
}

/** "Mon 5 Oct: 3 of 3 already on leave in Rate Management". */
export const hitText = (h: CapHit) => `${fmt(h.date)}: ${h.n} of ${h.max} already on leave in ${h.unitName}`;

/**
 * Other dates to try: the nearest ranges with the same number of working days (from today on)
 * where no limit is reached, up to `n` of them, within about two months either side.
 */
export function suggestDates(c: Cal, pid: number, start: string, end: string, type: Code, n = 3): { start: string; end: string }[] {
  const len = type === "HD" ? 1 : type === "ML" ? days(start, end).length : Math.max(1, c.workdays(start, end));
  const span = (s: string) => {
    if (type === "HD") return s;
    if (type === "ML") return addDays(s, len - 1);
    let e = s;
    for (let k = c.workdays(s, s) ? 1 : 0, g = 0; k < len && g < 60; g++) {
      e = addDays(e, 1);
      if (c.workdays(e, e)) k++;
    }
    return e;
  };
  const out: { start: string; end: string; dist: number }[] = [];
  for (let off = 1; off <= 60 && out.length < n * 2; off++)
    for (const s of [addDays(start, off), addDays(start, -off)]) {
      if (s < c.today || (type !== "ML" && !c.workdays(s, s))) continue;
      const e = span(s);
      if (!capHits(c, pid, s, e, type).length) out.push({ start: s, end: e, dist: off });
    }
  return out.sort((a, b) => a.dist - b.dist || a.start.localeCompare(b.start)).slice(0, n).map(({ start, end }) => ({ start, end }));
}

/**
 * Approving these requests (in order): where each one would put its team or system past the
 * limit, counting the ones approved before it in the same batch.
 */
export function approveHits(c: Cal, qs: LeaveRequest[]): { q: LeaveRequest; hits: CapHit[] }[] {
  const out: { q: LeaveRequest; hits: CapHit[] }[] = [];
  let cur = c;
  for (const q of qs) {
    const hits = ANNUAL.includes(q.type) ? capHits(cur, q.pid, q.start, q.end, q.type) : [];
    if (hits.length) out.push({ q, hits });
    const approvals = Object.fromEntries(Object.keys(q.approvals).map((k) => [k, "approved" as const]));
    cur = new Cal({ ...cur.d, requests: cur.d.requests.map((x) => (x.id === q.id ? { ...x, approvals } : x)) }, cur.today);
  }
  return out;
}
