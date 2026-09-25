/**
 * Headcount monitoring report: per tower, per team (process), one row per person with
 * Actual and Billed FTE for each month of a year.
 *
 * - Each person is counted once, as 1 FTE, in their primary team (set by an admin when
 *   they're allocated to several teams; otherwise their first allocation's team).
 * - Actual: blank before the hire month; FTE from the hire month through the month of
 *   the last working day; 0 in later months (the "tagged 0" after a resignation).
 * - Billed: FTE for members, 0 for team leads and above, unless an admin set an override
 *   for that person, team and month (Calendar data "billing").
 */
import { LEVELS } from "./constants";
import type { Cal } from "./engine";
import { primaryTeamOf } from "./org";
import type { CalPerson, Level, OrgNode } from "./types";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface HcCell {
  actual: number | null;
  billed: number | null;
  /** Billed was set by an admin. */
  override: boolean;
}
export interface HcRow {
  pid: number;
  name: string;
  level: Level;
  lead: boolean;
  sub: string;
  fte: number;
  months: HcCell[];
}
export interface HcTeam {
  id: string;
  name: string;
  costCentre: string;
  rows: HcRow[];
  /** Totals per month: members only ("without TL") and everyone ("with TL"). */
  without: { actual: number; billed: number }[];
  withTl: { actual: number; billed: number }[];
}
export interface HcTower {
  id: string;
  name: string;
  teams: HcTeam[];
}

const RANK: Record<Level, number> = { director: 0, manager: 1, lead: 2, member: 3 };
export const ym = (year: number, m: number) => `${year}-${String(m + 1).padStart(2, "0")}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function teamHeadcount(c: Cal, team: OrgNode, year: number): HcTeam {
  const { O } = c;
  const billing = c.d.billing ?? {};
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const people = c.d.people.filter(
    (p) => primaryTeamOf(O, p) === team.id && (!p.hire || p.hire <= to) && !(p.resign && p.resign < from),
  );
  const rows: HcRow[] = people
    .map((p: CalPerson) => {
      const fte = 1;
      const lead = p.level !== "member";
      const subs = [...new Set(p.assign.filter((a) => O.anc(a).includes(team.id)).map((a) => O.sub(a)).filter(Boolean))];
      const sub = lead ? (p.level === "lead" ? "Team Leader" : LEVELS[p.level]) + (subs.length ? ` · ${subs.join(", ")}` : "") : subs.join(", ") || team.name;
      const hireYm = (p.hire || from).slice(0, 7);
      const endYm = p.resign ? p.resign.slice(0, 7) : "9999-12";
      const months = MONTHS.map((_, m): HcCell => {
        const k = ym(year, m);
        if (k < hireYm) return { actual: null, billed: null, override: false };
        if (k > endYm) return { actual: 0, billed: 0, override: false };
        const key = `${p.id}|${team.id}|${k}`;
        const override = key in billing;
        return { actual: fte, billed: override ? billing[key] : lead ? 0 : fte, override };
      });
      return { pid: p.id, name: p.name, level: p.level, lead, sub, fte, months };
    })
    .sort((a, b) => RANK[a.level] - RANK[b.level] || a.name.localeCompare(b.name));
  const sum = (rs: HcRow[]) =>
    MONTHS.map((_, m) => ({
      actual: r2(rs.reduce((a, r) => a + (r.months[m].actual ?? 0), 0)),
      billed: r2(rs.reduce((a, r) => a + (r.months[m].billed ?? 0), 0)),
    }));
  return {
    id: team.id,
    name: team.name,
    costCentre: team.costCentre ?? "",
    rows,
    without: sum(rows.filter((r) => !r.lead)),
    withTl: sum(rows),
  };
}

/** Towers (with their teams) for the report; `canSee` limits teams to those the viewer administers. */
export function headcount(c: Cal, year: number, canSee: (teamId: string) => boolean): HcTower[] {
  const { O } = c;
  return c.d.nodes
    .filter((n) => n.type === "tower")
    .map((t) => ({
      id: t.id,
      name: t.name,
      teams: O.kids(t.id, "branch")
        .filter((b) => canSee(b.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((b) => teamHeadcount(c, b, year)),
    }))
    .filter((t) => t.teams.length);
}
