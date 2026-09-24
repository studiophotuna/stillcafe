/**
 * Bulk-add towers, teams, systems and trades from rows pasted out of Excel:
 * Tower, Team[, System[, Trade]]. Names are matched case-insensitively, so
 * anything already there is left alone, and running the same list twice adds
 * nothing. A "team" that already exists as a system of a team in that tower
 * (e.g. GPM inside Rate Management) is treated as already there.
 */
import { teamDefaults } from "./org";
import type { CalendarData, NodeType, OrgNode } from "./types";

export type OrgRow = string[];

export interface OrgPlan {
  add: { type: NodeType; name: string; under: string }[];
  skip: { name: string; why: string }[];
  errors: string[];
  nodes: OrgNode[];
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const key = (s: string) => clean(s).toLowerCase();

/** Split pasted text into rows (tab-separated from Excel, or comma-separated). Drops a header row. */
export function parseOrgText(text: string): OrgRow[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")).map(clean))
    .filter((r) => r.some(Boolean));
  if (rows.length && key(rows[0][0]) === "tower") rows.shift();
  return rows;
}

export function planOrgImport(d: CalendarData, dept: string, rows: OrgRow[], idBase: string): OrgPlan {
  const nodes = d.nodes.slice();
  const add: OrgPlan["add"] = [];
  const skip: OrgPlan["skip"] = [];
  const errors: string[] = [];
  if (!nodes.some((n) => n.id === dept && n.type === "dept")) return { add, skip, errors: ["Choose a department."], nodes: d.nodes };
  let seq = 0;
  const kid = (parent: string, type: NodeType, name: string) => nodes.find((n) => n.parent === parent && n.type === type && key(n.name) === key(name));
  const make = (parent: string, type: NodeType, name: string, underName: string) => {
    const n: OrgNode = { id: `${idBase}${(seq++).toString(36)}`, type, name: clean(name), parent, ...(type === "branch" ? teamDefaults() : {}) };
    nodes.push(n);
    add.push({ type, name: n.name, under: underName });
    return n;
  };
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const [tower, team, system, trade] = r.map(clean);
    if (!tower || !team) {
      errors.push(`Row ${i + 1}: needs a tower and a team.`);
      return;
    }
    if (tower.length > 80 || team.length > 80 || (system?.length ?? 0) > 80 || (trade?.length ?? 0) > 80) {
      errors.push(`Row ${i + 1}: names can be at most 80 characters.`);
      return;
    }
    const deptName = nodes.find((n) => n.id === dept)!.name;
    const t = kid(dept, "tower", tower) ?? make(dept, "tower", tower, deptName);
    let b = kid(t.id, "branch", team);
    if (!b) {
      // Already a system of a team in this tower?
      const asSys = nodes.find((n) => n.type === "system" && key(n.name) === key(team) && nodes.some((x) => x.id === n.parent && x.parent === t.id));
      if (asSys && !system) {
        const k = "sys|" + asSys.id;
        if (!seen.has(k)) skip.push({ name: team, why: `already a system of ${nodes.find((x) => x.id === asSys.parent)!.name}` });
        seen.add(k);
        return;
      }
      b = make(t.id, "branch", team, t.name);
    } else if (!system && !seen.has(b.id)) {
      skip.push({ name: team, why: "already there" });
    }
    seen.add(b.id);
    if (!system) return;
    const sy = kid(b.id, "system", system) ?? make(b.id, "system", system, b.name);
    if (trade && !kid(sy.id, "trade", trade)) make(sy.id, "trade", trade, sy.name);
  });
  return { add, skip, errors, nodes };
}
