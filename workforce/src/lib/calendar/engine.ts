/**
 * Calendar rules (handoff README › Calendar rules), as pure functions over
 * CalendarData. Shared by the browser (optimistic updates, rendering) and the
 * server (authoritative writes).
 */
import { ANNUAL, CARRY_MAX, CODES, LEDGER_START, OOO, POOL, WORKING, first } from "./constants";
import { dowOf, isWk, rng2, fmt, workdays } from "./dates";
import { mkOrg, type Org } from "./org";
import type { BcpEvent, CalPerson, CalendarData, Code, Holiday, LeaveRequest, NotifLog } from "./types";

export interface Cell {
  code: Code | "";
  wk: boolean;
  /** After the person's last day (hatched). */
  gone?: boolean;
  pending?: boolean;
  req?: LeaveRequest;
  /** Holiday name. */
  note?: string;
  shift?: string | null;
}

/** A BCP event is active on its date only: scheduled before it, closed after it (or when an admin closes it). */
export type EvState = "scheduled" | "active" | "closed";
export const evState = (e: Pick<BcpEvent, "start" | "status">, today: string): EvState =>
  e.status === "closed" || e.start < today ? "closed" : e.start > today ? "scheduled" : "active";

export const allApproved = (q: LeaveRequest) => Object.values(q.approvals).every((v) => v === "approved");
export const anyPending = (q: LeaveRequest) => Object.values(q.approvals).some((v) => v === "pending");

/** Read model over CalendarData with memoized lookups. Create one per render/request. */
export class Cal {
  readonly O: Org;
  /** Holidays that apply to everyone, by date (used for working-day counts). */
  readonly hols: Record<string, string> = {};
  private byPid = new Map<number, LeaveRequest[]>();
  private holsByDate = new Map<string, Holiday[]>();
  readonly people: Map<number, CalPerson>;

  constructor(
    readonly d: CalendarData,
    readonly today: string,
  ) {
    this.O = mkOrg(d.nodes);
    this.people = new Map(d.people.map((p) => [p.id, p]));
    for (const h of d.holidays) {
      if (h.scope === "all") this.hols[h.date] = h.name;
      const l = this.holsByDate.get(h.date) ?? [];
      l.push(h);
      this.holsByDate.set(h.date, l);
    }
    for (const q of d.requests) {
      const l = this.byPid.get(q.pid) ?? [];
      l.push(q);
      this.byPid.set(q.pid, l);
    }
  }

  person(id: number) {
    return this.people.get(id)!;
  }
  reqsOf(pid: number) {
    return this.byPid.get(pid) ?? [];
  }
  shiftFor(p: CalPerson, d: string) {
    return this.d.roster[p.id + "|" + d] || p.shift;
  }
  holFor(p: CalPerson, d: string) {
    const l = this.holsByDate.get(d);
    return l?.find((x) => x.scope === "all" || this.O.inN(p, x.scope)) ?? null;
  }
  /** Request covering the date; per team when `bid` is given, else any non-declined. */
  findReq(pid: number, d: string, bid: string | null) {
    return this.reqsOf(pid).find(
      (q) =>
        q.start <= d &&
        d <= q.end &&
        // A team without its own say on the request (only the first team decides) shows the overall status.
        (bid && q.approvals[bid] ? q.approvals[bid] !== "declined" : Object.values(q.approvals).some((v) => v !== "declined")),
    );
  }
  workdays(a: string, b: string) {
    return workdays(a, b, this.hols);
  }
  reqDays(q: Pick<LeaveRequest, "type" | "start" | "end">) {
    // Maternity leave is counted in calendar days (RA 11210); other leave in working days.
    return q.type === "HD" ? 0.5 : q.type === "ML" ? calDays(q.start, q.end) : this.workdays(q.start, q.end);
  }

