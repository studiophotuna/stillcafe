/**
 * Headcount monitoring report: per tower, per team (process), one row per person with
 * Actual and Billed FTE for each month of a year.
 *
 * - Each person is counted once, as 1 FTE, in their primary team (set by an admin when
 *   they're allocated to several teams; otherwise their first allocation's team) — per
 *   month: after a move, earlier months stay with the team they were tagged to then
 *   (CalPerson.hcHistory), so they appear in both teams, each for its own months.
 * - Actual: blank before the hire month; FTE from the hire month through the month of
 *   the last working day; 0 in later months (the "tagged 0" after a resignation).
 * - Billed: FTE for members, 0 for team leads and above, unless an admin set an override
 *   for that person, team and month (Calendar data "billing").
 */
import { LEVELS, LEVEL_RANK, isLeader } from "./constants";
import type { Cal } from "./engine";
import { hcTeamOf, primaryTeamOf } from "./org";
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

const RANK = LEVEL_RANK;
export const ym = (year: number, m: number) => `${year}-${String(m + 1).padStart(2, "0")}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function teamHeadcount(c: Cal, team: OrgNode, year: number): HcTeam {
  const { O } = c;
  const billing = c.d.billing ?? {};
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const inTeam = (p: CalPerson, k: string) => hcTeamOf(O, p, k) === team.id;
  const people = c.d.people.filter(
    (p) => (!p.hire || p.hire <= to) && !(p.resign && p.resign < from) && MONTHS.some((_, m) => inTeam(p, ym(year, m))),
  );
  const rows: HcRow[] = people
    .map((p: CalPerson) => {
      const fte = 1;
      const lead = isLeader(p.level);
      // Current allocations in this team; for a past team, what was recorded when they moved.
      let subs = [...new Set(p.assign.filter((a) => O.anc(a).includes(team.id)).map((a) => O.sub(a)).filter(Boolean))];
      if (primaryTeamOf(O, p) !== team.id) {
        const was = (p.hcHistory ?? []).filter((x) => x.team === team.id && x.sub).pop()?.sub;
        if (was) subs = [was];
      }
      const moved = (p.hcHistory ?? []).some((x) => x.team !== team.id);
      const sub =
        (lead ? (p.level === "lead" ? "Team Leader" : LEVELS[p.level]) + (subs.length ? ` · ${subs.join(", ")}` : "") : subs.join(", ") || team.name) +
        (moved ? " · moved" : "");
      const hireYm = (p.hire || from).slice(0, 7);
      const endYm = p.resign ? p.resign.slice(0, 7) : "9999-12";
      const months = MONTHS.map((_, m): HcCell => {
        const k = ym(year, m);
        if (k < hireYm) return { actual: null, billed: null, override: false };
        // Months tagged to another team are counted there, not here.
        if (!inTeam(p, k)) return { actual: null, billed: null, override: false };
        if (k > endYm) return { actual: 0, billed: 0, override: false };
        const key = `${p.id}|${team.id}|${k}`;
        const override = key in billing;
        return { actual: fte, billed: override ? billing[key] : lead ? 0 : fte, override };
      });
      return { pid: p.id, name: p.name, level: p.level, lead, sub, fte, months };
    })
    .sort((a, b) => RANK[a.level] - RANK[b.level] || a.name.localeCompare(b.name));
  return {
    id: team.id,
    name: team.name,
    costCentre: team.costCentre ?? "",
    rows,
    without: sum(rows.filter((r) => !r.lead)),
    withTl: sum(rows),
  };
}

const sum = (rs: HcRow[]) =>
  MONTHS.map((_, m) => ({
    actual: r2(rs.reduce((a, r) => a + (r.months[m].actual ?? 0), 0)),
    billed: r2(rs.reduce((a, r) => a + (r.months[m].billed ?? 0), 0)),
  }));

/** Only the people with these roles (totals recomputed); teams left empty are dropped. */
export function byRoles(towers: HcTower[], roles: Level[] | null): HcTower[] {
  if (!roles) return towers;
  return towers
    .map((t) => ({
      ...t,
      teams: t.teams
        .map((tm) => {
          const rows = tm.rows.filter((r) => roles.includes(r.level));
          return { ...tm, rows, without: sum(rows.filter((r) => !r.lead)), withTl: sum(rows) };
        })
        .filter((tm) => tm.rows.length),
    }))
    .filter((t) => t.teams.length);
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
