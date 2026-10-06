/**
 * Workload rules as pure functions over WorkloadData. The UI store calls
 * these; a server implementation (Supabase RPC / route handlers) must apply
 * the same rules. See ../../../README.md › Workload rules.
 */
import { H, M, TZ_OFFSET_H, addHours, dayKey, fmtT, localHour, spanMs, weekend } from "./clock";
import { CARRIERS, PR, fieldOptions, lc, sysName, trPathOf } from "./constants";
import { SAMPLE_MAIL } from "./seed";
import type { Activity, ActivityKind, BillRow, CxLevel, OtPart, Person, Priority, Settings, Task, TaskField, TaskType, WlOrg } from "./types";

export interface WorkloadData {
  tasks: Task[];
  fields: TaskField[];
  settings: Settings;
  /** Next task number for new tasks (T-2000, T-2001, …). */
  seq: number;
  /** Demo only: rotates the sample emails. */
  mailCount: number;
  /**
   * The team's people with their trades and today's availability. Not stored with
   * the tasks: derived from the Calendar (or the sample people in demo mode).
   */
  people: Person[];
  /** Person ids with Workload admin rights (team admins and system admins). */
  admins: number[];
  /** The team, its systems and trades, and the teams this person can open (from the Calendar). */
  org: WlOrg;
  /** Breaks, meetings etc. and end-of-day entries (recent days, plus any pending overtime). */
  activities: Activity[];
  /** Who may approve overtime: Workload admins and the team's leads, managers and directors. */
  approvers: number[];
  /** Calendar holidays for this team (yyyy-mm-dd), skipped in SLA time unless the team counts them. */
  holidays: string[];
  /** Business case: the team's billed FTE this year by person and month (Workload admins only). */
  hc?: { year: number; rows: BillRow[] };
  /** Who may see and set the business case (pricing): Workload admins who are managers or directors, and system admins. */
  pricers?: number[];
}

export const personOf = (d: Pick<WorkloadData, "people">, id: number | null) =>
  id === null ? undefined : d.people.find((p) => p.id === id);

/** Tasks a member could help with when their own trades have nothing waiting. */
export interface AssistOffer {
  /** Waiting in other trades of the member's systems. */
  system: number;
  systemNames: string[];
  /** Waiting elsewhere in the team. */
  team: number;
}

