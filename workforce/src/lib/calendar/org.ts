import type { CalPerson, Level, NodeType, OrgNode } from "./types";

/** Lookups over the Department › Tower › Team › System › Trade tree. */
export interface Org {
  by: Record<string, OrgNode>;
  /** The node and its ancestors, nearest first. */
  anc: (id: string) => string[];
  /** Nearest ancestor-or-self of a type. */
  up: (id: string, t: NodeType) => OrgNode | undefined;
  kids: (id: string, t?: NodeType) => OrgNode[];
  desc: (id: string, t?: NodeType) => OrgNode[];
  /** "GPM · FEWB" part of an allocation below its team. */
  sub: (id: string) => string;
  /** Is the person allocated at or below this node? */
  inN: (p: CalPerson, id: string) => boolean;
  /** Teams the person belongs to. */
  branchesOf: (p: CalPerson) => OrgNode[];
}

export function mkOrg(nodes: OrgNode[]): Org {
  const by: Record<string, OrgNode> = {};
  nodes.forEach((n) => (by[n.id] = n));
  const ac: Record<string, string[]> = {};
  const anc = (id: string) => {
    if (ac[id]) return ac[id];
    const o: string[] = [];
    for (let c: OrgNode | undefined = by[id], g = 0; c && g < 10; c = c.parent ? by[c.parent] : undefined, g++) o.push(c.id);
    return (ac[id] = o);
  };
  const up = (id: string, t: NodeType) => anc(id).map((i) => by[i]).find((n) => n.type === t);
  const kids = (id: string, t?: NodeType) => nodes.filter((n) => n.parent === id && (!t || n.type === t));
  const desc = (id: string, t?: NodeType): OrgNode[] =>
    kids(id).flatMap((k) => (!t || k.type === t ? [k] : []).concat(desc(k.id, t)));
  const sub = (id: string) =>
    anc(id)
      .map((i) => by[i])
      .filter((n) => n.type === "system" || n.type === "trade")
      .reverse()
      .map((n) => n.name)
      .join(" · ");
  const memo = new WeakMap<CalPerson, Record<string, 1>>();
  const inN = (p: CalPerson, id: string) => {
    let m = memo.get(p);
    if (!m) {
      m = {};
      for (const a of p.assign) for (const x of anc(a)) m[x] = 1;
      memo.set(p, m);
    }
    return !!m[id];
  };
  const branchesOf = (p: CalPerson) => {
    const o: OrgNode[] = [];
    for (const a of p.assign) {
      const b = up(a, "branch");
      if (b && !o.includes(b)) o.push(b);
    }
    return o;
  };
  return { by, anc, up, kids, desc, sub, inN, branchesOf };
}

/** Default settings for a new team. */
export const teamDefaults = (o: Partial<OrgNode> = {}): Partial<OrgNode> => ({
  mode: "approval",
  admins: [],
  notifyAdmin: true,
  notifyUser: true,
  invite: true,
  defaultScope: "all",
  ...o,
});

/**
 * How deep an allocation must go, by role: directors need only a department,
 * managers a department and tower, everyone else a department, tower and team.
 * Deeper allocations (a manager on a team) are always fine.
 */
const DEPTH: Record<NodeType, number> = { dept: 0, tower: 1, branch: 2, system: 3, trade: 4 };
export const ALLOC_MIN: Record<Level, NodeType> = { director: "dept", manager: "tower", lead: "branch", member: "branch" };
export const allocNeeds = (level: Level) =>
  ALLOC_MIN[level] === "dept" ? "a department" : ALLOC_MIN[level] === "tower" ? "a department and tower" : "a department, tower and team";

/** Problem with a person's allocations for their role, or "" when fine. */
export function allocProblem(O: Pick<Org, "by">, level: Level, assign: string[]): string {
  const need = ALLOC_MIN[level] ?? "branch";
  if (!assign.length || assign.some((x) => !O.by[x] || DEPTH[O.by[x].type] < DEPTH[need]))
    return `Choose ${allocNeeds(level)} for each allocation.`;
  return "";
}

/**
 * Whether `pid` is an admin of a node: listed on it or on any node above it. Admins of a
 * department (e.g. its director) or tower (e.g. its manager) administer every team under it.
 */
export const isNodeAdmin = (O: Pick<Org, "anc" | "by">, id: string, pid: number) =>
  O.anc(id).some((n) => (O.by[n]?.admins ?? []).includes(pid));
