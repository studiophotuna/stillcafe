export type Priority = "high" | "normal" | "low";
export type TaskStatus = "new" | "assigned" | "in_progress" | "on_hold" | "done";
export type TaskSource = "outlook" | "upload";
export type AllocationMode = "fifo" | "self" | "manual" | "rr";
export type OrderRule = "priority" | "received";
export type Availability = "available" | "leave" | "offshift";
export type FieldType = "text" | "number" | "date" | "select";
export type ViewAs = "admin" | "employee";

export interface Trade {
  id: string;
  name: string;
  sys: string;
}

export interface Person {
  id: number;
  name: string;
  /** Trade ids the person is allocated to. The first one sets their default target. */
  trades: string[];
  /** From the Calendar module in the full app. */
  avail: Availability;
  shift: string;
  /** Shift start hour in team-local time (0–23). */
  shiftStart: number;
}

export interface TaskField {
  key: string;
  label: string;
  type: FieldType;
  /** Comma-separated options for `select` fields. */
  options?: string;
  required: boolean;
  /** Number fields only: summed on the dashboard. */
  metric?: boolean;
}

export interface TaskEmail {
  from: string;
  cc: string;
  subject: string;
  body: string;
  attachments: string[];
}

export interface HistoryEntry {
  at: number;
  text: string;
}

export interface Task {
  id: string;
  title: string;
  /** Trade id, or "" when the task still needs a trade. */
  trade: string;
  pr: Priority;
  received: number;
  source: TaskSource;
  status: TaskStatus;
  assignee: number | null;
  startedAt: number | null;
  doneAt: number | null;
  ot: boolean;
  hold: string;
  fields: Record<string, string | number>;
  email: TaskEmail | null;
  history: HistoryEntry[];
}

export interface WorkingTime {
  /** Shift length in hours. */
  shift: number;
  /** First break in minutes. */
  b1: number;
  /** Second break in minutes. */
  b2: number;
  /** Productive hours. */
  prod: number;
}

export interface Settings {
  mode: AllocationMode;
  order: OrderRule;
  skipUnavail: boolean;
  autoFeed: boolean;
  sla: Record<Priority, number>;
  mailbox: string;
  mailTrade: string;
  work: WorkingTime;
  targets: Record<string, number>;
  memberTargets: Record<number, string>;
}

export interface Toast {
  id: string;
  text: string;
}
