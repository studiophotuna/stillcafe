/**
 * Attendance summary for a day: per team, then per system, how many people are working
 * (RTO, WFH, holiday duty, rest day OT; leave is deducted) out of the headcount, with the count of each status (RTO noting the Midshift / GY shifts).
 *
 *   Rate Management 60/61
 *   GPM 30/31
 *   RTO - 10 (3 GY)
 *   WFH - 15
 *   SL - 1
 */
import { BUCKETS, WORKING, isLeader } from "./constants";
import type { Cal } from "./engine";
import type { CalPerson, Code, OrgNode } from "./types";

const ORDER: Code[] = ["RTO", "WFH", "HDY", "RDOT", "SL", "VL", "EL", "HD", "BT", "RD", "HOL"];

export interface SummaryLine {
  code: Code;
  n: number;
  /** "3 GY", "2 Midshift, 3 GY" — non-morning shifts among the working ones. */
  shifts: string;
  pending: number;
  /** Team leads among this line's count (by-lead view: the block's own lead). */
  tl: number;
}
export interface SummaryBlock {
  id: string;
  name: string;
  level: "team" | "system";
  withStatus: number;
  /** Working that day (RTO, WFH, holiday duty, rest day OT); leave and rest days are deducted. */
  present: number;
  headcount: number;
  lines: SummaryLine[];
  /** Show the status lines (teams without systems; systems always). */
  detail: boolean;
}

function block(c: Cal, n: OrgNode, level: SummaryBlock["level"], ppl: CalPerson[], date: string, tls?: Set<number>): SummaryBlock {
  const cnt = new Map<Code, { n: number; b: Record<string, number>; pending: number; tl: number }>();
  let withStatus = 0;
  let present = 0;
  for (const p of ppl) {
    const x = c.raw(p, date, null);
    if (!x.code) continue;
    withStatus++;
    if (WORKING.includes(x.code)) present++;
    const r = cnt.get(x.code) ?? { n: 0, b: {}, pending: 0, tl: 0 };
    r.n++;
    if (tls?.has(p.id)) r.tl++;
    if (x.pending) r.pending++;
    const bucket = x.shift ? c.d.shifts.find((s) => s.id === x.shift)?.bucket : undefined;
    if (bucket && bucket !== "morning") r.b[bucket] = (r.b[bucket] ?? 0) + 1;
    cnt.set(x.code, r);
  }
  const lines = ORDER.filter((k) => cnt.has(k)).map((k) => {
    const r = cnt.get(k)!;
    const shifts = (["mid", "gy"] as const).filter((b) => r.b[b]).map((b) => `${r.b[b]} ${BUCKETS[b]}`).join(", ");
    return { code: k, n: r.n, shifts, pending: r.pending, tl: r.tl };
  });
  return { id: n.id, name: n.name, level, withStatus, present, headcount: ppl.length, lines, detail: true };
}

/** Blocks for each team under `scope` (or the team itself), each followed by its systems. */
export function attendanceSummary(c: Cal, scope: string, date: string): SummaryBlock[] {
  const { O } = c;
  const node = O.by[scope];
  if (!node) return [];
  const teams = node.type === "branch" ? [node] : node.type === "system" || node.type === "trade" ? [O.up(scope, "branch")!].filter(Boolean) : O.desc(scope, "branch");
  const alive = (p: CalPerson) => c.alive(p, date) && (!p.hire || p.hire <= date);
  const out: SummaryBlock[] = [];
  for (const t of teams) {
    const tp = c.d.people.filter((p) => O.inN(p, t.id) && alive(p));
    if (!tp.length) continue;
    const tb = block(c, t, "team", tp, date);
    const subs = O.kids(t.id, "system")
      .map((sy) => ({ sy, sp: tp.filter((p) => O.inN(p, sy.id)) }))
      .filter((x) => x.sp.length)
      .map(({ sy, sp }) => block(c, sy, "system", sp, date));
    // People allocated to the team but no system, so the systems add up to the team.
    const rest = tp.filter((p) => !O.kids(t.id, "system").some((sy) => O.inN(p, sy.id)));
    if (subs.length && rest.length) subs.push(block(c, { ...t, id: t.id + ":none", name: "No system" }, "system", rest, date));
    out.push({ ...tb, detail: !subs.length }, ...subs);
  }
  return out;
}

