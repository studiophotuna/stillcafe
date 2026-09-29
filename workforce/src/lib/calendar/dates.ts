/** ISO date (yyyy-mm-dd) helpers. Dates are calendar days in team-local time. */

export const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const P = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const dowOf = (s: string) => P(s).getUTCDay();
export const dayOf = (s: string) => P(s).getUTCDate();
export const addDays = (s: string, n: number) => {
  const d = P(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Thu 24 Sep" */
export const fmt = (s: string) => {
  const d = P(s);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
/** "24 Sep 2026" */
export const fmtY = (s: string) => {
  const d = P(s);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const rng2 = (a: string, b: string) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`);
export const isWk = (s: string) => {
  const w = dowOf(s);
  return w === 0 || w === 6;
};

/** Working days between two dates (inclusive), skipping weekends and the given holidays. */
export function workdays(a: string, b: string, hols: Record<string, string>) {
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (let s = a, g = 0; s <= b && g < 400; s = addDays(s, 1), g++) if (!isWk(s) && !hols[s]) n++;
  return n;
}

/** Excel serial, Date, yyyy-mm-dd or m/d/yyyy → yyyy-mm-dd ("" if not a date). */
export function toIso(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return isoOf(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoOf(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return isoOf(+m[3], +m[1] - 1, +m[2]);
  return "";
}

/**
 * The next payroll cut-off on or after `today` (yyyy-mm-dd), from days of the month
 * (a day past the month's end means its last day), or null without any.
 */
export function nextCutoff(today: string, days: number[] | undefined): string | null {
  if (!days?.length) return null;
  let [y, m] = today.split("-").map(Number);
  for (let i = 0; i < 3; i++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const hits = [...new Set(days.map((d) => Math.min(d, last)))].sort((a, b) => a - b).map((d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    const next = hits.find((k) => k >= today);
    if (next) return next;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return null;
}

/** Whole days from a to b (yyyy-mm-dd). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
