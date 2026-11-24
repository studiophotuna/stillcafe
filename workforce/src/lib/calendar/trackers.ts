/**
 * OT tracker and KPI tracker: one row per team for an ISO week or a month, grouped by tower
 * with tower totals and an overall total, as in the consolidated trackers.
 *
 * OT tracker
 * - HC: people whose primary team is the team (headcount team for the month), active in the period.
 * - PTO: approved leave days on weekdays in the period (half-day leave = 0.5); business trips aren't PTO.
 * - Working hours = HC × weekdays × 8 − PTO × 8 (a full week: HC × 40 − PTO × 8).
 * - REG / RD / HOL OT (hours): approved overtime from Workload (End work: regular, rest day OT,
 *   holiday duty), or entered by a lead for teams that don't use Workload.
 * - % Overall OT = total OT ÷ working hours; % excluding holidays = (REG + RD) ÷ working hours.
 *
 * KPI tracker
 * - Utilization, Productivity, Timeliness: Workload's figures, or entered by a lead.
 * - Accuracy: 1 − issues logged ÷ tickets resolved (Workload), or entered by a lead.
 */
import { ANNUAL, isLeader } from "./constants";
import { MON, MONL, addDays, daysInMonth, dowOf, isWk, pad } from "./dates";
import type { Cal } from "./engine";
import { hcTeamOf } from "./org";
import type { CalPerson, KpiEntry, KpiIssue, OrgNode } from "./types";

// ── periods: ISO weeks ("2026-W40") and months ("2026-09") ──

/** ISO week of a date (yyyy-mm-dd): weeks start on Monday; week 1 holds the year's first Thursday. */
export function isoWeekOf(d: string): string {
  const t = new Date(d + "T00:00:00Z");
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - dow + 3); // the Thursday of this week
  const y = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${pad(w)}`;
}

/** First and last day of a period ("2026-W40" or "2026-09"). */
export function periodRange(period: string): [string, string] {
  const wk = /^(\d{4})-W(\d{2})$/.exec(period);
  if (wk) {
    const y = Number(wk[1]);
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000 + (Number(wk[2]) - 1) * 7 * 86_400_000);
    const a = mon.toISOString().slice(0, 10);
    return [a, addDays(a, 6)];
  }
  const [y, m] = period.split("-").map(Number);
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(daysInMonth(y, m - 1))}`];
}

export const isWeek = (period: string) => /-W\d{2}$/.test(period);

/** "Wk 40 · 29 Sep – 5 Oct 2026" or "September 2026". */
export function periodLabel(period: string): string {
  const [a, b] = periodRange(period);
  const f = (s: string) => `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]}`;
  if (isWeek(period)) return `Wk ${Number(period.slice(-2))} · ${f(a)} – ${f(b)} ${b.slice(0, 4)}`;
  return `${MONL[Number(a.slice(5, 7)) - 1]} ${a.slice(0, 4)}`;
}

const days = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
};

/** Key of a team's entry for a period in CalendarData.kpi. */
export const kpiKey = (team: string, period: string) => `${team}|${period}`;

// ── Workload figures per team (from the server, or the sample data) ──

export interface WlStats {
  util: number | null;
  prod: number | null;
  time: number | null;
  /** Tickets resolved in the period. */
  done: number;
  /** Approved overtime in hours: regular, rest day OT, holiday duty. */
  reg: number;
  rd: number;
  hol: number;
}

// ── rows ──

export interface OtRow {
  team: OrgNode;
  tower: OrgNode | null;
  hc: number;
  pto: number;
  hours: number;
  reg: number;
  rd: number;
  hol: number;
  total: number;
  /** Total OT ÷ working hours, % (null without working hours). */
  pct: number | null;
  /** (REG + RD) ÷ working hours, %. */
  pctNoHol: number | null;
  /** Where the OT comes from. */
  src: "workload" | "manual" | "none";
  remark: string;
}

