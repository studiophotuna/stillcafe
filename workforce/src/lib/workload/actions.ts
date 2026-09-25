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
  distribute,
  holdTask,
  importRows,
  resumeTask,
  setPriority,
  setTrade,
  startTask,
  startWork,
  type Outcome,
  type UploadRow,
  type WorkloadData,
} from "./engine";
import type { ActivityKind, Priority, Settings, Task, TaskField } from "./types";

export type Action =
  | { type: "startWork"; pid: number; assist?: boolean }
  | { type: "startTask"; id: string; pid: number }
  | { type: "hold"; id: string; reason: string }
  | { type: "resume"; id: string; pid: number }
  | { type: "complete"; id: string; vals: Task["fields"]; pid: number }
  | { type: "away"; kind: ActivityKind; pid: number }
  | { type: "back"; pid: number }
  | { type: "endWork"; otMin: number; pid: number }
  | { type: "undoEnd"; pid: number }
  | { type: "decideOt"; id: string; st: "approved" | "declined"; by: number }
  | { type: "distribute" }
  | { type: "setTrade"; id: string; trade: string }
  | { type: "setPriority"; id: string; pr: Priority }
  | { type: "assign"; id: string; pid: number | null }
  | { type: "checkMail" }
  | { type: "importRows"; rows: UploadRow[] }
  | { type: "setSettings"; patch: Partial<Settings> }
  | { type: "setFields"; fields: TaskField[] };

const SETTING_KEYS: (keyof Settings)[] = [
  "mode", "order", "skipUnavail", "autoFeed", "sla", "mailbox", "mailTrade", "work", "targets", "memberTargets", "prodBasis", "uploaders", "staleDays", "ticketField", "slaWeekends",
];

export function applyAction(d: WorkloadData, a: Action, now: number): Outcome {
  switch (a.type) {
    case "startWork": return startWork(d, a.pid, now, !!a.assist);
    case "startTask": return startTask(d, a.id, a.pid, now);
    case "hold": return holdTask(d, a.id, a.reason, now);
    case "resume": return resumeTask(d, a.id, a.pid, now);
    case "complete": return completeTask(d, a.id, a.vals, a.pid, now);
    case "away": return startAway(d, a.pid, a.kind, now);
    case "back": return backToWork(d, a.pid, now);
    case "endWork": return endWork(d, a.pid, a.otMin, now);
    case "undoEnd": return undoEndWork(d, a.pid, now);
    case "decideOt": return decideOt(d, a.id, a.st, a.by, now);
    case "distribute": return distribute(d, now);
    case "setTrade": return setTrade(d, a.id, a.trade, now);
    case "setPriority": return setPriority(d, a.id, a.pr, now);
    case "assign": return assignTask(d, a.id, a.pid, now);
    case "checkMail": return checkMail(d, now);
    // Rows are re-validated against the stored task fields, not trusted from the client.
    case "importRows": return importRows(d, checkRows(a.rows, d.fields, d.org), now);
    case "setSettings": {
      const patch = Object.fromEntries(Object.entries(a.patch).filter(([k]) => SETTING_KEYS.includes(k as keyof Settings)));
      return { data: { ...d, settings: { ...d.settings, ...patch } } };
    }
    case "setFields": return { data: { ...d, fields: a.fields } };
  }
}
