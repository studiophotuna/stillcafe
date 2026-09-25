export type NodeType = "dept" | "tower" | "branch" | "system" | "trade";
export type Level = "member" | "lead" | "manager" | "director";
export type ApprovalState = "approved" | "pending" | "declined";
export type Code = "RTO" | "WFH" | "VL" | "SL" | "EL" | "HD" | "BT" | "HOL" | "HDY" | "RD";
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
  carry: number;
  entitle: number;
  elEnt: number;
  /** Weekdays (1 = Mon … 5 = Fri) worked from home by default; overrides `pattern`. */
  wfhDays?: number[];
  /** Full admin rights everywhere (set for the first administrator). */
  sysAdmin?: boolean;
  /** With allocations in several teams: the team they're counted in on the headcount report. */
  primaryTeam?: string;
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
  /** Headcount report: billed FTE overrides, "pid|teamId|yyyy-mm" → value. */
  billing?: Record<string, number>;
  links?: AppLinks;
}