/** "incl TL" when the block's team lead is among a line's count. */
export const tlText = (l: Pick<SummaryLine, "tl">) => (l.tl ? (l.tl > 1 ? ` incl ${l.tl} TL` : " incl TL") : "");

/** The summary as plain text, ready to paste into a chat or email. */
export const summaryText = (blocks: SummaryBlock[], sep = " ") =>
  blocks
    .map((b) =>
      [`${b.name}${sep}${b.present}/${b.headcount}`]
        .concat(b.detail ? b.lines.map((l) => `${l.code} - ${l.n}${l.shifts ? ` (${l.shifts})` : ""}${l.pending ? ` (${l.pending} pending)` : ""}${tlText(l)}`) : [])
        .join("\n"),
    )
    .join("\n\n");

/** Totals of each status over the blocks' teams (for count tiles). */
export const summaryTotals = (blocks: SummaryBlock[]) => {
  const teams = blocks.filter((b) => b.level === "team");
  const by: Partial<Record<Code, number>> = {};
  for (const b of teams) for (const l of b.lines) by[l.code] = (by[l.code] ?? 0) + l.n;
  return { withStatus: teams.reduce((a, b) => a + b.withStatus, 0), present: teams.reduce((a, b) => a + b.present, 0), headcount: teams.reduce((a, b) => a + b.headcount, 0), by };
};

/**
 * Blocks per team lead in `scope`: named after the lead's allocations ("INAS / LCL / Velocity"),
 * covering the lead and the members assigned to them as approver, or (with no approver)
 * allocated within the lead's scope. Leads with nobody under them are left out; leftover members go to "No lead".
 */
export function leadSummary(c: Cal, scope: string, date: string): (SummaryBlock & { lead?: string })[] {
  const { O } = c;
  const node = O.by[scope];
  if (!node) return [];
  const alive = (p: CalPerson) => c.alive(p, date) && (!p.hire || p.hire <= date);
  const inScope = c.d.people.filter((p) => O.inN(p, scope) && alive(p));
  const leads = inScope.filter((p) => p.level === "lead").sort((a, b) => a.name.localeCompare(b.name));
  const leadIds = new Set(leads.map((l) => l.id));
  // Each member's lead: their approver when that's a lead, else the lead allocated nearest above them.
  const leadOf = (p: CalPerson) => {
    if (p.approver !== undefined && leadIds.has(p.approver)) return p.approver;
    let best: { id: number; d: number } | undefined;
    for (const a of p.assign)
      O.anc(a).forEach((x, d) => {
        const l = leads.find((l) => l.assign.includes(x));
        if (l && (!best || d < best.d)) best = { id: l.id, d };
      });
    return best?.id;
  };
  const members = inScope.filter((p) => !isLeader(p.level));
  const own = new Map(members.map((p) => [p.id, leadOf(p)]));
  const out: (SummaryBlock & { lead?: string })[] = [];
  for (const l of leads) {
    const ppl = members.filter((p) => own.get(p.id) === l.id);
    if (!ppl.length) continue;
    const name = l.assign.map((a) => O.by[a]?.name).filter(Boolean).join(" / ") || l.name;
    // The lead counts in their own block, marked "incl TL" on their status line.
    out.push({ ...block(c, { ...node, id: "lead:" + l.id, name }, "system", [l, ...ppl], date, new Set([l.id])), lead: l.name });
  }
  const rest = members.filter((p) => own.get(p.id) === undefined);
  if (out.length && rest.length) out.push(block(c, { ...node, id: "lead:none", name: "No lead" }, "system", rest, date));
  return out;
}
