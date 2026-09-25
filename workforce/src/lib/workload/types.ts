export type Priority = "high" | "normal" | "low";
export type TaskStatus = "new" | "assigned" | "in_progress" | "on_hold" | "done";
export type TaskSource = "outlook" | "upload";
export type AllocationMode = "fifo" | "self" | "manual" | "rr";
export type OrderRule = "priority" | "received";
export type Availability = "available" | "leave" | "offshift";
export type FieldType = "text" | "number" | "date" | "select";
export type ViewAs = "admin" | "employee";

/**
 * A unit tasks are routed to: a trade, or a system / team that has no trades
 * below it. `sys` is the system id above it ("" when there is none).
 */
export interface Trade {
  id: string;
  name: string;
  sys: string;
}

/** The team's structure, from the Calendar organization. */
export interface WlOrg {
  team: { id: string; name: string };
  /** Systems in the team (filter bar). */
  systems: { id: string; name: string }[];
  /** Where tasks can go (see Trade). */
  trades: Trade[];
  /** Teams this person can open in Workload. */
  teams: { id: string; name: string; tower: string }[];
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
  /** Overtime minutes worked on this task (asked when it's finished after the shift ended). */
  otMin?: number;
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
  /**
   * What productivity counts: "tasks" (completed tasks) or a task field key —
   * a number field is summed, any other field counts distinct values (e.g. tickets).
   */
  prodBasis?: string;
  /** Members (not only admins) allowed to upload tasks. */
  uploaders?: number[];
}

export interface Toast {
  id: string;
  text: string;
}