export interface KpiRow {
  team: OrgNode;
  tower: OrgNode | null;
  util: number | null;
  prod: number | null;
  time: number | null;
  acc: number | null;
  issues: number;
  done: number;
  src: "workload" | "manual" | "none";
  remark: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pctOf = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

/** Headcount and PTO days of a team in a period. */
export function hcPto(c: Cal, team: string, a: string, b: string) {
  const month = a.slice(0, 7);
  const people = c.d.people.filter((p: CalPerson) => hcTeamOf(c.O, p, month) === team && (!p.hire || p.hire <= b) && !(p.resign && p.resign < a));
  let pto = 0;
  for (const p of people)
    for (const d of days(a, b)) {
      if (isWk(d) || (p.hire && d < p.hire) || (p.resign && d > p.resign)) continue;
      const x = c.raw(p, d, team);
      if (x.pending || !ANNUAL.includes(x.code as never)) continue;
      pto += x.code === "HD" ? 0.5 : 1;
    }
  return { hc: people.length, pto };
}

const weekdays = (a: string, b: string) => days(a, b).filter((d) => !isWk(d)).length;

export function otRow(c: Cal, team: OrgNode, period: string, wl?: WlStats): OtRow {
  const [a, b] = periodRange(period);
  const { hc, pto } = hcPto(c, team.id, a, b);
  const hours = Math.max(0, hc * weekdays(a, b) * 8 - pto * 8);
  const e: KpiEntry = c.d.kpi?.[kpiKey(team.id, period)] ?? {};
  const manual = e.reg !== undefined || e.rd !== undefined || e.hol !== undefined;
  const reg = manual ? (e.reg ?? 0) : (wl?.reg ?? 0);
  const rd = manual ? (e.rd ?? 0) : (wl?.rd ?? 0);
  const hol = manual ? (e.hol ?? 0) : (wl?.hol ?? 0);
  const total = r1(reg + rd + hol);
  return {
    team,
    tower: c.O.up(team.id, "tower") ?? null,
    hc,
    pto,
    hours,
    reg: r1(reg),
    rd: r1(rd),
    hol: r1(hol),
    total,
    pct: pctOf(total, hours),
    pctNoHol: pctOf(reg + rd, hours),
    src: manual ? "manual" : wl ? "workload" : "none",
    remark: e.otRemark ?? "",
  };
}

/** Totals of several rows (a tower, or everything), with the percentages worked out again. */
export function otTotal(rows: OtRow[]) {
  const s = (k: "hc" | "pto" | "hours" | "reg" | "rd" | "hol" | "total") => r1(rows.reduce((x, r) => x + r[k], 0));
  const hours = s("hours");
  return { hc: s("hc"), pto: s("pto"), hours, reg: s("reg"), rd: s("rd"), hol: s("hol"), total: s("total"), pct: pctOf(s("total"), hours), pctNoHol: pctOf(s("reg") + s("rd"), hours) };
}

/** Accuracy issues logged for a team in a period. */
export const issuesIn = (c: Cal, team: string, period: string): KpiIssue[] => {
  const [a, b] = periodRange(period);
  return (c.d.issues ?? []).filter((i) => i.team === team && i.date >= a && i.date <= b);
};

export function kpiRow(c: Cal, team: OrgNode, period: string, wl?: WlStats): KpiRow {
  const e: KpiEntry = c.d.kpi?.[kpiKey(team.id, period)] ?? {};
  const issues = issuesIn(c, team.id, period).length;
  const pick = (m: number | undefined, w: number | null | undefined) => (m !== undefined ? m : (w ?? null));
  const manual = e.util !== undefined || e.prod !== undefined || e.time !== undefined || e.acc !== undefined;
  const done = wl?.done ?? 0;
  const acc = e.acc !== undefined ? e.acc : wl && done > 0 ? r1(Math.max(0, (1 - issues / done) * 100)) : null;
  return {
    team,
    tower: c.O.up(team.id, "tower") ?? null,
    util: pick(e.util, wl?.util),
    prod: pick(e.prod, wl?.prod),
    time: pick(e.time, wl?.time),
    acc,
    issues,
    done,
    src: manual ? "manual" : wl ? "workload" : "none",
    remark: e.remark ?? "",
  };
}

/** Who may write remarks, enter KPIs and log issues for a team: its leads and above, and system admins. */
export function canTrack(c: Cal, me: number, team: string): boolean {
  const p = c.people.get(me);
  if (!p) return false;
  if (p.sysAdmin) return true;
  if (!isLeader(p.level)) return false;
  return c.O.inN(p, team) || c.O.anc(team).some((n) => p.assign.includes(n)) || c.O.anc(team).some((n) => (c.O.by[n]?.admins ?? []).includes(me));
}

/** Mondays' week keys from a date back `n` weeks (latest first), for the period picker. */
export function recentWeeks(today: string, n: number): string[] {
  const out: string[] = [];
  const back = (dowOf(today) + 6) % 7;
  for (let i = 0; i < n; i++) out.push(isoWeekOf(addDays(today, -back - 7 * i)));
  return out;
}
export function recentMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
  });
}