  /**
   * What a person's cell shows on a date, for one team (or combined when bid is null).
   * Order: resigned → holiday (or holiday duty) → leave → admin override → weekend → weekly pattern.
   */
  raw(p: CalPerson, d: string, bid: string | null): Cell {
    const wk = isWk(d);
    if (p.resign && d > p.resign) return { code: "", gone: true, wk };
    if (!wk) {
      const h = this.holFor(p, d);
      if (h) {
        const o = this.d.overrides[p.id + "|" + d];
        if (o && WORKING.includes(o)) return { code: "HDY", wk, note: h.name, shift: this.shiftFor(p, d) };
        return { code: "HOL", wk, note: h.name };
      }
      const q = this.findReq(p.id, d, bid);
      if (q)
        return {
          code: q.type,
          pending: bid && q.approvals[bid] ? q.approvals[bid] === "pending" : anyPending(q),
          req: q,
          wk,
        };
    }
    const o = this.d.overrides[p.id + "|" + d];
    // "HOL" is a member's reply that they're off on a holiday; it means nothing on other days.
    if (o && o !== "HOL") return { code: o, wk, shift: WORKING.includes(o) ? this.shiftFor(p, d) : null };
    if (wk) return { code: "", wk };
    const w = dowOf(d);
    const wfh = p.wfhDays ? p.wfhDays.includes(w) : p.pattern === "A" ? w === 1 || w === 2 : w === 4 || w === 5;
    return { code: wfh ? "WFH" : "RTO", wk, shift: this.shiftFor(p, d) };
  }

  // ── balances, per calendar year (VL + SL share a pool; EL and solo parent leave are
  // separate; only fully approved requests count, by the year they start) ──
  get year() {
    return Number(this.today.slice(0, 4));
  }
  private daysIn(p: CalPerson, codes: Code[], y: number) {
    return this.reqsOf(p.id)
      .filter((q) => allApproved(q) && codes.includes(q.type) && Number(q.start.slice(0, 4)) === y)
      .reduce((a, q) => a + this.reqDays(q), 0);
  }
  /** VL + SL for the year: the full entitlement, pro-rated in the hire year (unless an admin set it). */
  entOf(p: CalPerson, y = this.year) {
    const hy = hireYear(p);
    if (hy > y) return 0;
    if (hy === y) return p.entitleFirst ?? prorate(p.entitle, p.hire);
    return p.entitle;
  }
  usedOf(p: CalPerson, y = this.year) {
    return ((p.ytdYear ?? LEDGER_START) === y ? p.ytd || 0 : 0) + this.daysIn(p, POOL, y);
  }
  /** VL + SL carried into the year: as set by an admin for that year, else the automatic amount. */
  carryOf(p: CalPerson, y = this.year): number {
    return (p.carryYear ?? LEDGER_START) === y ? p.carry || 0 : this.carryAuto(p, y);
  }
  /** Automatic carry-over: last year's VL + SL left, up to CARRY_MAX (none before the app or in the hire year). */
  carryAuto(p: CalPerson, y = this.year): number {
    if (y <= LEDGER_START || hireYear(p) >= y) return 0;
    return Math.min(CARRY_MAX, Math.max(0, this.poolOf(p, y - 1) - this.usedOf(p, y - 1)));
  }
  /** Whether this year's carry-over was set by an admin. */
  carrySet(p: CalPerson, y = this.year) {
    return (p.carryYear ?? LEDGER_START) === y;
  }
  poolOf(p: CalPerson, y = this.year) {
    return this.entOf(p, y) + this.carryOf(p, y);
  }
  /** What carries into next year if nothing more is used. */
  carryNext(p: CalPerson) {
    return Math.min(CARRY_MAX, Math.max(0, this.poolOf(p) - this.usedOf(p)));
  }
  elUsedOf(p: CalPerson, y = this.year) {
    return ((p.ytdYear ?? LEDGER_START) === y ? p.ytdEl || 0 : 0) + this.daysIn(p, ["EL"], y);
  }
  /** Solo parent leave used this year (7 working days a year). */
  splUsedOf(p: CalPerson, y = this.year) {
    return this.daysIn(p, ["SPL"], y);
  }
  /** Active on a date (not resigned before it). */
  alive(p: CalPerson, d: string) {
    return !p.resign || p.resign >= d;
  }
}

// ── notification messages ──

const dLabel = (q: LeaveRequest) =>
  CODES[q.type].label.toLowerCase() + (q.type === "HD" ? ` (${q.half === "PM" ? "afternoon" : "morning"})` : "");
const whenOf = (q: LeaveRequest) =>
  q.type === "HD"
    ? `${fmt(q.start)}, ${q.half === "PM" ? "afternoon" : "morning"}`
    : q.start === q.end
      ? `${fmt(q.start)}, all day`
      : `${rng2(q.start, q.end)}, all day`;

type LogDraft = Omit<NotifLog, "id">;

