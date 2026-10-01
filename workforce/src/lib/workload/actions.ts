/**
 * Serializable Workload actions. The client applies them optimistically and
 * posts them to /api/wl/action, where the server applies the same rules to the
 * stored data, so the database never takes the client's word for the result.
 */
import {
  assignTask,
  backToWork,
  decideOt,
  endWork,
  startAway,
  undoEndWork,
  checkMail,
  checkRows,
  completeTask,
  reviewCx,
  distribute,
  holdTask,
  setDelay,
  importRows,
  resumeTask,
  setPriority,
  setTaskType,
  setReceived,
  setTrade,
  startTask,
  startWork,
  type Outcome,
  type UploadRow,
  type WorkloadData,
} from "./engine";
import type { ActivityKind, OtPart, Priority, Settings, Task, TaskField } from "./types";

export type Action =
  | { type: "startWork"; pid: number; assist?: boolean }
  | { type: "startTask"; id: string; pid: number }
  | { type: "hold"; id: string; reason: string }
  | { type: "setDelay"; id: string; delay: string }
  | { type: "resume"; id: string; pid: number }
  | { type: "complete"; id: string; vals: Task["fields"]; pid: number; cx?: Record<string, number> | null; delay?: string | null }
  | { type: "reviewCx"; id: string; cx?: Record<string, number> | null; note?: string; by: number }
  | { type: "away"; kind: ActivityKind; pid: number }
  | { type: "back"; pid: number }
  | { type: "endWork"; otMin: number; pid: number; split?: OtPart[] | null }
  | { type: "undoEnd"; pid: number }
  | { type: "decideOt"; id: string; st: "approved" | "declined"; by: number }
  | { type: "distribute" }
  | { type: "setTrade"; id: string; trade: string }
  | { type: "setPriority"; id: string; pr: Priority }
  | { type: "setTaskType"; id: string; ttype: string }
  | { type: "setReceived"; id: string; received: number }
  | { type: "assign"; id: string; pid: number | null }
  | { type: "checkMail" }
  | { type: "importRows"; rows: UploadRow[] }
  | { type: "setSettings"; patch: Partial<Settings> }
  | { type: "setFields"; fields: TaskField[] };

const SETTING_KEYS: (keyof Settings)[] = [
  "mode", "order", "skipUnavail", "autoFeed", "sla", "mailbox", "mailTrade", "work", "targets", "memberTargets", "prodBasis", "uploaders", "staleDays", "ticketField", "slaWeekends", "slaHolidays", "taskTypes", "complexity",
];

export function applyAction(d: WorkloadData, a: Action, now: number): Outcome {
  switch (a.type) {
    case "startWork": return startWork(d, a.pid, now, !!a.assist);
    case "startTask": return startTask(d, a.id, a.pid, now);
    case "hold": return holdTask(d, a.id, a.reason, now);
    case "setDelay": return setDelay(d, a.id, a.delay, now);
    case "resume": return resumeTask(d, a.id, a.pid, now);
    case "complete": return completeTask(d, a.id, a.vals, a.pid, now, a.cx, a.delay);
    case "reviewCx": return reviewCx(d, a.id, a.by, now, a.cx, a.note);
    case "away": return startAway(d, a.pid, a.kind, now);
    case "back": return backToWork(d, a.pid, now);
    case "endWork": return endWork(d, a.pid, a.otMin, now, a.split);
    case "undoEnd": return undoEndWork(d, a.pid, now);
    case "decideOt": return decideOt(d, a.id, a.st, a.by, now);
    case "distribute": return distribute(d, now);
    case "setTrade": return setTrade(d, a.id, a.trade, now);
    case "setPriority": return setPriority(d, a.id, a.pr, now);
    case "setTaskType": return setTaskType(d, a.id, a.ttype, now);
    case "setReceived": return setReceived(d, a.id, a.received, now);
    case "assign": return assignTask(d, a.id, a.pid, now);
    case "checkMail": return checkMail(d, now);
    // Rows are re-validated against the stored task fields, not trusted from the client.
    case "importRows": return importRows(d, checkRows(a.rows, d.fields, d.org, now, d.settings.taskTypes), now);
    case "setSettings": {
      const patch = Object.fromEntries(Object.entries(a.patch).filter(([k]) => SETTING_KEYS.includes(k as keyof Settings)));
      return { data: { ...d, settings: { ...d.settings, ...patch } } };
    }
    case "setFields": return { data: { ...d, fields: a.fields } };
  }
}
