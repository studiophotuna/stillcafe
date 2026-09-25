/** View models shared by task tables and the task detail screens. */
import { H, dur, fmtS, fmtT } from "./clock";
import { AV, PR, ST, trPathOf } from "./constants";
import type { Action } from "./actions";
import { canTake, due, holdPeriods, isBusy, overdueMs, personOf, taskWorkMs, ticketOf, type WorkloadData } from "./engine";
import type { Task } from "./types";

export interface RowAction {
  kind: "take" | "start" | "resume" | "details";
  id: string;
  label: string;
  disabled: boolean;
}

export interface TaskRowVM {
  id: string;
  title: string;
  path: string;
  priority: string;
  prCls: string;
  status: string;
  stCls: string;
  sourceLabel: string;
  receivedShort: string;
  age: string;
  dueShort: string;
  dueColor: string;
  dueBold: boolean;
  assignee: string;
  action: RowAction | null;
  /** Ticket number (the team's ticket field), or "". */
  ticket: string;
  /** Row highlight: overdue, due within 2 hours, or none. */
  dueState: "overdue" | "soon" | "";
  started: string;
  finished: string;
  /** Time worked on the task (time away excluded). */
  worked: string;
  /** Done within the SLA. */
  onTime: boolean;
  /** Total time on hold, "" if never. */
  held: string;
}

export function taskRow(d: WorkloadData, t: Task, me: number, isAdmin: boolean, now: number): TaskRowVM {
  const s = d.settings;
  const dueAt = due(t, s);
  const od = t.status !== "done" && now > dueAt;
  const soon = !od && t.status !== "done" && dueAt - now < 2 * H;
  const meP = personOf(d, me) ?? { id: me, name: "", trades: [], avail: "available" as const, shift: "", shiftStart: 8 };
  const busy = isBusy(d.tasks, me);
  let action: RowAction | null = null;
  if (t.status === "new" && s.mode === "self" && canTake(d, meP, t))
    action = { kind: "take", id: t.id, label: meP.trades.includes(t.trade) ? "Take" : "Help", disabled: busy };
  else if (t.assignee === me && t.status === "assigned") action = { kind: "start", id: t.id, label: "Start", disabled: busy };
  else if (t.assignee === me && t.status === "on_hold") action = { kind: "resume", id: t.id, label: "Resume", disabled: busy };
  else if (isAdmin && t.status !== "done") action = { kind: "details", id: t.id, label: "Details", disabled: false };
  const p = personOf(d, t.assignee);
  return {
    id: t.id,
    title: t.title,
    path: trPathOf(d.org, t.trade),
    priority: PR[t.pr][0],
    prCls: PR[t.pr][1],
    status: ST[t.status][0] + (t.status === "new" && !t.trade ? " · needs trade" : ""),
    stCls: ST[t.status][1],
    sourceLabel: t.source === "outlook" ? "Outlook" : "Upload",
    receivedShort: fmtS(t.received, now),
    age: t.status === "done" ? "—" : dur(now - t.received),
    dueShort: t.status === "done" ? "Done " + fmtS(t.doneAt!, now) : od ? "Overdue " + dur(overdueMs(t, s, now)) : fmtS(dueAt, now),
    dueColor: od ? "var(--color-accent-800)" : soon ? "var(--color-accent-700)" : "var(--color-neutral-800)",
    dueBold: od,
    assignee: p ? p.name : "—",
    action,
    ticket: ticketOf(d, t),
    dueState: od ? "overdue" : soon ? "soon" : "",
    started: t.startedAt ? fmtS(t.startedAt, now) : "—",
    finished: t.doneAt ? fmtS(t.doneAt, now) : "—",
    worked: t.startedAt ? dur(taskWorkMs(d, t, now)) : "—",
    onTime: !!t.doneAt && t.doneAt <= dueAt,
    held: (() => {
      const ps = holdPeriods(t, now);
      return ps.length ? dur(ps.reduce((a, p) => a + ((p.to ?? now) - p.from), 0)) : "";
    })(),
  };
}

/** The action for a row button (details is handled by the caller). */
export function rowAction(a: RowAction, me: number): Action {
  return a.kind === "resume" ? { type: "resume", id: a.id, pid: me } : { type: "startTask", id: a.id, pid: me };
}

export function taskDetail(d: WorkloadData, t: Task, now: number) {
  const s = d.settings;
  const dueAt = due(t, s);
  const od = t.status !== "done" && now > dueAt;
  // Start / finish / worked, e.g. when an admin asks for the times per task.
  const timeRows = t.startedAt
    ? [
        { label: "Started", value: fmtT(t.startedAt) },
        { label: "Finished", value: t.doneAt ? fmtT(t.doneAt) : "In progress" },
        { label: "Time worked", value: dur(taskWorkMs(d, t, now)) + " (time away excluded)" },
      ]
    : [];
  const fieldRows = [{ label: "System › Trade", value: trPathOf(d.org, t.trade) }]
    .concat(timeRows)
    .concat(d.fields.map((f) => ({ label: f.label, value: (t.fields[f.key] ?? "") === "" ? "—" : String(t.fields[f.key]) })))
    // Every pending (on hold) period with its date and reason.
    .concat(
      holdPeriods(t, now).map((p, i, all) => ({
        label: all.length > 1 ? `On hold (${i + 1})` : "On hold",
        value: `${fmtT(p.from)} → ${p.to ? fmtT(p.to) : "still on hold"} · ${dur((p.to ?? now) - p.from)} · ${p.reason || "no reason given"}`,
      })),
    );
  return {
    path: trPathOf(d.org, t.trade),
    priority: PR[t.pr][0],
    prCls: PR[t.pr][1],
    status: ST[t.status][0],
    stCls: ST[t.status][1],
    sourceLabel: t.source === "outlook" ? "Outlook" : "Upload",
    dueText:
      t.status === "done"
        ? "Done " + fmtT(t.doneAt!) + (t.startedAt ? " · took " + dur(t.doneAt! - t.startedAt) : "")
        : od
          ? "Overdue by " + dur(overdueMs(t, s, now))
          : "Due " + fmtT(dueAt),
    dueColor: od ? "var(--color-accent-800)" : "var(--color-neutral-800)",
    receivedText: fmtT(t.received),
    startedAgo: t.startedAt ? dur(now - t.startedAt) : "",
    fieldRows,
    history: t.history
      .slice()
      .reverse()
      .map((h) => ({ at: fmtS(h.at, now), text: h.text })),
  };
}

export function assignOptions(d: WorkloadData, t: Task) {
  return d.people.filter((p) => p.trades.includes(t.trade)).map((p) => ({
    id: String(p.id),
    name:
      p.name +
      (p.avail !== "available" ? ` (${AV[p.avail][0].toLowerCase()})` : isBusy(d.tasks, p.id) ? " (busy)" : ""),
  }));
}