/** Emails and Outlook reminders when a team decides on a request. */
export function logsDecision(c: Cal, q: LeaveRequest, bid: string, st: "approved" | "declined", at: string, how: "auto" | "admin"): LogDraft[] {
  const p = c.person(q.pid);
  const b = c.O.by[bid];
  if (!p || !b) return [];
  const adm = c.people.get((b.admins ?? [])[0]) ?? c.person(23) ?? p;
  const out: LogDraft[] = [];
  if (b.notifyUser)
    out.push({
      kind: "email",
      at,
      did: bid,
      toIds: [q.pid],
      toLine: `${p.name} <${p.email}>`,
      toShort: p.name,
      subject: `Your ${CODES[q.type].label.toLowerCase()} was ${st} · ${b.name}`,
      lines: [
        `Hi ${first(p.name)},`,
        `Your request for ${dLabel(q)} on ${rng2(q.start, q.end)} was ${how === "auto" ? "approved automatically" : `${st} by ${adm.name}`} for the ${b.name} team.`,
        st === "approved" ? `It now shows on the ${b.name} calendar.` : `If you have questions, contact ${adm.name} at ${adm.email}.`,
      ],
    });
  if (st === "approved" && b.invite && OOO.includes(q.type)) {
    const att = c.d.people.filter((x) => x.id !== q.pid && c.O.inN(x, bid) && !(x.resign && x.resign < c.today)).map((x) => x.id);
    out.push({
      kind: "invite",
      at,
      did: bid,
      toIds: att,
      toLine: `${b.name} team (${att.length} people)`,
      toShort: `${b.name} (${att.length})`,
      subject: `${p.name} · ${CODES[q.type].label} (out of office)`,
      when: whenOf(q),
      att: att.map((i) => c.person(i).name),
      lines: [
        `${p.name} will be out on ${dLabel(q)}, ${rng2(q.start, q.end)}.`,
        `Workforce Management added this reminder for the ${b.name} team. It is set to Free so it won’t block your calendar.`,
      ],
    });
  }
  return out;
}

/** Emails when a request is submitted: approval requests to admins, or decision mails for auto-approved teams. */
export function logsSubmit(c: Cal, q: LeaveRequest, at: string, adminBid: string | null): LogDraft[] {
  const p = c.person(q.pid);
  const ids = Object.keys(q.approvals);
  return ids.flatMap((bid) => {
    const b = c.O.by[bid];
    const st = q.approvals[bid];
    if (!b) return [];
    if (st === "pending") {
      // The team's admins plus the member's assigned approver (not the requester).
      const apId = p.approver && p.approver !== p.id ? p.approver : undefined;
      const admins = [...new Set((b.admins ?? []).concat(apId !== undefined ? [apId] : []))]
        .filter((i) => i !== p.id)
        .map((i) => c.people.get(i))
        .filter((x): x is CalPerson => !!x);
      if (!b.notifyAdmin || !admins.length) return [];
      const n = c.reqDays(q);
      return [
        {
          kind: "email" as const,
          at,
          did: bid,
          toIds: admins.map((a) => a.id),
          toLine: admins.map((a) => `${a.name} <${a.email}>`).join("; "),
          toShort: admins.map((a) => a.name).join(", "),
          cta: true,
          subject: `Approval needed: ${p.name} · ${CODES[q.type].label}, ${rng2(q.start, q.end)}`,
          lines: [
            `Hi ${first(admins[0].name)},`,
            `${p.name} requested ${dLabel(q)} for ${rng2(q.start, q.end)} (${n} working day${n === 1 ? "" : "s"}).`,
            `Reason: ${q.reason || "Not given"}`,
            `This request is for the ${b.name} team.` +
              (ids.length > 1 ? ` Other teams ${first(p.name)} belongs to approve it separately.` : ""),
          ],
        },
      ];
    }
    if (st === "approved") return logsDecision(c, q, bid, "approved", at, bid === adminBid ? "admin" : "auto");
    return [];
  });
}

/** Calendar days from a to b, both included. */
export const calDays = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5) + 1);
const hireYear = (p: CalPerson) => (p.hire ? Number(p.hire.slice(0, 4)) : 0);
/**
 * VL + SL in the hire year: the yearly entitlement × months left (the hire month counts when
 * they start on or before the 15th) ÷ 12, to the nearest half day.
 */
export function prorate(entitle: number, hire: string) {
  const m = Number(hire.slice(5, 7));
  const day = Number(hire.slice(8, 10));
  const months = 12 - m + (day <= 15 ? 1 : 0);
  return Math.round(((entitle * months) / 12) * 2) / 2;
}
