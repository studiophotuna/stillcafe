/**
 * Workload rules as pure functions over WorkloadData. The UI store calls
 * these; a server implementation (Supabase RPC / route handlers) must apply
 * the same rules. See ../../../README.md › Workload rules.
 */
import { H, M, dayKey, localHour } from "./clock";
import { CARRIERS, PR, fieldOptions, lc, sysName, trPathOf } from "./constants";
import { SAMPLE_MAIL } from "./seed";
import type { Activity, ActivityKind, Person, Priority, Settings, Task, TaskField, WlOrg } from "./types";

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

export const due = (t: Task, s: Settings) => t.received + (s.sla[t.pr] || 24) * H;
export const isOverdue = (t: Task, s: Settings, now: number) => t.status !== "done" && now > due(t, s);

export function sortTasks(list: Task[], s: Settings): Task[] {
  return list
    .slice()
    .sort((a, b) =>
      s.order === "priority"
        ? PRIORITY_WEIGHT[a.pr] - PRIORITY_WEIGHT[b.pr] || due(a, s) - due(b, s) || a.received - b.received
        : a.received - b.received,
    );
}

export const canWork = (p: Person, s: Settings) => !s.skipUnavail || p.avail === "available";
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
  sortTasks(d.tasks.filter((t) => t.status === "new" && me.trades.includes(t.trade)), d.settings);

/**
 * Tasks the member can help with when their own trades are empty: other trades in
 * their systems first, then the rest of the team. Tasks still needing a trade are left
 * for an admin.
 */
