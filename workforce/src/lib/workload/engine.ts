/**
 * Workload rules as pure functions over WorkloadData. The UI store calls
 * these; a server implementation (Supabase RPC / route handlers) must apply
 * the same rules. See ../../../README.md › Workload rules.
 */
import { H, dayKey, localHour } from "./clock";
import { CARRIERS, PEOPLE, PR, SYS, TRADES, fieldOptions, lc, person, trPath } from "./constants";
import { SAMPLE_MAIL } from "./seed";
import type { Person, Priority, Settings, Task, TaskField } from "./types";

export interface WorkloadData {
  tasks: Task[];
  fields: TaskField[];
  settings: Settings;
  /** Next task number for new tasks (T-2000, T-2001, …). */
  seq: number;
  /** Demo only: rotates the sample emails. */
  mailCount: number;
}

/** Result of an action: the new data plus an optional message for a toast. */
export interface Outcome {
  data: WorkloadData;
  message?: string;
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

function begin(d: WorkloadData, id: string, p: Person, now: number): WorkloadData {
  return patch(d, id, (x) => ({
    ...x,
    status: "in_progress",
    assignee: p.id,
    startedAt: now,
    history: hist(x, now, "Started by " + p.name),
  }));
}

/**
 * "Start work": the member's next assigned task, or in FIFO mode the next
 * unassigned task in their own trades. One task in progress at a time.
 */
export function startWork(d: WorkloadData, pid: number, now: number): Outcome {
  const me = person(pid);
  if (!me || isBusy(d.tasks, pid)) return { data: d };
  if (!canWork(me, d.settings)) return { data: d, message: "You’re marked unavailable, so tasks aren’t given to you." };
  const s = d.settings;
  const next =
    sortTasks(d.tasks.filter((t) => t.assignee === pid && t.status === "assigned"), s)[0] ??
    (s.mode === "fifo" ? sortTasks(d.tasks.filter((t) => t.status === "new" && me.trades.includes(t.trade)), s)[0] : undefined);
  if (!next) return { data: d, message: "Done. No more tasks waiting in your trades right now." };
  return { data: begin(d, next.id, me, now), message: `Started ${next.id}.` };
}

/** Start a specific task: take one from the queue ("Members pick") or start one assigned to you. */
export function startTask(d: WorkloadData, id: string, pid: number, now: number): Outcome {
  const me = person(pid);
  const t = d.tasks.find((x) => x.id === id);
  if (!me || !t || isBusy(d.tasks, pid)) return { data: d };
  const take = t.status === "new" && d.settings.mode === "self" && me.trades.includes(t.trade) && canWork(me, d.settings);
  const mine = t.status === "assigned" && t.assignee === pid;
  if (!take && !mine) return { data: d };
  return { data: begin(d, id, me, now), message: take ? `Started ${id}.` : undefined };
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
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.assignee !== pid || t.status !== "on_hold" || isBusy(d.tasks, pid)) return { data: d };
  return { data: patch(d, id, (x) => ({ ...x, status: "in_progress", history: hist(x, now, "Resumed") })) };
}

export const missingRequired = (fields: TaskField[], vals: Task["fields"]) =>
  fields.filter((f) => f.required && String(vals[f.key] ?? "").trim() === "").map((f) => f.label);

/** Mark done (required fields must be filled), then auto-feed the next task if the team uses it. */
export function completeTask(d: WorkloadData, id: string, vals: Task["fields"], ot: boolean, pid: number, now: number): Outcome {
  const t = d.tasks.find((x) => x.id === id);
  if (!t || t.status !== "in_progress" || missingRequired(d.fields, vals).length) return { data: d };
  const done = patch(d, id, (x) => ({
    ...x,
    status: "done",
    doneAt: now,
    ot,
    fields: { ...vals },
    history: hist(x, now, "Done" + (ot ? " (overtime)" : "")),
  }));
  const s = d.settings;
  const feed = s.autoFeed && (s.mode === "fifo" || done.tasks.some((x) => x.assignee === pid && x.status === "assigned"));
  if (feed) return startWork(done, pid, now);
  return { data: done, message: `${id} done. Click Start work for the next one.` };
}

/** Round-robin: the available member of the trade with the fewest open (assigned + in progress) tasks. */
export function rrPick(tradeId: string, tasks: Task[], s: Settings): Person | null {
  const cand = PEOPLE.filter((p) => p.trades.includes(tradeId) && canWork(p, s));
  if (!cand.length) return null;
  const load = (p: Person) => tasks.filter((t) => t.assignee === p.id && (t.status === "assigned" || t.status === "in_progress")).length;
  return cand.slice().sort((a, b) => load(a) - load(b) || a.name.localeCompare(b.name))[0];
}

