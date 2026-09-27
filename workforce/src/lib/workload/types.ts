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

/** Time away from tasks, or the end of the working day. */
export type ActivityKind = "break" | "lunch" | "meeting" | "adhoc" | "training" | "end";
export type OtStatus = "pending" | "approved" | "declined";

/**
 * A member's status entry. Away kinds run from start until the member is back
 * (end = null while ongoing). "end" marks the end of the working day and carries the
 * overtime the member reported, which counts only once approved.
 */
export interface Activity {
  id: string;
  pid: number;
  kind: ActivityKind;
  start: number;
  end: number | null;
  otMin: number;
  otStatus: OtStatus | null;
  decidedBy: number | null;
  decidedAt: number | null;
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
  /** Today is a holiday for this person: its name, and where they work if they're on holiday duty. */
  holiday?: { name: string; date: string; working: "RTO" | "WFH" | null; answered: boolean };
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
  /** Task type id (Settings.taskTypes); "" or missing = a standard request. */
  ttype?: string;
  /**
   * SLA hours fixed when the task came in (or its type / priority changed), so later
   * changes to the SLA settings don't move open tasks. Missing on older tasks: current settings apply.
   */
  slaH?: number | null;
}

/** A kind of request with its own SLA (e.g. Doc review 2 h, Booking 4 h). */
export interface TaskType {
  id: string;
  name: string;
  /** SLA in hours from received (weekends and holidays skipped as the team's settings say). */
  sla: number;
  /** Trades it applies to; empty = every trade in the team. */
  trades: string[];
  /** Words in an email subject or upload title that mark a task as this type. */
  keywords: string[];
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
  /** Remind about tasks (and overtime) waiting this many days or more; 0 = off. Default 2. */
  staleDays?: number;
  /** Task field holding the ticket number (Queue column and search). Default: a "ticket" field. */
  ticketField?: string;
  /** true: Saturdays and Sundays count toward the SLA / due time. Default false (skipped). */
  slaWeekends?: boolean;
  /** true: Calendar holidays count toward the SLA / due time. Default false (skipped). */
  slaHolidays?: boolean;
  /** Request types with their own SLA. Tasks without a type use the standard SLA (by priority). */
  taskTypes?: TaskType[];
}

export interface Toast {
  id: string;
  text: string;
}
