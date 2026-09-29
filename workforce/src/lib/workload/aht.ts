/**
 * Average handling time (AHT) of done tickets in a period: time worked (start to done,
 * minus time on hold and the member's breaks etc.) per ticket and per contract, overall,
 * by member, trade, task type and complexity level.
 */
import { basisField, cxCheck, cxField, cxLevels, cxTotal, personOf, taskWorkMs, type WorkloadData } from "./engine";
import { trPathOf } from "./constants";
import { typeLabel } from "./metrics";
import type { Task } from "./types";

export interface AhtRow {
  key: string;
  name: string;
  tickets: number;
  contracts: number;
  /** Time worked, ms. */
  ms: number;
  /** Tickets with an expected time (complexity with handling times), their time worked and expected time, and how many were questioned. */
  checked: number;
  checkedMs: number;
  expMs: number;
  slow: number;
}

const blank = (key: string, name: string): AhtRow => ({ key, name, tickets: 0, contracts: 0, ms: 0, checked: 0, checkedMs: 0, expMs: 0, slow: 0 });

/** Contracts in a ticket: its complexity counts, else the contracts / productivity number field, else 1. */
export function contractsOf(d: WorkloadData, t: Task) {
  if (t.cx && cxTotal(t.cx) > 0) return cxTotal(t.cx);
  const f = cxField(d) ?? (basisField(d)?.type === "number" ? basisField(d) : undefined);
  const n = f ? Number(t.fields[f.key]) || 0 : 0;
  return n > 0 ? n : 1;
}

export function ahtStats(d: WorkloadData, from: number, to: number) {
  const done = d.tasks.filter((t) => t.status === "done" && t.startedAt && t.doneAt && t.doneAt >= from && t.doneAt < to);
  const total = blank("all", "All tickets");
  const groups = { member: new Map<string, AhtRow>(), trade: new Map<string, AhtRow>(), type: new Map<string, AhtRow>() };
  const levels = cxLevels(d.settings);
  const byLevel = new Map(levels.map((l) => [l.id, blank(l.id, l.name)]));
  for (const t of done) {
    const ms = taskWorkMs(d, t, t.doneAt!);
    const n = contractsOf(d, t);
    const chk = cxCheck(d, t);
    const add = (r: AhtRow) => {
      r.tickets++;
      r.contracts += n;
      r.ms += ms;
      if (chk) {
        r.checked++;
        r.checkedMs += ms;
        r.expMs += chk.expMs;
        if (chk.flag && !t.cxReview) r.slow++;
      }
    };
    const into = (m: Map<string, AhtRow>, key: string, name: string) => {
      if (!m.has(key)) m.set(key, blank(key, name));
      add(m.get(key)!);
    };
    add(total);
    into(groups.member, String(t.assignee), personOf(d, t.assignee ?? -1)?.name ?? "—");
    into(groups.trade, t.trade, trPathOf(d.org, t.trade) || "No trade");
    into(groups.type, t.ttype || "", typeLabel(d, t));
    // Per level: a ticket's time is shared across its levels by their expected time (or by count without one).
    if (t.cx && cxTotal(t.cx) > 0 && levels.length) {
      const parts = levels.filter((l) => t.cx![l.id]).map((l) => ({ l, n: t.cx![l.id], w: t.cx![l.id] * ((l.aht ?? 0) > 0 ? l.aht! : 1) }));
      const sw = parts.reduce((a, p) => a + p.w, 0);
      for (const p of parts) {
        const r = byLevel.get(p.l.id)!;
        r.tickets++;
        r.contracts += p.n;
        r.ms += sw ? (ms * p.w) / sw : 0;
      }
    }
  }
  const sorted = (m: Map<string, AhtRow>) => [...m.values()].sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name));
  return {
    total,
    members: sorted(groups.member),
    trades: sorted(groups.trade),
    types: sorted(groups.type),
    levels: levels.map((l) => ({ level: l, row: byLevel.get(l.id)! })),
  };
}

/** Per ticket / per contract, ms (null without data). */
export const perTicket = (r: AhtRow) => (r.tickets ? r.ms / r.tickets : null);
export const perContract = (r: AhtRow) => (r.contracts ? r.ms / r.contracts : null);
/** Time worked on checked tickets as % of expected (100 = as expected). */
export const vsExpected = (r: AhtRow) => (r.expMs ? Math.round((r.checkedMs / r.expMs) * 100) : null);