function rrAssign(tasks: Task[], ids: string[], s: Settings, now: number): { tasks: Task[]; n: number } {
  let n = 0;
  for (const id of ids) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status !== "new" || !t.trade) continue;
    const p = rrPick(t.trade, tasks, s);
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
  if (d.settings.mode === "rr") tasks = rrAssign(tasks, newTasks.map((t) => t.id), d.settings, now).tasks;
  return { data: { ...d, tasks }, message: `${plural(newTasks.length, "task")} added${label}.` };
}

/** "Share out queue now": round-robin every waiting task that has a trade. */
export function distribute(d: WorkloadData, now: number): Outcome {
  const ids = sortTasks(d.tasks.filter((t) => t.status === "new" && t.trade), d.settings).map((t) => t.id);
  const { tasks, n } = rrAssign(d.tasks, ids, d.settings, now);
  return { data: { ...d, tasks }, message: `${n} tasks shared out.` };
}

// ── admin edits from task details ──

export function setTrade(d: WorkloadData, id: string, tradeId: string, now: number): Outcome {
  let data = patch(d, id, (x) => {
    const requeue = x.status === "new" || x.status === "assigned";
    return {
      ...x,
      trade: tradeId,
      assignee: requeue ? null : x.assignee,
      status: requeue ? "new" : x.status,
      history: hist(x, now, "Trade set to " + trPath(tradeId)),
    };
  });
  if (d.settings.mode === "rr" && tradeId) data = { ...data, tasks: rrAssign(data.tasks, [id], d.settings, now).tasks };
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
  const p = person(pid);
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
export function checkRows(rows: UploadRow[], fields: TaskField[]): CheckedRow[] {
  const g = (r: UploadRow, l: string) => {
    const k = Object.keys(r).find((x) => lc(x) === lc(l));
    return k ? r[k] : "";
  };
  return rows.map((r, i) => {
    const title = String(g(r, "Title") ?? "").trim();
    const sysV = lc(g(r, "System"));
    const trV = lc(g(r, "Trade"));
    const sys = Object.keys(SYS).find((k) => lc(SYS[k]) === sysV);
    const tr = TRADES.find((t) => lc(t.name) === trV);
    const prV = lc(g(r, "Priority")) || "normal";
    const out: Task["fields"] = {};
    let err = !title
      ? "Title is missing"
      : !sys
        ? "System not found"
        : !tr
          ? "Trade not found"
          : tr.sys !== sys
            ? `${tr.name} isn’t under ${SYS[sys]}`
            : !(prV in PR)
              ? "Priority must be High, Normal or Low"
              : "";
    if (!err)
      for (const f of fields) {
        let raw = g(r, f.label);
        if (raw instanceof Date) raw = raw.toISOString().slice(0, 10);
        const v = String(raw ?? "").trim();
        if (f.required && !v) { err = `${f.label} is required`; break; }
        if (v && f.type === "number" && isNaN(Number(v))) { err = `${f.label} must be a number`; break; }
        if (v && f.type === "select" && !fieldOptions(f).map(lc).includes(lc(v))) { err = `${f.label} “${v}” isn’t in the list`; break; }
        out[f.key] = v;
      }
    return {
      n: i + 2,
      summary: title + (tr ? ` · ${SYS[tr.sys]} › ${tr.name}` : ""),
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

export interface PersonMetrics {
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
  const fr = elapsedFrac(p, s, now);
  const avail = s.work.prod * H * fr;
  const mine = d.tasks.filter((t) => t.assignee === p.id);
  const done = mine.filter((t) => t.status === "done" && t.doneAt !== null && dayKey(t.doneAt) === today);
  const handle =
    done.reduce((a, t) => a + (t.doneAt! - (t.startedAt ?? t.doneAt!)), 0) +
    mine.filter((t) => t.status === "in_progress" && t.startedAt).reduce((a, t) => a + (now - t.startedAt!), 0);
  const target = targetOf(p, s);
  const tgt = target * fr;
  const onTime = done.filter((t) => t.doneAt! <= due(t, s)).length;
  return {
    done: done.length,
    target,
    tgt,
    avail,
    handle,
    onTime,
    prod: tgt ? Math.round((done.length / tgt) * 100) : null,
    util: avail ? Math.round((handle / avail) * 100) : null,
    time: done.length ? Math.round((onTime / done.length) * 100) : null,
  };
}

export const doneToday = (tasks: Task[], now: number) => {
  const today = dayKey(now);
  return tasks.filter((t) => t.status === "done" && t.doneAt !== null && dayKey(t.doneAt) === today);
};