export function helpQueue(d: WorkloadData, me: Person): { t: Task; sameSystem: boolean }[] {
  const tradeSys = (id: string) => d.org.trades.find((x) => x.id === id)?.sys ?? "";
  const mySys = new Set(me.trades.map(tradeSys).filter(Boolean));
  const sorted = sortTasks(d.tasks.filter((t) => t.status === "new" && t.trade && !me.trades.includes(t.trade)), d.settings);
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

/** Whether a member may take this waiting task: their own trade, or helping out when their trades are empty. */
export function canTake(d: WorkloadData, me: Person, t: Task) {
  if (t.status !== "new" || !canWork(me, d.settings)) return false;
  if (me.trades.includes(t.trade)) return true;
  return !!t.trade && me.trades.length > 0 && ownQueue(d, me).length === 0;
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
  const next = sortTasks(d.tasks.filter((t) => t.assignee === pid && t.status === "assigned"), s)[0] ?? (s.mode === "fifo" ? ownQueue(d, me)[0] : undefined);
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
  const note = take ? helping(d, me, t) : "";
  return { data: begin(d, id, me, now, note), message: take ? `Started ${id}${note}.` : undefined };
}

export function holdTask(d: WorkloadData, id: string, reason: string, now: number): Outcome {
  const r = reason.trim();
  if (!r) return { data: d };
  return {
    data: patch(d, id, (x) =>
      x.status === "in_progress" ? { ...x, status: "on_hold", hold: r, history: hist(x, now, "On hold: " + r) } : x,
    ),
    message: "On hold. You can start another task.",
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
export function completeTask(d: WorkloadData, id: string, vals: Task["fields"], pid: number, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.status !== "in_progress" || t.assignee !== pid) return { data: d };
  const miss = missingRequired(d.fields, vals);
  if (miss.length) return { data: d, message: `Fill in ${miss.join(", ")} before marking ${id} done.` };
  const done = patch(d, id, (x) => ({ ...x, status: "done", doneAt: now, fields: { ...vals }, history: hist(x, now, "Done") }));
  const s = d.settings;
  const feed = s.autoFeed && (s.mode === "fifo" || done.tasks.some((x) => x.assignee === pid && x.status === "assigned"));
  if (feed) {
    const n = startWork(done, pid, now);
    const rest = n.message && !n.ask ? " " + n.message.replace(/^Done\. /, "") : "";
    return { ...n, message: n.message?.startsWith("Started") ? n.message : `${id} done.${rest}` };
  }
  return { data: done, message: `${id} done. Click Start work for the next one.` };
}

/** Round-robin: the available member of the trade with the fewest open (assigned + in progress) tasks. */
export function rrPick(tradeId: string, tasks: Task[], s: Settings, people: Person[]): Person | null {
  const cand = people.filter((p) => p.trades.includes(tradeId) && canWork(p, s));
  if (!cand.length) return null;
  const load = (p: Person) => tasks.filter((t) => t.assignee === p.id && (t.status === "assigned" || t.status === "in_progress")).length;
  return cand.slice().sort((a, b) => load(a) - load(b) || a.name.localeCompare(b.name))[0];
}

function rrAssign(tasks: Task[], ids: string[], s: Settings, people: Person[], now: number): { tasks: Task[]; n: number } {
  let n = 0;
  for (const id of ids) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status !== "new" || !t.trade) continue;
    const p = rrPick(t.trade, tasks, s, people);
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
  if (d.settings.mode === "rr") tasks = rrAssign(tasks, newTasks.map((t) => t.id), d.settings, d.people, now).tasks;
  return { data: { ...d, tasks }, message: `${plural(newTasks.length, "task")} added${label}.` };
}

/** "Share out queue now": round-robin every waiting task that has a trade. */
export function distribute(d: WorkloadData, now: number): Outcome {
  const ids = sortTasks(d.tasks.filter((t) => t.status === "new" && t.trade), d.settings).map((t) => t.id);
  const { tasks, n } = rrAssign(d.tasks, ids, d.settings, d.people, now);
  return { data: { ...d, tasks }, message: `${n} tasks shared out.` };
}

// ── admin edits from task details ──

export function setTrade(d: WorkloadData, id: string, tradeId: string, now: number): Outcome {
  if (!d.org.trades.some((t) => t.id === tradeId)) return { data: d, message: "That trade isn’t in this team." };
  let data = patch(d, id, (x) => {
    const requeue = x.status === "new" || x.status === "assigned";
    return {
      ...x,
      trade: tradeId,
      assignee: requeue ? null : x.assignee,
      status: requeue ? "new" : x.status,
      history: hist(x, now, "Trade set to " + trPathOf(d.org, tradeId)),
    };
  });
  if (d.settings.mode === "rr" && tradeId) data = { ...data, tasks: rrAssign(data.tasks, [id], d.settings, d.people, now).tasks };
  return { data };
}

export function setPriority(d: WorkloadData, id: string, pr: Priority, now: number): Outcome {
  return { data: patch(d, id, (x) => ({ ...x, pr, history: hist(x, now, "Priority set to " + PR[pr][0]) })) };
}

/** Assign to a person, or pid = null to return the task to the queue. */
export function assignTask(d: WorkloadData, id: string, pid: number | null, now: number): Outcome {
  if (pid === null)
    return {
      data: patch(d, id, (x) => ({ ...x, assignee: null, status: "new", history: hist(x, now, "Returned to queue") })),
    };
  const p = personOf(d, pid);
  if (!p) return { data: d };
  return {
    data: patch(d, id, (x) => ({
      ...x,
      assignee: p.id,
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
      pr: /urgent/i.test(subject) ? "high" : "normal",
      source: "outlook",
      fields: { carrier: CARRIERS.find((c) => subject.includes(c)) ?? "" },
      email: { from, cc: "rm.team@dsv.com", subject, body, attachments },
      history: [{ at: rec, text: "Received from Outlook" + (tr ? "" : " · waiting for an admin to set the trade") }],
    };
  });
  return addTasks({ ...d, seq, mailCount: k + 2 }, nt, " from " + d.settings.mailbox, now);
}

export type UploadRow = Record<string, unknown>;

export interface CheckedRow {
  n: number;
  summary: string;
  ok: boolean;
  msg: string;
  task: { title: string; trade: string; pr: Priority; fields: Task["fields"] } | null;
}

/** Validate uploaded rows against the team's task fields. Row numbers match the spreadsheet (header = row 1). */
export function checkRows(rows: UploadRow[], fields: TaskField[], org: WlOrg): CheckedRow[] {
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
            : "";
    if (!err)
      for (const f of fields) {
        let raw = g(r, f.label);
        if (raw instanceof Date) raw = raw.toISOString().slice(0, 10);
        const v = String(raw ?? "").trim();
        // Required fields may be blank in an upload; they're needed before the task is marked done.
        if (v && f.type === "number" && isNaN(Number(v))) { err = `${f.label} must be a number`; break; }
        if (v && f.type === "select" && !fieldOptions(f).map(lc).includes(lc(v))) { err = `${f.label} “${v}” isn’t in the list`; break; }
        out[f.key] = v;
      }
    return {
      n: i + 2,
      summary: title + (tr ? ` · ${tr.sys ? sysName(org, tr.sys) + " › " : ""}${tr.name}` : ""),
      ok: !err,
      msg: err || "Ready",
      task: err ? null : { title, trade: tr!.id, pr: prV as Priority, fields: out },
    };
  });
}