/** Result of an action: the new data plus an optional message for a toast. */
export interface Outcome {
  data: WorkloadData;
  message?: string;
  /** Start work found nothing in the member's trades: ask whether they'll help elsewhere. */
  ask?: AssistOffer;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

// ── SLA ──
// Standard SLA: by priority (Settings.sla). Task types (Settings.taskTypes) have their own SLA,
// used instead of the standard one. The hours are fixed on the task when it comes in (slaH),
// and SLA time skips weekends and Calendar holidays unless the team counts them.

/** What SLA time needs: the team's settings and its Calendar holidays. */
export type SlaCtx = Pick<WorkloadData, "settings" | "holidays">;
export const skipsWeekends = (s: Settings) => s.slaWeekends !== true;
export const skipsHolidays = (s: Settings) => s.slaHolidays !== true;
const offCache = new WeakMap<Settings, { h: string[] | undefined; f: (ms: number) => boolean }>();
/** Whether a moment falls on a day that doesn't count toward the SLA. */
export function offTime(c: SlaCtx): (ms: number) => boolean {
  const hit = offCache.get(c.settings);
  if (hit && hit.h === c.holidays) return hit.f;
  const wk = skipsWeekends(c.settings);
  const hol = new Set(skipsHolidays(c.settings) ? (c.holidays ?? []) : []);
  const f = (ms: number) => (wk && weekend(ms)) || (hol.size > 0 && hol.has(dayKey(ms)));
  offCache.set(c.settings, { h: c.holidays, f });
  return f;
}
export const taskTypeOf = (s: Settings, t: Pick<Task, "ttype">) => (t.ttype ? (s.taskTypes ?? []).find((x) => x.id === t.ttype) : undefined);
/** SLA hours the settings give a task now: its type's, else the standard SLA for its priority. */
export const slaHoursFor = (t: Pick<Task, "ttype" | "pr">, s: Settings) => taskTypeOf(s, t)?.sla || s.sla[t.pr] || 24;
/** The task's SLA hours: fixed when it came in, or from the settings for older tasks. */
export const slaOf = (t: Task, s: Settings) => t.slaH ?? slaHoursFor(t, s);
/** Fix the SLA on a task from the current settings. */
export const withSla = <T extends Pick<Task, "ttype" | "pr">>(t: T, s: Settings): T & { slaH: number } => ({ ...t, slaH: slaHoursFor(t, s) });
export const due = (t: Task, c: SlaCtx) => addHours(t.received, slaOf(t, c.settings), offTime(c));
/** How long a task is overdue (days that don't count excluded). */
export const overdueMs = (t: Task, c: SlaCtx, now: number) => spanMs(due(t, c), t.doneAt ?? now, offTime(c));
export const isOverdue = (t: Task, c: SlaCtx, now: number) => t.status !== "done" && now > due(t, c);
/** How long a task has been waiting, in SLA time. */
export const waitingMs = (t: Task, c: SlaCtx, now: number) => spanMs(t.received, now, offTime(c));

/** SLA hours as people read them: "30 min", "2 h", "2 days (48 h)". */
export const slaText = (h: number) =>
  h < 1 ? `${Math.round(h * 60)} min` : h >= 24 && h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"} (${h} h)` : `${+h.toFixed(2)} h`;

/** The first task type whose keywords appear in the title (and that covers the trade). */
export function detectType(s: Settings, title: string, trade: string): string {
  const x = lc(title);
  const hit = (s.taskTypes ?? []).find(
    (y) => (!y.trades.length || !trade || y.trades.includes(trade)) && y.keywords.some((k) => k.trim() && x.includes(lc(k))),
  );
  return hit?.id ?? "";
}

export function sortTasks(list: Task[], c: SlaCtx): Task[] {
  const s = c.settings;
  return list
    .slice()
    .sort((a, b) =>
      s.order === "priority"
        ? PRIORITY_WEIGHT[a.pr] - PRIORITY_WEIGHT[b.pr] || due(a, c) - due(b, c) || a.received - b.received
        : a.received - b.received,
    );
}

/**
 * Whether the member can take tasks. With "Skip people who are unavailable", people off
 * shift are skipped, except those scheduled today: they can carry on after the shift
 * (overtime) until they end work.
 */
export const canWork = (p: Person, s: Settings) => !s.skipUnavail || p.avail === "available" || (p.avail === "offshift" && !!p.onToday);
export const isBusy = (tasks: Task[], pid: number) => tasks.some((t) => t.assignee === pid && t.status === "in_progress");

const hist = (t: Task, at: number, text: string) => [...t.history, { at, text }];
const patch = (d: WorkloadData, id: string, fn: (t: Task) => Task): WorkloadData => ({
  ...d,
  tasks: d.tasks.map((t) => (t.id === id ? fn(t) : t)),
});
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function begin(d: WorkloadData, id: string, p: Person, now: number, note = ""): WorkloadData {
  return patch(d, id, (x) => ({
    ...x,
    status: "in_progress",
    assignee: p.id,
    startedAt: now,
    history: hist(x, now, "Started by " + p.name + note),
  }));
}

/** Why the member can't take work now (away, or day ended), or "". */
function notWorking(d: WorkloadData, pid: number, now: number) {
  const away = d.activities.find((a) => a.pid === pid && a.kind !== "end" && a.end === null);
  if (away) return `You’re on ${awayLabel(away.kind).toLowerCase()}. Click Back to work first.`;
  if (d.activities.some((a) => a.pid === pid && a.kind === "end" && dayKey(a.start) === dayKey(now))) return "You’ve ended work for today. Undo End work to continue.";
  return "";
}

/** Waiting tasks in the member's own trades, next first. */
export const ownQueue = (d: WorkloadData, me: Person) =>
  sortTasks(d.tasks.filter((t) => t.status === "new" && me.trades.includes(t.trade)), d);

/**
 * Tasks the member can help with when their own trades are empty: other trades in
 * their systems first, then the rest of the team. Tasks still needing a trade are left
 * for an admin.
 */
export function helpQueue(d: WorkloadData, me: Person): { t: Task; sameSystem: boolean }[] {
  const tradeSys = (id: string) => d.org.trades.find((x) => x.id === id)?.sys ?? "";
  const mySys = new Set(me.trades.map(tradeSys).filter(Boolean));
  const sorted = sortTasks(d.tasks.filter((t) => t.status === "new" && t.trade && !me.trades.includes(t.trade)), d);
  const tagged = sorted.map((t) => ({ t, sameSystem: mySys.has(tradeSys(t.trade)) }));
  return tagged.filter((x) => x.sameSystem).concat(tagged.filter((x) => !x.sameSystem));
}

export function assistOffer(d: WorkloadData, me: Person): AssistOffer | undefined {
  const h = helpQueue(d, me);
  if (!h.length) return undefined;
  const tradeSys = (id: string) => d.org.trades.find((x) => x.id === id)?.sys ?? "";
  const names = [...new Set(me.trades.map(tradeSys).filter(Boolean))].map((id) => d.org.systems.find((s) => s.id === id)?.name ?? id);
  return { system: h.filter((x) => x.sameSystem).length, systemNames: names, team: h.filter((x) => !x.sameSystem).length };
}

/**
 * Whether a member may take this waiting task, trade first, then system: their own trades
 * always; another trade in their system once their trades are clear; another system once
 * their whole system is clear.
 */
export function canTake(d: WorkloadData, me: Person, t: Task) {
  if (t.status !== "new" || !canWork(me, d.settings)) return false;
  if (me.trades.includes(t.trade)) return true;
  if (!t.trade || !me.trades.length || ownQueue(d, me).length) return false;
  const h = helpQueue(d, me);
  const mine = h.find((x) => x.t.id === t.id);
  return !!mine && (mine.sameSystem || !h.some((x) => x.sameSystem));
}

const helping = (d: WorkloadData, me: Person, t: Task) =>
  me.trades.includes(t.trade) ? "" : ` (helping ${d.org.trades.find((x) => x.id === t.trade)?.name ?? "another trade"})`;

/**
 * "Start work": the member's next assigned task, or in FIFO mode the next waiting
 * task in their own trades. When their trades are empty it offers work elsewhere
 * (same system first, then the team) and takes it only once they agree (`assist`).
 * One task in progress at a time.
 */
export function startWork(d: WorkloadData, pid: number, now: number, assist = false): Outcome {
  const me = personOf(d, pid);
  if (!me || isBusy(d.tasks, pid)) return { data: d };
  const stop = notWorking(d, pid, now);
  if (stop) return { data: d, message: stop };
  if (!canWork(me, d.settings)) return { data: d, message: "You’re marked unavailable, so tasks aren’t given to you." };
  const s = d.settings;
  const next = sortTasks(d.tasks.filter((t) => t.assignee === pid && t.status === "assigned"), d)[0] ?? (s.mode === "fifo" ? ownQueue(d, me)[0] : undefined);
  if (next) return { data: begin(d, next.id, me, now), message: `Started ${next.id}.` };
  if (s.mode !== "fifo" || !me.trades.length) return { data: d, message: "Done. No more tasks waiting in your trades right now." };
  const help = helpQueue(d, me)[0];
  if (!help) return { data: d, message: "Done. Nothing is waiting in the team right now." };
  if (!assist) return { data: d, ask: assistOffer(d, me) };
  const note = helping(d, me, help.t);
  return { data: begin(d, help.t.id, me, now, note), message: `Started ${help.t.id}${note}.` };
}

/** Start a specific task: take one from the queue ("Members pick") or start one assigned to you. */
export function startTask(d: WorkloadData, id: string, pid: number, now: number): Outcome {
  const me = personOf(d, pid);
  const t = d.tasks.find((x) => x.id === id);
  if (!me || !t || isBusy(d.tasks, pid)) return { data: d };
  const stop = notWorking(d, pid, now);
  if (stop) return { data: d, message: stop };
  const take = d.settings.mode === "self" && canTake(d, me, t);
  const mine = t.status === "assigned" && t.assignee === pid;
  if (!take && !mine) return { data: d };
  // A task the member paused carries on where it stopped (its start time and worked time stay).
  if (mine && isPaused(t)) return { data: patch(d, id, (x) => ({ ...x, status: "in_progress", history: hist(x, now, "Resumed") })), message: `${id} resumed.` };
  const note = take ? helping(d, me, t) : "";
  return { data: begin(d, id, me, now, note), message: take ? `Started ${id}${note}.` : undefined };
}

/**
 * Members pick, with several picks allowed: put a waiting task on the member's own list
 * (assigned to them, not started), even while they work on another.
 */
export function pickTask(d: WorkloadData, id: string, pid: number, now: number): Outcome {
  const me = personOf(d, pid);
  const t = d.tasks.find((x) => x.id === id);
  if (!me || !t || d.settings.mode !== "self" || !d.settings.multiPick || !canTake(d, me, t)) return { data: d };
  const stop = notWorking(d, pid, now);
  if (stop) return { data: d, message: stop };
  const note = helping(d, me, t);
  return {
    data: patch(d, id, (x) => ({ ...x, status: "assigned", assignee: pid, history: hist(x, now, "Picked by " + me.name + note) })),
    message: `${id} is on your list${note}. Start it from My work.`,
  };
}

/**
 * Pause: in Members pick with several picks allowed, a member can stop the task in progress
 * (it goes back to their list, its timer stopped) and start another one from their list.
 */
export const canPause = (s: Settings) => s.mode === "self" && !!s.multiPick;
/** Paused by its assignee and not started again since (it's back on their list). */
/** History entries that end a pause: started or resumed again, done, or moved to someone / the queue. */
const UNPAUSE = /^(Started|Resumed|Done|Assigned|Returned)|take this task$/;
export const isPaused = (t: Task) => {
  if (t.status !== "assigned" || !t.startedAt) return false;
  const i = t.history.map((h) => h.text).findLastIndex((x) => x.startsWith("Paused"));
  return i >= 0 && !t.history.slice(i + 1).some((h) => UNPAUSE.test(h.text));
};
/** When a task was paused: each "Paused" entry until it's resumed (or moved, or now while still paused). */
export function pausePeriods(t: Task, now: number): [number, number][] {
  const out: [number, number][] = [];
  t.history.forEach((h, i) => {
    if (!h.text.startsWith("Paused")) return;
    const next = t.history.slice(i + 1).find((x) => x.at >= h.at && UNPAUSE.test(x.text));
    out.push([h.at, next ? next.at : (t.doneAt ?? now)]);
  });
  return out;
}

export function pauseTask(d: WorkloadData, id: string, pid: number, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.assignee !== pid || t.status !== "in_progress") return { data: d };
  if (!canPause(d.settings)) return { data: d, message: "Pause is for teams where members pick several tasks. Use Pending instead." };
  return {
    data: patch(d, id, (x) => ({ ...x, status: "assigned", history: hist(x, now, "Paused") })),
    message: `${id} paused. Start another task from your list, or resume this one when you’re ready.`,
  };
}

/**
 * Taking a task someone else has (e.g. picked by mistake): members can't hand tasks over,
 * but another member of the trade can ask for it; the assignee then lets them take it or
 * keeps it. Admins can still reassign directly.
 */
export const canClaim = (d: WorkloadData, me: Person, t: Task) =>
  t.assignee !== null &&
  t.assignee !== me.id &&
  (t.status === "assigned" || t.status === "in_progress" || t.status === "on_hold") &&
  (me.trades.includes(t.trade) || sameSystem(d, me, t.trade));
/** The trade is in one of the systems the member works in. */
const sameSystem = (d: WorkloadData, me: Person, trade: string) => {
  const sys = (id: string) => d.org.trades.find((x) => x.id === id)?.sys ?? "";
  const s0 = sys(trade);
  return !!s0 && me.trades.some((x) => sys(x) === s0);
};

export function claimTask(d: WorkloadData, id: string, pid: number, now: number): Outcome {
  const me = personOf(d, pid);
  const t = d.tasks.find((x) => x.id === id);
  if (!me || !t || !canClaim(d, me, t)) return { data: d, message: "You can ask only for open tasks in your trades or system that someone else has." };
  if (t.claim && t.claim.by !== pid) return { data: d, message: `${personOf(d, t.claim.by)?.name ?? "Someone"} has already asked for ${id}.` };
  if (t.claim) return { data: d };
  const who = personOf(d, t.assignee)?.name ?? "the assignee";
  return {
    data: patch(d, id, (x) => ({ ...x, claim: { by: pid, at: now }, history: hist(x, now, `${me.name} asked to take this from ${who}`) })),
    message: `Asked ${who}. ${id} moves to you if they agree.`,
  };
}

export function answerClaim(d: WorkloadData, id: string, ok: boolean, pid: number, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t?.claim || t.assignee !== pid || t.status === "done") return { data: d };
  const to = personOf(d, t.claim.by);
  const me = personOf(d, pid);
  if (!ok || !to)
    return {
      data: patch(d, id, (x) => ({ ...x, claim: null, history: hist(x, now, `${me?.name ?? "The assignee"} kept this task`) })),
      message: `You kept ${id}.`,
    };
  // Moves to them, waiting for them to start it (time already worked stays in the history).
  return {
    data: patch(d, id, (x) => ({
      ...x,
      assignee: to.id,
      status: "assigned",
      startedAt: null,
      hold: "",
      claim: null,
      history: hist(x, now, `${me?.name ?? "The assignee"} let ${to.name} take this task`),
    })),
    message: `${id} moved to ${to.name}.`,
  };
}

