export type NodeType = "dept" | "tower" | "branch" | "system" | "trade";
/** Role. "member" is shown as Associate (the key is kept so saved data stays valid). */
export type Level = "member" | "specialist" | "senior" | "lead" | "manager" | "director";
export type ApprovalState = "approved" | "pending" | "declined";
/** RDOT: rest day overtime (a weekend or rest day worked as overtime). */
export type Code = "RTO" | "WFH" | "VL" | "SL" | "EL" | "HD" | "BT" | "HOL" | "HDY" | "RD" | "RDOT" | "ML" | "PL" | "SPL";
export type Bucket = "morning" | "mid" | "gy";
export type HolidayType = "regular" | "special" | "company";
export type BcpStatus = "wfh" | "office" | "aff_ok" | "aff_no" | "leave" | "none";

/** Org node. "branch" is a Team (kept as `branch` to match the handoff data). */
export interface OrgNode {
  id: string;
  type: NodeType;
  name: string;
  parent: string | null;
  // team settings (type === "branch")
  mode?: "auto" | "approval";
  admins?: number[];
  notifyAdmin?: boolean;
  notifyUser?: boolean;
  invite?: boolean;
  defaultScope?: "all" | "me";
  /** Cost centre shown on the headcount report (teams). */
  costCentre?: string;
  /** How admins plan this team's schedules: a week or a month at a time (default week). */
  schedPeriod?: "week" | "month";
}

export interface QuickLink {
  label: string;
  url: string;
}

/** App-wide links set by a system admin. */
export interface AppLinks {
  /** Where members file approved leave (shown after approval). */
  bipoLeave?: string;
  /** Where members file approved overtime. */
  bipoOt?: string;
  /** Shown to everyone in the Quick links bar. */
  quick?: QuickLink[];
  /** Payroll cut-off dates (yyyy-mm-dd), set for the year as they vary month to month. Everyone is reminded from 2 days before. */
  payrollDates?: string[];
  /** Extra line in the payroll reminder. */
  payrollNote?: string;
}

export interface CalPerson {
  id: number;
  name: string;
  email: string;
  level: Level;
  /** Allocations: ids of the deepest org node (team, system or trade). */
  assign: string[];
  /** Weekly pattern: A = WFH Mon/Tue, B = WFH Thu/Fri. */
  pattern: "A" | "B";
  /** Default shift id. */
  shift: string;
  hire: string;
  resign: string | null;
  /** VL+SL used this year before the app (from the Excel migration). */
  ytd: number;
  ytdEl: number;
  /** VL + SL carried over, as set by an admin for `carryYear` (other years are automatic). */
  carry: number;
  /** The year `carry` applies to; older data: the app's first year (LEDGER_START). */
  carryYear?: number;
  /** The year `ytd` / `ytdEl` apply to; older data: LEDGER_START. */
  ytdYear?: number;
  /** VL + SL a full year (pro-rated in the hire year). */
  entitle: number;
  /** VL + SL for the hire year set by an admin (else pro-rated from `entitle`). */
  entitleFirst?: number;
  elEnt: number;
  /** For maternity / paternity leave (Philippine law). */
  sex?: "F" | "M";
  /** Solo parent: solo parent leave, and 15 more days of maternity leave. */
  soloParent?: boolean;
  /** Weekdays (1 = Mon … 5 = Fri) worked from home by default; overrides `pattern`. */
  wfhDays?: number[];
  /** Full admin rights everywhere (set for the first administrator). */
  sysAdmin?: boolean;
  /** With allocations in several teams: the team they're counted in on the headcount report. */
  primaryTeam?: string;
  /**
   * Headcount tagging over time, oldest first: from month `from` (yyyy-mm) the person
   * counts in `team` ("" = no team) until the next entry. Missing: always their current team.
   */
  hcHistory?: HcTag[];
  /** Their approver: the team leader (or manager) their requests are assigned to. */
  approver?: number;
}

