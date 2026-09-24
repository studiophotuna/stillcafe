/**
 * Time helpers. All display is in team-local time (Manila, UTC+8, no DST).
 *
 * In demo mode (default until a backend is connected) the clock starts at
 * the design's reference moment, Thu 24 Sep 2026 10:30, and runs forward in
 * real time so the sample data always looks the same. Set
 * NEXT_PUBLIC_DEMO_CLOCK=off to use the real clock.
 */
export const H = 3_600_000;
export const M = 60_000;
export const TZ_OFFSET_H = 8;

const DEMO_BASE = Date.parse("2026-09-24T10:30:00+08:00");
const LOADED_AT = Date.now();
const demo = process.env.NEXT_PUBLIC_DEMO_CLOCK !== "off";

export const nowMs = (): number => (demo ? DEMO_BASE + (Date.now() - LOADED_AT) : Date.now());

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

/** A Date whose UTC fields read as team-local time. */
export const local = (ms: number) => new Date(ms + TZ_OFFSET_H * H);

export const dayKey = (ms: number) => local(ms).toISOString().slice(0, 10);

/** Local hour of day as a fraction, e.g. 10.5 for 10:30. */
export const localHour = (ms: number) => {
  const d = local(ms);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

/** "Thu 24 Sep, 10:30" */
export const fmtT = (ms: number) => {
  const d = local(ms);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** "Today 10:30" or "23 Sep 14:05" */
export const fmtS = (ms: number, now = nowMs()) => {
  const d = local(ms);
  const same = dayKey(ms) === dayKey(now);
  return `${same ? "Today" : `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** "2h 5m" or "45m" */
export const dur = (ms: number) => {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / H);
  const m = Math.floor((ms % H) / M);
  return h ? `${h}h ${m}m` : `${m}m`;
};
