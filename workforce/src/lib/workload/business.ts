/**
 * Business case: what a team bills per month under the fixed model (billed FTE × the
 * monthly rate for each person's role, from Calendar › Headcount) and under unit pricing
 * (transactions × the agreed price per task type), side by side. The team's billing mode
 * picks which one it bills on; the other is shown for comparison. Read-only: it never
 * changes tasks, headcount or productivity.
 */
import { dayKey } from "./clock";
import type { WorkloadData } from "./engine";
import type { BillRole, Billing, Task } from "./types";

export const ROLE_ORDER: BillRole[] = ["member", "specialist", "senior", "lead", "manager", "director"];
export const ROLE_NAME: Record<BillRole, string> = {
  member: "Associate",
  specialist: "Specialist",
  senior: "Sr. Specialist",
  lead: "Team lead",
  manager: "Manager",
  director: "Director",
};
/** Key of standard requests (no task type) in the unit rates. */
export const STANDARD = "";

export const billingOf = (d: Pick<WorkloadData, "settings">): Billing => ({
  mode: "fixed",
  currency: "USD",
  roleRates: {},
  unitRates: {},
  unit: "tasks",
  when: "resolved",
  ...d.settings.billing,
});

export interface BcLine {
  id: string;
  name: string;
  /** FTE (fixed) or transactions (unit). */
  qty: number;
  /** null: no rate set, so it isn't priced. */
  rate: number | null;
  amount: number;
}
export interface BcMonth {
  /** yyyy-mm */
  ym: string;
  fixed: number;
  unit: number;
  fte: number;
  units: number;
  /** Billed FTE by role. */
  roles: BcLine[];
  /** Transactions by task type. */
  types: BcLine[];
}
export interface BusinessCase {
  billing: Billing;
  year: number;
  months: BcMonth[];
  total: { fixed: number; unit: number; fte: number; units: number };
  /** Billed FTE or transactions that have no rate yet (so the totals leave them out). */
  unpricedRoles: BillRole[];
  unpricedTypes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Transactions in a ticket: 1, or the number field the team counts (e.g. contracts). */
export function unitsOf(b: Billing, t: Task) {
  if (b.unit === "tasks") return 1;
  const v = Number(t.fields[b.unit]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** The month (yyyy-mm) a ticket counts in, or null when it doesn't count (not resolved). */
export function monthOf(b: Billing, t: Task) {
  if (b.when === "received") return dayKey(t.received).slice(0, 7);
  return t.status === "done" && t.doneAt ? dayKey(t.doneAt).slice(0, 7) : null;
}

/** Months 1…`months` of `year` (e.g. up to the current month); the totals cover those months. */
export function businessCase(d: WorkloadData, year: number, months = 12): BusinessCase {
  const b = billingOf(d);
  const types = new Map((d.settings.taskTypes ?? []).map((t) => [t.id, t.name]));
  const typeName = (id: string) => (id === STANDARD ? "Standard request" : (types.get(id) ?? "Removed task type"));
  const rate = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const hcRows = d.hc && d.hc.year === year ? d.hc.rows : [];
  const unpricedRoles = new Set<BillRole>();
  const unpricedTypes = new Set<string>();

  // Transactions per month and task type.
  const vol = new Map<string, Map<string, number>>();
  for (const t of d.tasks) {
    const m = monthOf(b, t);
    if (!m || !m.startsWith(`${year}-`)) continue;
    const n = unitsOf(b, t);
    if (!n) continue;
    const ty = t.ttype || STANDARD;
    const row = vol.get(m) ?? new Map<string, number>();
    row.set(ty, (row.get(ty) ?? 0) + n);
    vol.set(m, row);
  }

  const list: BcMonth[] = Array.from({ length: Math.max(1, Math.min(12, months)) }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
    const roles: BcLine[] = ROLE_ORDER.map((role) => {
      const qty = r2(hcRows.filter((r) => r.level === role).reduce((a, r) => a + (r.billed[i] ?? 0), 0));
      const rt = rate(b.roleRates[role]);
      if (qty > 0 && rt === null) unpricedRoles.add(role);
      return { id: role, name: ROLE_NAME[role], qty, rate: rt, amount: r2(qty * (rt ?? 0)) };
    }).filter((l) => l.qty > 0);
    const tv = vol.get(ym) ?? new Map<string, number>();
    const lines: BcLine[] = [...tv.entries()]
      .map(([id, qty]) => {
        const rt = rate(b.unitRates[id]);
        if (rt === null) unpricedTypes.add(id);
        return { id, name: typeName(id), qty: r2(qty), rate: rt, amount: r2(qty * (rt ?? 0)) };
      })
      .sort((x, y) => (x.id === STANDARD ? -1 : y.id === STANDARD ? 1 : x.name.localeCompare(y.name)));
    return {
      ym,
      fixed: r2(roles.reduce((a, l) => a + l.amount, 0)),
      unit: r2(lines.reduce((a, l) => a + l.amount, 0)),
      fte: r2(roles.reduce((a, l) => a + l.qty, 0)),
      units: r2(lines.reduce((a, l) => a + l.qty, 0)),
      roles,
      types: lines,
    };
  });
  const sum = (k: "fixed" | "unit" | "fte" | "units") => r2(list.reduce((a, m) => a + m[k], 0));
  return {
    billing: b,
    year,
    months: list,
    total: { fixed: sum("fixed"), unit: sum("unit"), fte: sum("fte"), units: sum("units") },
    unpricedRoles: ROLE_ORDER.filter((r) => unpricedRoles.has(r)),
    unpricedTypes: [...unpricedTypes].map(typeName),
  };
}

/** Clean a billing patch from the settings page: known modes, non-negative rates only. */
export function cleanBilling(b: Billing): Billing {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 10000) / 10000 : undefined);
  const rates = <K extends string>(o: Partial<Record<K, number>>) =>
    Object.fromEntries(Object.entries(o ?? {}).flatMap(([k, v]) => (num(v) === undefined ? [] : [[k, num(v)]]))) as Partial<Record<K, number>>;
  return {
    mode: b.mode === "unit" ? "unit" : "fixed",
    currency: String(b.currency ?? "").trim().toUpperCase().slice(0, 6) || "USD",
    roleRates: rates<BillRole>(b.roleRates),
    unitRates: rates<string>(b.unitRates) as Record<string, number>,
    unit: String(b.unit || "tasks"),
    when: b.when === "received" ? "received" : "resolved",
  };
}

/** Pricing is for managers and above (see WorkloadData.pricers). */
export const canPrice = (d: Pick<WorkloadData, "pricers">, me: number) => (d.pricers ?? []).includes(me);

/** Rates and billed headcount are for managers and above; others get the data without them. */
export function forViewer(d: WorkloadData, me: number): WorkloadData {
  if (canPrice(d, me)) return d;
  const { billing: _b, ...settings } = d.settings;
  return { ...d, settings, hc: undefined };
}