export interface HcTag {
  /** First month (yyyy-mm) of this tagging; "0000-00" = from the start. */
  from: string;
  /** Team id, or "" when not counted in any team. */
  team: string;
  /** System › trade shown on the report for this period, when it's no longer their allocation. */
  sub?: string;
}

export interface LeaveRequest {
  id: string;
  pid: number;
  type: Code;
  start: string;
  end: string;
  half: "AM" | "PM" | null;
  reason: string;
  created: string;
  /** Per team id. */
  approvals: Record<string, ApprovalState>;
  /** Per team id: who approved or declined it, and when (missing when approved automatically). */
  decided?: Record<string, { by: number; at: string }>;
}

export interface Shift {
  id: string;
  name: string;
  start: string;
  end: string;
  bucket: Bucket;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
  /** "all" or an org node id. */
  scope: string;
}

export interface Readiness {
  laptop?: boolean;
  internet?: boolean;
  backup?: boolean;
  power?: boolean;
  setup?: boolean;
  updated?: string;
}

export interface BcpEvent {
  id: string;
  name: string;
  /** The active date: check-ins are open on this date only. */
  start: string;
  end: string;
  scope: string;
  status: "active" | "closed";
  note: string;
}

export interface Checkin {
  status: BcpStatus;
  note: string;
  at: string;
}

/** An email or Outlook reminder the app sent (shown under Notifications). */
export interface NotifLog {
  id: string;
  kind: "email" | "invite";
  at: string;
  /** Team the message is about. */
  did: string;
  toIds: number[];
  toLine: string;
  toShort: string;
  subject: string;
  lines: string[];
  cta?: boolean;
  when?: string;
  att?: string[];
}

/**
 * Leave cover: from `from` to `to` (inclusive), `standIn` approves requests and monitors
 * (dashboards, trackers, calendars) for `leader`'s teams. It ends by itself after `to`.
 */
export interface Cover {
  id: string;
  leader: number;
  standIn: number;
  from: string;
  to: string;
  by: number;
  at: string;
}

/** A team's tracker entry for a period: remarks, and figures for teams that don't use Workload. */
export interface KpiEntry {
  /** KPI tracker remarks. */
  remark?: string;
  /** OT tracker remarks (TL / managers). */
  otRemark?: string;
  /** Entered KPIs, % (they replace Workload's figures). */
  util?: number;
  prod?: number;
  time?: number;
  acc?: number;
  /** Entered overtime, hours (replaces Workload's). */
  reg?: number;
  rd?: number;
  hol?: number;
  by?: number;
  at?: string;
}

/** An accuracy issue: what went wrong on a ticket and what's done about it. */
export interface KpiIssue {
  id: string;
  team: string;
  /** When it happened (yyyy-mm-dd); sets the week / month it counts in. */
  date: string;
  ticket?: string;
  desc: string;
  root: string;
  preventive: string;
  corrective: string;
  by: number;
  at: string;
}

export interface CalendarData {
  people: CalPerson[];
  nodes: OrgNode[];
  requests: LeaveRequest[];
  /** "pid|date" → code set by an admin. */
  overrides: Record<string, Code>;
  /** "pid|date" → shift id. */
  roster: Record<string, string>;
  shifts: Shift[];
  holidays: Holiday[];
  bcpReady: Record<number, Readiness>;
  bcpEvents: BcpEvent[];
  /** event id → person id → check-in. */
  checkins: Record<string, Record<number, Checkin>>;
  logs: NotifLog[];
  seq: number;
  /** Leave cover: someone approving and monitoring for a leader while they're away. */
  covers?: Cover[];
  /** OT and KPI trackers: remarks and figures entered by leads, per team and period ("team|2026-W40" or "team|2026-09"). */
  kpi?: Record<string, KpiEntry>;
  /** Accuracy issues logged by leads (each counts as one error against the team's resolved tickets). */
  issues?: KpiIssue[];
  /** Highest person id ever used, so a deleted person's id is never given to someone new. */
  pidSeq?: number;
  /** Headcount report: billed FTE overrides, "pid|teamId|yyyy-mm" → value. */
  billing?: Record<string, number>;
  links?: AppLinks;
}
