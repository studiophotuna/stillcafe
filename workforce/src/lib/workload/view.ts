/** View models shared by task tables and the task detail screens. */
import { H, dur, fmtS, fmtT } from "./clock";
import { AV, PEOPLE, PR, ST, person, trPath } from "./constants";
import type { Action } from "./actions";
import { canWork, due, isBusy, type WorkloadData } from "./engine";
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
}

export function taskRow(d: WorkloadData, t: Task, me: number, isAdmin: boolean, now: number): TaskRowVM {
  const s = d.settings;
  const dueAt = due(t, s);
  const od = t.status !== "done" && now > dueAt;
  const soon = !od && t.status !== "done" && dueAt - now < 2 * H;
  const meP = person(me)!;
  const busy = isBusy(d.tasks, me);
  let action: RowAction | null = null;
  if (t.status === "new" && s.mode === "self" && meP.trades.includes(t.trade))
    action = { kind: "take", id: t.id, label: "Take", disabled: busy || !canWork(meP, s) };
  else if (t.assignee === me && t.status === "assigned") action = { kind: "start", id: t.id, label: "Start", disabled: busy };
  else if (t.assignee === me && t.status === "on_hold") action = { kind: "resume", id: t.id, label: "Resume", disabled: busy };
  else if (isAdmin && t.status !== "done") action = { kind: "details", id: t.id, label: "Details", disabled: false };
  const p = t.assignee !== null ? person(t.assignee) : null;
  return {
    id: t.id,
    title: t.title,
    path: trPath(t.trade),
    priority: PR[t.pr][0],
    prCls: PR[t.pr][1],
    status: ST[t.status][0] + (t.status === "new" && !t.trade ? " · needs trade" : ""),
    stCls: ST[t.status][1],
    sourceLabel: t.source === "outlook" ? "Outlook" : "Upload",
    receivedShort: fmtS(t.received, now),
    age: t.status === "done" ? "—" : dur(now - t.received),
    dueShort: t.status === "done" ? "Done " + fmtS(t.doneAt!, now) : od ? "Overdue " + dur(now - dueAt) : fmtS(dueAt, now),
    dueColor: od ? "var(--color-accent-800)" : soon ? "var(--color-accent-700)" : "var(--color-neutral-800)",
    dueBold: od,
    assignee: p ? p.name : "—",
    action,
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
  const fieldRows = [{ label: "System › Trade", value: trPath(t.trade) }]
    .concat(d.fields.map((f) => ({ label: f.label, value: (t.fields[f.key] ?? "") === "" ? "—" : String(t.fields[f.key]) })))
    .concat(t.hold ? [{ label: "On hold because", value: t.hold }] : []);
  return {
    path: trPath(t.trade),
    priority: PR[t.pr][0],
    prCls: PR[t.pr][1],
    status: ST[t.status][0],
    stCls: ST[t.status][1],
    sourceLabel: t.source === "outlook" ? "Outlook" : "Upload",
    dueText:
      t.status === "done"
        ? "Done " + fmtT(t.doneAt!) + (t.startedAt ? " · took " + dur(t.doneAt! - t.startedAt) : "")
        : od
          ? "Overdue by " + dur(now - dueAt)
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
  return PEOPLE.filter((p) => p.trades.includes(t.trade)).map((p) => ({
    id: String(p.id),
    name:
      p.name +
      (p.avail !== "available" ? ` (${AV[p.avail][0].toLowerCase()})` : isBusy(d.tasks, p.id) ? " (busy)" : ""),
  }));
}