export function importRows(d: WorkloadData, checked: CheckedRow[], now: number): Outcome {
  let seq = d.seq;
  const nt: Task[] = checked
    .filter((c) => c.ok && c.task)
    .map((c) => ({
      ...blankTask("T-" + seq++, now),
      ...c.task!,
      source: "upload",
      email: null,
      history: [{ at: now, text: "Imported from upload" }],
    }));
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

export interface PersonMetrics {
  /** Output today in the team's productivity basis (tasks, or the chosen field). */
  out: number;
  /** Approved overtime minutes today (reported at end of work). */
  otMin: number;
  /** Overtime reported today and still waiting for approval. */
  otPending: number;
  /** Minutes away today by kind (break, lunch, meeting, ad hoc, training). */
  away: Record<string, number>;
  done: number;
  target: number;
  /** Target so far (target × elapsed fraction). */
  tgt: number;
  /** Productive time so far, ms. */
  avail: number;
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
  const onTime = done.filter((t) => t.doneAt! <= due(t, s)).length;
  const out = output(d, done);
  return {
    out,
    otMin: act.otApproved,
    otPending: act.otPending,
    away: act.away,
    done: done.length,
    target,
    tgt,
    avail,
    handle,
    onTime,
    prod: tgt ? Math.round((out / tgt) * 100) : null,
    util: avail ? Math.round((handle / avail) * 100) : null,
    time: done.length ? Math.round((onTime / done.length) * 100) : null,
  };
}

export const doneToday = (tasks: Task[], now: number) => {
  const today = dayKey(now);
  return tasks.filter((t) => t.status === "done" && t.doneAt !== null && dayKey(t.doneAt) === today);
};

// ── status: breaks, meetings, end of day, overtime ──

export const AWAY: [Exclude<ActivityKind, "end">, string][] = [
  ["break", "Break"],
  ["lunch", "Lunch"],
  ["meeting", "Meeting"],
  ["adhoc", "Ad hoc"],
  ["training", "Training"],
];
export const awayLabel = (k: ActivityKind) => AWAY.find(([x]) => x === k)?.[1] ?? "End of day";

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
  if (kind === "end" || !AWAY.some(([k]) => k === kind) || !personOf(d, pid)) return { data: d };
  if (endedToday(d, pid, now)) return { data: d, message: "You’ve ended work for today." };
  const cur = currentAway(d, pid);
  if (cur?.kind === kind) return { data: d };
  return { data: { ...d, activities: closeAway(d.activities, pid, now).concat(newActivity(pid, kind, now)) }, message: `${awayLabel(kind)} started.` };
}

export function backToWork(d: WorkloadData, pid: number, now: number): Outcome {
  const cur = currentAway(d, pid);
  if (!cur) return { data: d };
  return { data: { ...d, activities: closeAway(d.activities, pid, now) }, message: `Back to work after ${fmtMin(Math.round((now - cur.start) / 60000))} ${awayLabel(cur.kind).toLowerCase()}.` };
}

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
export function endWork(d: WorkloadData, pid: number, otMin: number, now: number): Outcome {
  const me = personOf(d, pid);
  if (!me || endedToday(d, pid, now)) return { data: d };
  if (isBusy(d.tasks, pid)) return { data: d, message: "Finish your task or put it on hold before you end work." };
  const ot = Math.max(0, Math.min(Math.round(Number(otMin) || 0), pastShiftMin(me, d.settings, now)));
  const end = newActivity(pid, "end", now, { otMin: ot, otStatus: ot ? "pending" : null });
  return {
    data: { ...d, activities: closeAway(d.activities, pid, now).concat(end) },
    message: ot ? `Work ended. ${fmtMin(ot)} overtime sent for approval.` : "Work ended. See you next shift.",
  };
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
    awayMs += ms;
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

/** Time a task was worked, minus the member's time away while it was open. */
function taskWorkMs(d: WorkloadData, t: Task, now: number) {
  if (!t.startedAt) return 0;
  const to = t.doneAt ?? now;
  let ms = to - t.startedAt;
  for (const a of d.activities) {
    if (a.pid !== t.assignee || a.kind === "end") continue;
    const ov = Math.min(to, a.end ?? now) - Math.max(t.startedAt, a.start);
    if (ov > 0) ms -= ov;
  }
  return Math.max(0, ms);
}