export function cancelClaim(d: WorkloadData, id: string, pid: number, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t?.claim || t.claim.by !== pid) return { data: d };
  return { data: patch(d, id, (x) => ({ ...x, claim: null, history: hist(x, now, "Request to take withdrawn") })), message: "Request withdrawn." };
}

/** Delay remarks on an open overdue ticket (shown in the queue; kept when it's resolved). */
export function setDelay(d: WorkloadData, id: string, delay: string, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.status === "done") return { data: d };
  if (now <= due(t, d)) return { data: d, message: `${id} isn't overdue yet.` };
  const why = String(delay ?? "").trim().slice(0, 500);
  if ((t.delay ?? "") === why) return { data: d };
  return {
    data: patch(d, id, (x) => ({ ...x, delay: why || null, history: hist(x, now, why ? `Delay remarks: ${why}` : "Delay remarks cleared") })),
    message: why ? `Delay remarks saved for ${id}.` : `Delay remarks cleared for ${id}.`,
  };
}

export function holdTask(d: WorkloadData, id: string, reason: string, now: number): Outcome {
  const r = reason.trim();
  if (!r) return { data: d };
  return {
    data: patch(d, id, (x) =>
      x.status === "in_progress" ? { ...x, status: "on_hold", hold: r, history: hist(x, now, "On hold: " + r) } : x,
    ),
    message: "Pending. You can start another ticket.",
  };
}

export function resumeTask(d: WorkloadData, id: string, pid: number, now: number): Outcome {
  const stop = notWorking(d, pid, now);
  if (stop) return { data: d, message: stop };
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.assignee !== pid || t.status !== "on_hold" || isBusy(d.tasks, pid)) return { data: d };
  return { data: patch(d, id, (x) => ({ ...x, status: "in_progress", history: hist(x, now, "Resumed") })) };
}

export const missingRequired = (fields: TaskField[], vals: Task["fields"]) =>
  fields.filter((f) => f.required && String(vals[f.key] ?? "").trim() === "").map((f) => f.label);

export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}` : `${m} min`);

/**
 * Mark done (required fields must be filled — they may be blank when uploaded), then
 * auto-feed the next task if the team uses it. Overtime is reported at End work.
 */
export function completeTask(d: WorkloadData, id: string, vals: Task["fields"], pid: number, now: number, cx?: Record<string, number> | null, delay?: string | null): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.status !== "in_progress" || t.assignee !== pid) return { data: d };
  // Resolving after the due time needs delay remarks.
  const late = now > due(t, d);
  const why = typeof delay === "string" ? delay.trim().slice(0, 500) : "";
  if (late && !why) return { data: d, message: `${id} is overdue. Enter delay remarks to resolve it.` };
  // Complexity: the contracts by level; with a number field as the productivity basis, it's their total.
  let counts: Record<string, number> | null = null;
  if (cxOn(d.settings)) {
    counts = cleanCx(d.settings, cx);
    if (!counts) return { data: d, message: `Enter how many contracts of each complexity ${id} had.` };
    const f = cxField(d);
    if (f) vals = { ...vals, [f.key]: cxTotal(counts) };
  }
  const miss = missingRequired(d.fields, vals);
  if (miss.length) return { data: d, message: `Fill in ${miss.join(", ")} before resolving ${id}.` };
  const note = counts ? ` · ${cxText(d.settings, counts)}` : "";
  const done = patch(d, id, (x) => ({
    ...x,
    status: "done",
    doneAt: now,
    fields: { ...vals },
    ...(counts ? { cx: counts, cxReview: null } : {}),
    ...(late ? { delay: why } : {}),
    history: hist(x, now, "Done" + note + (late ? ` · Delay: ${why}` : "")),
  }));
  const s = d.settings;
  const feed = s.autoFeed && (s.mode === "fifo" || done.tasks.some((x) => x.assignee === pid && x.status === "assigned"));
  if (feed) {
    const n = startWork(done, pid, now);
    const rest = n.message && !n.ask ? " " + n.message.replace(/^Done\. /, "") : "";
    return { ...n, message: n.message?.startsWith("Started") ? n.message : `${id} done.${rest}` };
  }
  return { data: done, message: `${id} done. Click Start work for the next one.` };
}

/**
 * Round-robin: the available member of the trade with the fewest open (assigned + in
 * progress) tasks. Outside their shift, members get new tasks only while they're working
 * overtime (a task in progress or finished in the last 15 minutes, and work not ended).
 */
export function rrPick(tradeId: string, tasks: Task[], s: Settings, people: Person[], onOt: (p: Person) => boolean = () => false): Person | null {
  const cand = people.filter((p) => p.trades.includes(tradeId) && canWork(p, s) && (!s.skipUnavail || p.avail === "available" || onOt(p)));
  if (!cand.length) return null;
  const load = (p: Person) => tasks.filter((t) => t.assignee === p.id && (t.status === "assigned" || t.status === "in_progress")).length;
  return cand.slice().sort((a, b) => load(a) - load(b) || a.name.localeCompare(b.name))[0];
}

function rrAssign(d: WorkloadData, tasks: Task[], ids: string[], now: number): { tasks: Task[]; n: number } {
  const { settings: s, people } = d;
  const ended = new Set(d.activities.filter((a) => a.kind === "end" && sameDay(a.start, now)).map((a) => a.pid));
  let n = 0;
  for (const id of ids) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status !== "new" || !t.trade) continue;
    const onOt = (p: Person) =>
      !ended.has(p.id) && tasks.some((x) => x.assignee === p.id && (x.status === "in_progress" || (x.status === "done" && x.doneAt !== null && x.doneAt >= now - 15 * M)));
    const p = rrPick(t.trade, tasks, s, people, onOt);
    if (!p) continue;
    n++;
    tasks = tasks.map((x) =>
      x.id === id
        ? { ...x, status: "assigned", assignee: p.id, history: hist(x, now, `Assigned to ${p.name} (round-robin)`) }
        : x,
    );
  }
  return { tasks, n };
}

/** Add new tasks to the queue; in round-robin mode they are assigned straight away. */
export function addTasks(d: WorkloadData, newTasks: Task[], label: string, now: number): Outcome {
  let tasks = d.tasks.concat(newTasks);
  if (d.settings.mode === "rr") tasks = rrAssign(d, tasks, newTasks.map((t) => t.id), now).tasks;
  return { data: { ...d, tasks }, message: `${plural(newTasks.length, "task")} added${label}.` };
}

/** "Share out queue now": round-robin every waiting task that has a trade. */
export function distribute(d: WorkloadData, now: number): Outcome {
  const ids = sortTasks(d.tasks.filter((t) => t.status === "new" && t.trade), d).map((t) => t.id);
  const { tasks, n } = rrAssign(d, d.tasks, ids, now);
  return { data: { ...d, tasks }, message: `${n} tasks shared out.` };
}

// ── admin edits from task details ──

export function setTrade(d: WorkloadData, id: string, tradeId: string, now: number): Outcome {
  if (!d.org.trades.some((t) => t.id === tradeId)) return { data: d, message: "That trade isn’t in this team." };
  let data = patch(d, id, (x) => {
    const requeue = x.status === "new" || x.status === "assigned";
    // A task type the new trade doesn't use goes back to a standard request.
    const keepType = !x.ttype || typesFor(d.settings, tradeId).some((t) => t.id === x.ttype);
    const base = keepType ? x : withSla({ ...x, ttype: "" }, d.settings);
    return {
      ...base,
      trade: tradeId,
      assignee: requeue ? null : x.assignee,
      status: requeue ? "new" : x.status,
      history: hist(x, now, "Trade set to " + trPathOf(d.org, tradeId)),
    };
  });
  if (d.settings.mode === "rr" && tradeId) data = { ...data, tasks: rrAssign(d, data.tasks, [id], now).tasks };
  return { data };
}

export function setPriority(d: WorkloadData, id: string, pr: Priority, now: number): Outcome {
  return {
    data: patch(d, id, (x) => {
      // A standard request's SLA follows its priority; a typed task keeps its type's SLA.
      const y = taskTypeOf(d.settings, x) ? { ...x, pr } : withSla({ ...x, pr }, d.settings);
      return { ...y, history: hist(x, now, "Priority set to " + PR[pr][0] + (y.slaH !== slaOf(x, d.settings) ? ` · SLA ${y.slaH} h` : "")) };
    }),
  };
}

/** Correct when a task was received (admins); its due time follows. */
export function setReceived(d: WorkloadData, id: string, received: number, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || !Number.isFinite(received)) return { data: d };
  if (received > now + 5 * M) return { data: d, message: "Received can’t be in the future." };
  if (received < now - 400 * 24 * H) return { data: d, message: "That date is too far back." };
  return {
    data: patch(d, id, (x) => ({ ...x, received, history: hist(x, now, `Received changed from ${fmtT(x.received)} to ${fmtT(received)}`) })),
    message: `${id}: received ${fmtT(received)}.`,
  };
}

/** Set a task's type ("" = standard request); its SLA is fixed again from the settings. */
export function setTaskType(d: WorkloadData, id: string, ttype: string, now: number): Outcome {
  const ty = ttype ? (d.settings.taskTypes ?? []).find((x) => x.id === ttype) : undefined;
  if (ttype && !ty) return { data: d, message: "That task type isn’t set up." };
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.status === "done") return { data: d };
  if (ty && t.trade && !typesFor(d.settings, t.trade).some((x) => x.id === ty.id))
    return { data: d, message: `${ty.name} isn’t used in ${trPathOf(d.org, t.trade)}.` };
  const y = withSla({ ...t, ttype }, d.settings);
  return {
    data: patch(d, id, () => ({ ...y, history: hist(t, now, (ty ? `Task type set to ${ty.name}` : "Set as a standard request") + ` · SLA ${y.slaH} h`) })),
    message: `${id}: ${ty ? ty.name : "standard request"}, SLA ${y.slaH} h.`,
  };
}

/** Assign to a person, or pid = null to return the task to the queue. */
export function assignTask(d: WorkloadData, id: string, pid: number | null, now: number): Outcome {
  if (pid === null)
    return {
      data: patch(d, id, (x) => ({ ...x, assignee: null, status: "new", claim: null, history: hist(x, now, "Returned to queue") })),
    };
  const p = personOf(d, pid);
  if (!p) return { data: d };
  return {
    data: patch(d, id, (x) => ({
      ...x,
      assignee: p.id,
      claim: null, // an admin's reassignment settles any request to take it
      // An in-progress task moves to the new person as "assigned" so they never hold two at once.
      status: x.status === "on_hold" ? "on_hold" : "assigned",
      history: hist(x, now, "Assigned to " + p.name),
    })),
    message: `${id} assigned to ${p.name}.`,
  };
}

// ── intake ──

const blankTask = (id: string, now: number) => ({
  id,
  received: now,
  status: "new" as const,
  assignee: null,
  startedAt: null,
  doneAt: null,
  ot: false,
  hold: "",
});

/** Demo stand-in for the Microsoft Graph mailbox webhook: adds two sample emails. */
export function checkMail(d: WorkloadData, now: number): Outcome {
  const k = d.mailCount;
  let seq = d.seq;
  const tr = d.settings.mailTrade;
  const nt: Task[] = [SAMPLE_MAIL[k % 4], SAMPLE_MAIL[(k + 1) % 4]].map(([from, subject, body, attachments], i) => {
    const rec = now - i * 60_000;
    return {
      ...blankTask("T-" + seq++, rec),
      title: subject.replace(/^URGENT: /, ""),
      trade: tr,
      ttype: detectType(d.settings, subject, tr),
      pr: /urgent/i.test(subject) ? ("high" as const) : ("normal" as const),
      source: "outlook" as const,
      fields: { carrier: CARRIERS.find((c) => subject.includes(c)) ?? "" },
      email: { from, cc: "rm.team@dsv.com", subject, body, attachments },
      history: [{ at: rec, text: "Received from Outlook" + (tr ? "" : " · waiting for an admin to set the trade") }],
    };
  }).map((t) => withSla(t, d.settings));
  return addTasks({ ...d, seq, mailCount: k + 2 }, nt, " from " + d.settings.mailbox, now);
}

export type UploadRow = Record<string, unknown>;

export interface CheckedRow {
  n: number;
  summary: string;
  ok: boolean;
  msg: string;
  /** received: when the request came in (team time), or null to use the upload time. */
  task: { title: string; trade: string; pr: Priority; ttype: string; fields: Task["fields"]; received: number | null } | null;
}

/** Validate uploaded rows against the team's task fields. Row numbers match the spreadsheet (header = row 1). */
/**
 * The Received date and time of an uploaded row, in team time. Excel date cells (shown as
 * team-local time) or text like "2026-09-24 08:30"; blank = null (use the upload time).
 */
export function parseReceived(v: unknown): number | null | "bad" | "ambiguous" {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? "bad" : v.getTime() - TZ_OFFSET_H * H;
  // An Excel date serial (a date cell read as a plain number): days since 1899-12-30, team time.
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    if (!(n > 30000 && n < 80000)) return "bad";
    return Math.round((n - 25569) * 86_400) * 1000 - TZ_OFFSET_H * H;
  }
  const s = String(v).trim().replace(/\s+/g, " ");
  const at = (y: number, mo: number, d: number, time: string | undefined) => {
    let hh = 0, mm = 0, ss = 0;
    if (time) {
      const t = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?$/);
      if (!t) return "bad" as const;
      hh = +t[1]; mm = +t[2]; ss = +(t[3] ?? 0);
      if (t[4]) {
        if (hh < 1 || hh > 12) return "bad" as const;
        hh = (hh % 12) + (/p/i.test(t[4]) ? 12 : 0);
      }
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return "bad" as const;
    const ms = Date.UTC(y, mo - 1, d, hh, mm, ss);
    if (new Date(ms).getUTCDate() !== d) return "bad" as const;
    return ms - TZ_OFFSET_H * H;
  };
  // 2026-09-25, 2026-09-25 12:26, 2026-09-25T12:26:00
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](.+))?$/);
  if (m) return at(+m[1], +m[2], +m[3], m[4]);
  // 25/09/2026 12:26 or 09/25/2026 12:26 PM: only when day and month can't be mixed up.
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?: (.+))?$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) return at(+m[3], b, a, m[4]);
    if (b > 12 && a <= 12) return at(+m[3], a, b, m[4]);
    return a === b ? at(+m[3], a, b, m[4]) : "ambiguous";
  }
  return "bad";
}

export function checkRows(rows: UploadRow[], fields: TaskField[], org: WlOrg, now = Date.now(), types: TaskType[] = []): CheckedRow[] {
  const g = (r: UploadRow, l: string) => {
    const k = Object.keys(r).find((x) => lc(x) === lc(l));
    return k ? r[k] : "";
  };
  return rows.map((r, i) => {
    const title = String(g(r, "Title") ?? "").trim();
    const sysV = lc(g(r, "System"));
    const trV = lc(g(r, "Trade"));
    // System is needed only when a trade name is used under more than one system.
    const sys = sysV ? org.systems.find((x) => lc(x.name) === sysV) : undefined;
    const named = org.trades.filter((t) => lc(t.name) === trV);
    const only = org.trades.length === 1 && !trV && !sysV ? org.trades[0] : undefined;
    const tr = only ?? (sys ? named.find((t) => t.sys === sys.id) ?? (trV ? undefined : org.trades.find((t) => t.id === sys.id)) : named.length === 1 ? named[0] : undefined);
    const prV = lc(g(r, "Priority")) || "normal";
    // When the request actually came in: the due time counts from here, not from the upload.
    const rec = parseReceived(g(r, "Received"));
    // Task type by name; blank = found from the title's keywords, else a standard request.
    const tyV = lc(g(r, "Task type"));
    const ty = tyV ? types.find((x) => lc(x.name) === tyV) : undefined;
    const out: Task["fields"] = {};
    let err = !title
      ? "Title is missing"
      : sysV && !sys
        ? "System not found"
        : !tr
          ? named.length > 1
            ? "Add the System — that trade is in more than one"
            : sys && named.length
              ? `${named[0].name} isn’t under ${sys.name}`
              : "Trade not found"
          : !(prV in PR)
            ? "Priority must be High, Normal or Low"
            : rec === "ambiguous"
              ? "Received: write it as 2026-09-24 08:30 (day and month could be mixed up)"
              : rec === "bad"
              ? "Received must be a date and time like 2026-09-24 08:30"
              : typeof rec === "number" && rec > now + 5 * M
                ? "Received is in the future"
                : tyV && !ty
                  ? `Task type “${String(g(r, "Task type")).trim()}” isn’t set up`
                  : "";
    if (!err)
      for (const f of fields) {
        let raw = g(r, f.label);
        if (raw instanceof Date) raw = raw.toISOString().slice(0, 10);
        let v = String(raw ?? "").trim();
        if (f.type === "date" && /^\d{4}-\d{2}-\d{2}[ T]/.test(v)) v = v.slice(0, 10);
        // Required fields may be blank in an upload; they're needed before the task is marked done.
        if (v && f.type === "number" && isNaN(Number(v))) { err = `${f.label} must be a number`; break; }
        if (v && f.type === "select" && !fieldOptions(f).map(lc).includes(lc(v))) { err = `${f.label} “${v}” isn’t in the list`; break; }
        out[f.key] = v;
      }
    return {
      n: i + 2,
      summary:
        title +
        (tr ? ` · ${tr.sys ? sysName(org, tr.sys) + " › " : ""}${tr.name}` : "") +
        (ty ? ` · ${ty.name}` : ""),
      ok: !err,
      msg: err || "Ready",
      task: err
        ? null
        : {
            title,
            trade: tr!.id,
            pr: prV as Priority,
            ttype: ty?.id ?? detectType({ taskTypes: types } as Settings, title, tr!.id),
            fields: out,
            received: typeof rec === "number" ? rec : null,
          },
    };
  });
}

export function importRows(d: WorkloadData, checked: CheckedRow[], now: number): Outcome {
  let seq = d.seq;
  const nt: Task[] = checked
    .filter((c) => c.ok && c.task)
    .map((c) => {
      const { received, ...task } = c.task!;
      return withSla(
        {
          ...blankTask("T-" + seq++, now),
          ...task,
          received: received ?? now,
          source: "upload" as const,
          email: null,
          history: [{ at: now, text: "Imported from upload" + (received ? ` (received ${fmtT(received)})` : "") }],
        },
        d.settings,
      );
    });
  return addTasks({ ...d, seq }, nt, " from upload", now);
}

// ── metrics ──

/** Fraction of the person's shift that has passed (0–1). Metrics are pro-rated by this. */
export function elapsedFrac(p: Person, s: Settings, now: number) {
  const e = (localHour(now) - p.shiftStart + 24) % 24;
  return e >= s.work.shift ? 1 : e / s.work.shift;
}

export function targetOf(p: Person, s: Settings) {
  const o = s.memberTargets[p.id];
  if (o !== undefined && o !== "") return Number(o) || 0;
  return p.trades.length ? s.targets[p.trades[0]] || 0 : 0;
}

/** The field productivity is measured by, or undefined for completed tasks. */
export const basisField = (d: Pick<WorkloadData, "fields" | "settings">) =>
  d.settings.prodBasis && d.settings.prodBasis !== "tasks" ? d.fields.find((f) => f.key === d.settings.prodBasis) : undefined;

/** Unit name for targets and productivity: "tasks" or the field's label. */
export const basisUnit = (d: Pick<WorkloadData, "fields" | "settings">) => basisField(d)?.label ?? "tasks";

/**
 * Output of a set of done tasks by the team's productivity basis: the number of tasks,
 * the sum of a number field, or the distinct values of any other field (e.g. tickets).
 */
export function output(d: Pick<WorkloadData, "fields" | "settings">, done: Task[]) {
  const f = basisField(d);
  if (!f) return done.length;
  if (f.type === "number") return done.reduce((a, t) => a + (Number(t.fields[f.key]) || 0), 0);
  return new Set(done.map((t) => String(t.fields[f.key] ?? "").trim().toLowerCase()).filter(Boolean)).size;
}

/** Whether productivity is weighted by task type targets (counting tasks, and a type has a target). */
export const typeTargets = (d: Pick<WorkloadData, "fields" | "settings">) =>
  (!basisField(d) && (d.settings.taskTypes ?? []).some((t) => (t.target ?? 0) > 0)) || cxLevels(d.settings).some((l) => (l.target ?? 0) > 0);

/**
 * How much of a full day's work the done tasks make. Counting tasks: each task of a type
 * with a daily target counts 1/target, every other task 1/the member's target (so 3 Doc
 * reviews of 4 plus 1 Booking of 2 = 1.25 days). With a field as the basis: output ÷ target.
 */
export function dayShare(d: Pick<WorkloadData, "fields" | "settings">, done: Task[], target: number) {
  const f = basisField(d);
  const levels = cxLevels(d.settings);
  // Distinct values of a field (e.g. tickets): output ÷ target.
  if (f && f.type !== "number") return { share: target > 0 ? output(d, done) / target : 0, mix: "", any: false };
  const groups = new Map<string, { name: string; n: number; of: number }>();
  let share = 0;
  let any = false;
  const add = (key: string, name: string, n: number, of: number) => {
    if (of > 0) share += n / of;
    const g = groups.get(key) ?? { name, n: 0, of };
    g.n += n;
    groups.set(key, g);
  };
  for (const t of done) {
    const ty = f ? undefined : taskTypeOf(d.settings, t);
    const typed = !!ty && (ty.target ?? 0) > 0;
    const base = typed ? ty!.target! : target;
    // Complexity first: each contract counts 1 ÷ its level's target (or the task's usual target).
    if (levels.length && t.cx && cxTotal(t.cx) > 0) {
      for (const l of levels) {
        const n = t.cx[l.id] ?? 0;
        if (!n) continue;
        if ((l.target ?? 0) > 0) any = true;
        add("cx:" + l.id, l.name, n, (l.target ?? 0) > 0 ? l.target! : base);
      }
      continue;
    }
    if (typed) any = true;
    add(typed ? ty!.id : "", typed ? ty!.name : f ? f.label.toLowerCase() : "standard", f ? Number(t.fields[f.key]) || 0 : 1, base);
  }
  const mix = [...groups.values()].map((g) => `${g.n} ${g.name}${g.of ? " of " + g.of : ""}`).join(" · ");
  return { share, mix, any };
}

export interface PersonMetrics {
  /** Output today in the team's productivity basis (tasks, or the chosen field). */
  out: number;
  /** Share of a full day's work done today (1 = the day's target), weighted by task type targets. */
  share: number;
  /** Share of the day expected so far (the elapsed part of the shift), 0 when there is no target. */
  exp: number;
  /** Done today per task type against its daily target, e.g. "3 Doc review of 4 · 1 Booking of 2". */
  mix: string;
  /** Approved overtime minutes today (reported at end of work). */
  otMin: number;
  /** Overtime reported today and still waiting for approval. */
  otPending: number;
  /** Minutes away today by kind (break, lunch, meeting, ad hoc, training). */
  away: Record<string, number>;
  done: number;
  target: number;
  /** Tasks added to today's target for overtime. */
  otTarget: number;
  /** Days of target added for overtime (e.g. 0.25 = a quarter of the day's target). */
  otDays: number;
  /** Target so far (target × elapsed fraction, plus overtime). */
  tgt: number;
  /** Productive time so far, ms. */
  avail: number;
  /** Idle so far today, ms: shift time with no task running and not away. */
  idle: number;
  /** Handle time today, ms (done tasks start→done, plus the current task). */
  handle: number;
  onTime: number;
  prod: number | null;
  util: number | null;
  time: number | null;
}

export function personMetrics(d: WorkloadData, p: Person, now: number): PersonMetrics {
  const s = d.settings;
  const today = dayKey(now);
  const act = dayActivity(d, p.id, now);
  // After End work, the day stops there.
  const until = act.ended ? Math.min(now, act.ended.start) : now;
  const fr = elapsedFrac(p, s, until);
  // Time available for tasks: shift time so far minus time away. Unlogged time counts as
  // available, except the planned breaks (Targets › Working time) when none were logged.
  const avail = Math.max(0, s.work.shift * H * fr - Math.max(act.awayMs, (s.work.b1 + s.work.b2) * M * fr));
  const mine = d.tasks.filter((t) => t.assignee === p.id);
  const done = mine.filter((t) => t.status === "done" && t.doneAt !== null && dayKey(t.doneAt) === today);
  const handle = done.concat(mine.filter((t) => t.status === "in_progress")).reduce((a, t) => a + taskWorkMs(d, t, until), 0);
  const target = targetOf(p, s);
  const tgt = target * fr;
  const onTime = done.filter((t) => t.doneAt! <= due(t, d)).length;
  const out = output(d, done);
  const { share, mix, any } = dayShare(d, done, target);
  // Overtime raises the day's target by the tasks that fit in it.
  const ot = otDays(s, target, otMinFor(d, p, now));
  // Holiday duty and rest days aren't scheduled days: only the overtime is expected.
  const dayPart = p.otDay ? 0 : fr;
  const exp = target > 0 || any ? dayPart + ot : 0;
  return {
    otTarget: Math.round(ot * target * 100) / 100,
    otDays: ot,
    out,
    share,
    exp,
    mix,
    otMin: act.otApproved,
    otPending: act.otPending,
    away: act.away,
    done: done.length,
    target,
    tgt: (p.otDay ? 0 : tgt) + ot * target,
    avail,
    handle,
    onTime,
    prod: exp ? Math.round((share / exp) * 100) : null,
    util: avail ? Math.round((handle / avail) * 100) : null,
    time: done.length ? Math.round((onTime / done.length) * 100) : null,
    idle: idleToday(d, p, now) + (act.away.idle ?? 0) * M,
  };
}

export const doneToday = (tasks: Task[], now: number) => {
  const today = dayKey(now);
  return tasks.filter((t) => t.status === "done" && t.doneAt !== null && dayKey(t.doneAt) === today);
};

// ── status: breaks, meetings, end of day, overtime ──

export const AWAY: [Exclude<ActivityKind, "end" | "idle">, string][] = [
  ["break", "Break"],
  ["lunch", "Lunch"],
  ["meeting", "Meeting"],
  ["adhoc", "Ad hoc"],
  ["training", "Training"],
];
export const awayLabel = (k: ActivityKind) => (k === "idle" ? "Idle" : (AWAY.find(([x]) => x === k)?.[1] ?? "End of day"));
/**
 * "idle" entries were logged by an earlier Pause button (kept for those records): like idle
 * time, they aren't deducted from the time available. Idle is now worked out (idleMs).
 */
export const IDLE: ActivityKind = "idle";

/** Merge intervals and total the part inside [from, to). */
function coveredMs(iv: [number, number][], from: number, to: number) {
  const xs = iv.map(([a, b]): [number, number] => [Math.max(a, from), Math.min(b, to)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let tot = 0;
  let cur = -Infinity;
  for (const [a, b] of xs) {
    const s0 = Math.max(a, cur);
    if (b > s0) tot += b - s0;
    cur = Math.max(cur, b);
  }
  return tot;
}

/**
 * Idle: time in [from, to) with no task running for the member (not on hold or paused)
 * and not logged away (break, lunch, meeting, …). Callers pass the shift window.
 */
export function idleMs(d: Pick<WorkloadData, "tasks" | "activities">, pid: number, from: number, to: number, now: number) {
  to = Math.min(to, now);
  if (to <= from) return 0;
  const busy: [number, number][] = [];
  for (const t of d.tasks) {
    if (t.assignee !== pid || !t.startedAt || t.startedAt >= to) continue;
    const end = t.status === "done" ? (t.doneAt ?? now) : t.status === "in_progress" ? now : Math.max(t.startedAt, t.history.at(-1)?.at ?? t.startedAt);
    // Running = started → done (or now / the last change), minus time on hold or paused.
    const off: [number, number][] = holdPeriods(t, now).map((p): [number, number] => [p.from, p.to ?? now]).concat(pausePeriods(t, now));
    let s0 = t.startedAt;
    for (const [a, b] of off.sort((x, y) => x[0] - y[0])) {
      if (a > s0) busy.push([s0, Math.min(a, end)]);
      s0 = Math.max(s0, b);
    }
    if (end > s0) busy.push([s0, end]);
  }
  for (const a of d.activities) if (a.pid === pid && a.kind !== "end" && a.kind !== IDLE) busy.push([a.start, a.end ?? now]);
  return Math.max(0, to - from - coveredMs(busy, from, to));
}

/** Today's shift window for a member: [start, end) around `now`. */
export function shiftWindow(p: Person, s: Settings, now: number): [number, number] {
  const e = (localHour(now) - p.shiftStart + 24) % 24;
  const start = Math.round((now - e * H) / M) * M;
  return [start, start + s.work.shift * H];
}

/** Idle so far today: in the shift, until End work; not on leave, holiday duty or a rest day. */
export function idleToday(d: WorkloadData, p: Person, now: number) {
  if (p.avail === "leave" || p.otDay || p.onToday === false) return 0;
  const [a, b] = shiftWindow(p, d.settings, now);
  const end = endedToday(d, p.id, now);
  return idleMs(d, p.id, a, end ? Math.min(b, end.start) : b, now);
}

const sameDay = (a: number, b: number) => dayKey(a) === dayKey(b);
/** The member's ongoing away entry, if any. */
export const currentAway = (d: WorkloadData, pid: number) => d.activities.find((a) => a.pid === pid && a.kind !== "end" && a.end === null);
/** The member's end-of-day entry for today, if they've ended work. */
export const endedToday = (d: WorkloadData, pid: number, now: number) => d.activities.find((a) => a.pid === pid && a.kind === "end" && sameDay(a.start, now));

const closeAway = (list: Activity[], pid: number, now: number) =>
  list.map((a) => (a.pid === pid && a.kind !== "end" && a.end === null ? { ...a, end: now } : a));
const newActivity = (pid: number, kind: ActivityKind, now: number, extra: Partial<Activity> = {}): Activity => ({
  id: `A-${pid}-${now.toString(36)}`,
  pid,
  kind,
  start: now,
  end: kind === "end" ? now : null,
  otMin: 0,
  otStatus: null,
  decidedBy: null,
  decidedAt: null,
  ...extra,
});

/** Go on a break / lunch / meeting / ad hoc / training (ends any other one). A task in progress keeps running but the time away isn't counted on it. */
export function startAway(d: WorkloadData, pid: number, kind: ActivityKind, now: number): Outcome {
  // Idle isn't logged by hand: it's the shift time with no task running (see idleMs).
  if (kind === "end" || !AWAY.some(([k]) => k === kind) || !personOf(d, pid)) return { data: d };
  if (endedToday(d, pid, now)) return { data: d, message: "You’ve ended work for today." };
  const cur = currentAway(d, pid);
  if (cur?.kind === kind) return { data: d };
  return {
    data: { ...d, activities: closeAway(d.activities, pid, now).concat(newActivity(pid, kind, now)) },
    message: kind === IDLE ? "Task paused. The timer is stopped; the time counts as idle." : `${awayLabel(kind)} started.`,
  };
}

export function backToWork(d: WorkloadData, pid: number, now: number): Outcome {
  const cur = currentAway(d, pid);
  if (!cur) return { data: d };
  const mins = fmtMin(Math.round((now - cur.start) / 60000));
  return {
    data: { ...d, activities: closeAway(d.activities, pid, now) },
    message: cur.kind === IDLE ? `Task resumed after ${mins} paused.` : `Back to work after ${mins} ${awayLabel(cur.kind).toLowerCase()}.`,
  };
}

/**
 * Minutes that can be reported as overtime now: on holiday duty or a rest day worked,
 * everything since the member first started today (up to 16 h); otherwise the time past the shift.
 */
export function otAvailMin(d: Pick<WorkloadData, "tasks" | "activities" | "settings">, p: Person, now: number) {
  if (!p.otDay) return pastShiftMin(p, d.settings, now);
  const today = dayKey(now);
  const starts = d.tasks
    .filter((t) => t.assignee === p.id && t.startedAt && dayKey(t.startedAt) === today)
    .map((t) => t.startedAt!)
    .concat(d.activities.filter((a) => a.pid === p.id && a.kind !== "end" && dayKey(a.start) === today).map((a) => a.start));
  if (!starts.length) return 0;
  return Math.max(0, Math.min(16 * 60, Math.round((now - Math.min(...starts)) / M)));
}

export const OT_KIND: Record<"holiday" | "restday", string> = { holiday: "Holiday duty", restday: "Rest day OT" };

/** Minutes worked past the end of today's shift so far (0 during or before the shift). */
export function pastShiftMin(p: Person, s: Settings, now: number) {
  const e = (localHour(now) - p.shiftStart + 24) % 24;
  // Up to 12 hours past the shift end counts as overtime; beyond that it's before the next shift.
  return e >= s.work.shift && e - s.work.shift <= 12 ? Math.round((e - s.work.shift) * 60) : 0;
}

/**
 * End the working day. The member reports overtime only when they end after their
 * shift (at most the time past it); it waits for approval by an admin or lead.
 */
export function endWork(d: WorkloadData, pid: number, otMin: number, now: number, split?: OtPart[] | null): Outcome {
  const me = personOf(d, pid);
  if (!me || endedToday(d, pid, now)) return { data: d };
  if (isBusy(d.tasks, pid)) return { data: d, message: "Resolve your ticket or set it to pending before you end work." };
  const avail = otAvailMin(d, me, now);
  const ot = Math.max(0, Math.min(Math.round(Number(otMin) || 0), avail));
  // The breakdown must use this team's processes and task types and add up to the overtime.
  let parts: OtPart[] | null = null;
  // Processes: the member's own, plus other trades they worked tasks in after the shift.
  const procs = otProcesses(d, me, avail, now);
  if (ot && split?.length && asksOtSplit(d.settings, procs)) {
    const clean = split
      .map((x) => ({ trade: String(x.trade ?? ""), ttype: x.ttype ? String(x.ttype) : "", min: Math.round(Number(x.min) || 0) }))
      .filter((x) => x.min > 0);
    if (clean.some((x) => !procs.some((t) => t.id === x.trade) || (x.ttype && !typesFor(d.settings, x.trade).some((t) => t.id === x.ttype))))
      return { data: d, message: "Choose a process for each line of overtime." };
    if (clean.reduce((a, x) => a + x.min, 0) !== ot) return { data: d, message: `The breakdown must add up to ${fmtMin(ot)}.` };
    // Same process and type on two lines: one line.
    const merged = new Map<string, OtPart>();
    for (const x of clean) {
      const k = x.trade + "|" + x.ttype;
      const m = merged.get(k);
      merged.set(k, m ? { ...m, min: m.min + x.min } : { trade: x.trade, ...(x.ttype ? { ttype: x.ttype } : {}), min: x.min });
    }
    parts = [...merged.values()];
  } else if (ot && procs.length === 1 && !asksOtSplit(d.settings, procs)) parts = [{ trade: procs[0].id, min: ot }];
  const end = newActivity(pid, "end", now, { otMin: ot, otStatus: ot ? "pending" : null, otSplit: parts, otKind: ot && me.otDay ? me.otDay : null });
  return {
    data: { ...d, activities: closeAway(d.activities, pid, now).concat(end) },
    message: ot ? `Work ended. ${fmtMin(ot)} ${me.otDay ? OT_KIND[me.otDay].toLowerCase() : "overtime"} sent for approval.` : "Work ended. See you next shift.",
  };
}

/** Task types that apply to a process (trade): those for every trade, or naming it. */
/** Where a task type applies, as people read it: "EU, LCL" or "All trades". */
export const typeScope = (d: Pick<WorkloadData, "org">, t: Pick<TaskType, "trades">) =>
  t.trades.length ? t.trades.map((id) => d.org.trades.find((x) => x.id === id)?.name ?? id).join(", ") : "All trades";
export const typesFor = (s: Settings, trade: string) => (s.taskTypes ?? []).filter((t) => !t.trades.length || t.trades.includes(trade));

/** Trades of the tasks the member worked on in the last `min` minutes. */
const workedTrades = (d: Pick<WorkloadData, "tasks">, pid: number, min: number, now: number) =>
  new Set(
    min > 0
      ? d.tasks.filter((t) => t.assignee === pid && t.trade && t.startedAt && t.startedAt < now && (t.doneAt ?? now) > now - min * M).map((t) => t.trade)
      : [],
  );

/**
 * Processes a member can put overtime against: their own trades plus any other trade they
 * worked tasks in during the overtime (e.g. helping out); with no trades, the team's.
 */
export const otProcesses = (d: Pick<WorkloadData, "org" | "tasks">, me: Person, otMin = 0, now = 0) => {
  const worked = workedTrades(d, me.id, otMin, now);
  const mine = d.org.trades.filter((t) => me.trades.includes(t.id) || worked.has(t.id));
  return (mine.length ? mine : d.org.trades).map((t) => ({ id: t.id, name: trPathOf(d.org, t.id) }));
};

/** Whether End work asks what the overtime was for: more than one process, or task types for one. */
export const asksOtSplit = (s: Settings, procs: { id: string }[]) => procs.length > 1 || procs.some((p) => typesFor(s, p.id).length > 0);

/**
 * Extra days of target for overtime: the tasks that fit in it at the member's daily pace,
 * whole tasks only (4 a day in 6.8 productive hours: 3 h of overtime adds 1). Without a
 * member target (task type targets only), the overtime's share of the productive day.
 */
export function otDays(s: Settings, target: number, otMin: number) {
  const prod = s.work.prod > 0 ? s.work.prod : s.work.shift;
  if (!(otMin > 0) || !(prod > 0)) return 0;
  const f = otMin / 60 / prod;
  return target > 0 ? Math.floor(f * target + 1e-9) / target : f;
}

/**
 * Overtime minutes that raise a day's target: the overtime reported at End work (unless
 * declined), or before then, the time past the shift while still working on tasks.
 */
export function otMinFor(d: WorkloadData, p: Person, now: number) {
  const e = endedToday(d, p.id, now);
  if (e) return e.otStatus === "declined" ? 0 : e.otMin;
  const past = otAvailMin(d, p, now);
  const working = d.tasks.some((t) => t.assignee === p.id && (t.status === "in_progress" || (t.doneAt !== null && t.doneAt > now - past * M)));
  return past && working ? past : 0;
}

/**
 * A starting breakdown for End work: the overtime shared by the time the member worked
 * on tasks after their shift ended today, per process and task type (whole minutes that
 * add up); otherwise all on their first process.
 */
export function suggestOtSplit(d: WorkloadData, me: Person, otMin: number, now: number): OtPart[] {
  const opts = otProcesses(d, me, otMin, now);
  if (!otMin || !opts.length) return [];
  const since = now - otMin * M;
  const w = new Map<string, { trade: string; ttype: string; ms: number }>();
  for (const t of d.tasks) {
    if (t.assignee !== me.id || !t.startedAt || !t.trade) continue;
    const ms = Math.min(t.doneAt ?? now, now) - Math.max(t.startedAt, since);
    if (ms <= 0) continue;
    const tt = t.ttype && typesFor(d.settings, t.trade).some((x) => x.id === t.ttype) ? t.ttype : "";
    const k = t.trade + "|" + tt;
    const x = w.get(k) ?? { trade: t.trade, ttype: tt, ms: 0 };
    x.ms += ms;
    w.set(k, x);
  }
  const rows = [...w.values()].filter((x) => opts.some((o) => o.id === x.trade)).sort((a, b) => b.ms - a.ms);
  if (!rows.length) return [{ trade: opts[0].id, min: otMin }];
  const total = rows.reduce((a, x) => a + x.ms, 0);
  const parts = rows.map((x) => ({ trade: x.trade, ...(x.ttype ? { ttype: x.ttype } : {}), min: Math.floor((otMin * x.ms) / total) }));
  parts[0].min += otMin - parts.reduce((a, x) => a + x.min, 0);
  return parts.filter((x) => x.min > 0);
}

/** Take back today's end of work (e.g. pressed by mistake), unless its overtime was already decided. */
export function undoEndWork(d: WorkloadData, pid: number, now: number): Outcome {
  const e = endedToday(d, pid, now);
  if (!e || (e.otStatus && e.otStatus !== "pending")) return { data: d };
  return { data: { ...d, activities: d.activities.filter((a) => a.id !== e.id) }, message: "You’re back at work." };
}

/** Approve or decline reported overtime (admins and leads, not their own). */
export function decideOt(d: WorkloadData, id: string, st: "approved" | "declined", by: number, now: number): Outcome {
  const a = d.activities.find((x) => x.id === id);
  if (!a || a.kind !== "end" || a.otStatus !== "pending" || a.pid === by || !d.approvers.includes(by)) return { data: d };
  const who = personOf(d, a.pid)?.name ?? "the member";
  return {
    data: { ...d, activities: d.activities.map((x) => (x.id === id ? { ...x, otStatus: st, decidedBy: by, decidedAt: now } : x)) },
    message: `${fmtMin(a.otMin)} overtime ${st} for ${who}.`,
  };
}

/** Minutes of each away kind today (ongoing ones up to now), and approved / pending overtime. */
export function dayActivity(d: WorkloadData, pid: number, now: number) {
  const mine = d.activities.filter((a) => a.pid === pid && sameDay(a.start, now));
  const away: Record<string, number> = {};
  let awayMs = 0;
  for (const a of mine) {
    if (a.kind === "end") continue;
    const ms = (a.end ?? now) - a.start;
    away[a.kind] = (away[a.kind] ?? 0) + Math.round(ms / 60000);
    // Idle (paused) time stays in the time available, so it lowers utilization.
    if (a.kind !== IDLE) awayMs += ms;
  }
  const end = mine.find((a) => a.kind === "end");
  return {
    away,
    awayMs,
    otApproved: end?.otStatus === "approved" ? end.otMin : 0,
    otPending: end?.otStatus === "pending" ? end.otMin : 0,
    ended: end ?? null,
  };
}

/**
 * Periods a task was on hold (pending), from its history: each "On hold: reason" entry
 * until the next change (e.g. "Resumed"), or until now while it's still on hold.
 */
export function holdPeriods(t: Task, now: number): { from: number; to: number | null; reason: string }[] {
  const out: { from: number; to: number | null; reason: string }[] = [];
  t.history.forEach((h, i) => {
    if (!h.text.startsWith("On hold")) return;
    const next = t.history.slice(i + 1).find((x) => x.at >= h.at);
    const to = next ? next.at : t.status === "on_hold" ? null : (t.doneAt ?? now);
    out.push({ from: h.at, to, reason: h.text.replace(/^On hold:?\s*/, "") || t.hold });
  });
  return out;
}

// ── complexity ──

/** The team's complexity levels when complexity is switched on, else none. */
export const cxLevels = (s: Settings): CxLevel[] => (s.complexity?.on ? s.complexity.levels.filter((l) => l.name.trim()) : []);
export const cxOn = (s: Settings) => cxLevels(s).length > 0;
/** The number field that holds the ticket's total contracts: the one chosen, else the productivity field when it's a number. */
export function cxField(d: Pick<WorkloadData, "fields" | "settings">) {
  const k = d.settings.complexity?.field;
  if (k === "") return undefined;
  const f = k ? d.fields.find((x) => x.key === k && x.type === "number") : undefined;
  if (f) return f;
  const b = basisField(d);
  return b?.type === "number" ? b : undefined;
}
export const cxTotal = (cx: Record<string, number> | null | undefined) => Object.values(cx ?? {}).reduce((a, n) => a + n, 0);
/** "1 Simple · 2 Complex". */
export const cxText = (s: Settings, cx: Record<string, number> | null | undefined) =>
  cxLevels(s)
    .filter((l) => cx?.[l.id])
    .map((l) => `${cx![l.id]} ${l.name}`)
    .join(" · ") || "—";
/** Whole contracts per known level, or null when there are none. */
export function cleanCx(s: Settings, cx: Record<string, unknown> | null | undefined): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const l of cxLevels(s)) {
    const n = Math.round(Number(cx?.[l.id]) || 0);
    if (n > 0) out[l.id] = Math.min(n, 999);
  }
  return cxTotal(out) > 0 ? out : null;
}

export interface CxCheck {
  /** Expected handling time from the levels' average handling times, ms. */
  expMs: number;
  /** Time actually worked on the ticket, ms. */
  actMs: number;
  /** Productivity of the ticket: expected ÷ worked time, %. */
  pct: number;
  /**
   * "slow": took much longer than the tagging suggests (maybe tagged too simple);
   * "fast": done far quicker than expected (over-productive: check the tagging and details).
   */
  flag: "slow" | "fast" | null;
}

/** The over-productivity threshold in % (0 = off). */
export const fastPct = (s: Settings) => Math.max(0, s.complexity?.fast ?? 200);

/** Compare a done ticket's handling time with what its complexity tagging implies (every tagged level needs an average handling time). */
export function cxCheck(d: WorkloadData, t: Task): CxCheck | null {
  const levels = cxLevels(d.settings);
  if (!levels.length || !t.cx || t.status !== "done" || !t.startedAt || !t.doneAt) return null;
  let exp = 0;
  for (const [id, n] of Object.entries(t.cx)) {
    const l = levels.find((x) => x.id === id);
    if (!l || !((l.aht ?? 0) > 0)) return null;
    exp += n * l.aht! * M;
  }
  if (!exp) return null;
  const act = taskWorkMs(d, t, t.doneAt);
  const tol = Math.max(0, d.settings.complexity?.tol ?? 50) / 100;
  const pct = act > 0 ? Math.round((exp / act) * 100) : 0;
  const fast = fastPct(d.settings);
  return { expMs: exp, actMs: act, pct, flag: act > exp * (1 + tol) ? "slow" : fast > 0 && act > 0 && pct >= fast ? "fast" : null };
}

/** Done tickets whose handling time doesn't match their complexity and that no admin has checked yet. */
export const cxQuestions = (d: WorkloadData) =>
  d.tasks.filter((t) => t.status === "done" && !t.cxReview && cxCheck(d, t)?.flag).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

/**
 * Admin correction of a resolved ticket's details (e.g. one flagged as over-productive):
 * the field values, recorded in the history. The contracts field follows complexity counts.
 */
export function editDone(d: WorkloadData, id: string, vals: Task["fields"], by: number, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.status !== "done") return { data: d };
  const cf = t.cx && cxTotal(t.cx) > 0 ? cxField(d) : undefined;
  const changes: string[] = [];
  const next: Task["fields"] = { ...t.fields };
  for (const f of d.fields) {
    if (!(f.key in vals) || f.key === cf?.key) continue;
    const v = f.type === "number" ? (String(vals[f.key]).trim() === "" ? "" : Number(vals[f.key])) : String(vals[f.key] ?? "").trim();
    if (f.type === "number" && v !== "" && !Number.isFinite(v as number)) return { data: d, message: `${f.label} must be a number.` };
    if (String(t.fields[f.key] ?? "") === String(v)) continue;
    changes.push(`${f.label}: ${t.fields[f.key] ?? "—"} → ${v === "" ? "—" : v}`);
    next[f.key] = v;
  }
  if (!changes.length) return { data: d, message: "Nothing changed." };
  const who = personOf(d, by)?.name ?? "An admin";
  return {
    data: patch(d, id, (x) => ({ ...x, fields: next, history: hist(x, now, `Details corrected by ${who} · ${changes.join("; ")}`) })),
    message: `${id} updated.`,
  };
}

/** Admin check of a ticket's complexity: confirm it, or correct the counts (the productivity field follows). */
export function reviewCx(d: WorkloadData, id: string, by: number, now: number, cx?: Record<string, number> | null, note = ""): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.status !== "done" || !cxOn(d.settings)) return { data: d };
  const next = cx ? cleanCx(d.settings, cx) : null;
  if (cx && !next) return { data: d, message: "Enter at least one contract." };
  const changed = !!next && cxText(d.settings, next) !== cxText(d.settings, t.cx);
  const who = personOf(d, by)?.name ?? "an admin";
  const f = cxField(d);
  const review = { by, at: now, verdict: changed ? ("corrected" as const) : ("ok" as const), ...(note.trim() ? { note: note.trim().slice(0, 300) } : {}), ...(changed && t.cx ? { was: t.cx } : {}) };
  return {
    data: patch(d, id, (x) => ({
      ...x,
      ...(changed ? { cx: next, ...(f?.type === "number" ? { fields: { ...x.fields, [f.key]: cxTotal(next) } } : {}) } : {}),
      cxReview: review,
      history: hist(x, now, changed ? `Complexity corrected by ${who}: ${cxText(d.settings, t.cx)} → ${cxText(d.settings, next)}` : `Complexity confirmed by ${who}`),
    })),
    message: changed ? `${id}: complexity corrected.` : `${id}: complexity confirmed.`,
  };
}

/** Time a task was worked: start to finish (or now), minus time on hold and the member's time away. */
export function taskWorkMs(d: WorkloadData, t: Task, now: number) {
  if (!t.startedAt) return 0;
  const from = t.startedAt;
  const to = t.doneAt ?? now;
  // Excluded time: hold periods plus the assignee's breaks etc., merged so overlaps count once.
  const ex: [number, number][] = holdPeriods(t, now).map((p): [number, number] => [p.from, p.to ?? now]).concat(pausePeriods(t, now));
  for (const a of d.activities) if (a.pid === t.assignee && a.kind !== "end") ex.push([a.start, a.end ?? now]);
  ex.sort((a, b) => a[0] - b[0]);
  let off = 0;
  let cur = -Infinity;
  for (const [s0, e0] of ex) {
    const s1 = Math.max(s0, from, cur);
    const e1 = Math.min(e0, to);
    if (e1 > s1) off += e1 - s1;
    cur = Math.max(cur, Math.min(e0, to));
  }
  return Math.max(0, to - from - off);
}

/** The team's ticket-number field: settings.ticketField, else a field called "ticket" / "Ticket …". */
export function ticketField(d: Pick<WorkloadData, "fields" | "settings">) {
  const k = d.settings.ticketField;
  if (k === "") return undefined; // switched off
  return (k ? d.fields.find((f) => f.key === k) : undefined) ?? d.fields.find((f) => f.key === "ticket" || /ticket/i.test(f.label));
}
export const ticketOf = (d: Pick<WorkloadData, "fields" | "settings">, t: Task) => {
  const f = ticketField(d);
  return f ? String(t.fields[f.key] ?? "").trim() : "";
};

/**
 * Tasks waiting too long (not done, received at least `staleDays` days ago; 0 = off).
 * Admins see the team's; members their own assigned or on-hold tasks.
 */
export function staleTasks(d: WorkloadData, me: number, admin: boolean, now: number) {
  const days = d.settings.staleDays ?? 2;
  if (!days) return [];
  const cut = now - days * 24 * H;
  return sortTasks(
    d.tasks.filter((t) => t.status !== "done" && t.received <= cut && (admin || t.assignee === me)),
    d,
  );
}
