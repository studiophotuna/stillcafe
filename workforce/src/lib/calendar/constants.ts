import type { BcpStatus, Bucket, Code, HolidayType, Level, NodeType, Shift } from "./types";

const T = "1px solid transparent";

export interface Chip {
  bg: string;
  fg: string;
  bd: string;
}

export const CODES: Record<Code, Chip & { label: string }> = {
  RTO: { label: "In office (RTO)", bg: "transparent", fg: "var(--color-neutral-800)", bd: "1px solid var(--color-divider)" },
  WFH: { label: "Work from home", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)", bd: "1px solid var(--color-accent-300)" },
  VL: { label: "Vacation leave", bg: "var(--color-accent-700)", fg: "var(--color-bg)", bd: T },
  SL: { label: "Sick leave", bg: "var(--color-accent-800)", fg: "var(--color-bg)", bd: T },
  EL: { label: "Emergency leave", bg: "var(--color-accent-900)", fg: "var(--color-bg)", bd: T },
  HD: { label: "Half-day leave", bg: "var(--color-accent-300)", fg: "var(--color-accent-900)", bd: T },
  BT: { label: "Business trip", bg: "transparent", fg: "var(--color-accent-700)", bd: "1px solid var(--color-accent-700)" },
  HOL: { label: "Holiday", bg: "var(--color-neutral-300)", fg: "var(--color-neutral-800)", bd: T },
  HDY: { label: "Holiday duty", bg: "var(--color-neutral-300)", fg: "var(--color-accent-800)", bd: "1px solid var(--color-accent-700)" },
  RD: { label: "Rest day", bg: "var(--color-neutral-200)", fg: "var(--color-neutral-700)", bd: T },
};
export const CODE_KEYS = Object.keys(CODES) as Code[];
/** Pending approval: dashed outline. */
export const PEND: Chip = { bg: "var(--color-bg)", fg: "var(--color-accent-800)", bd: "1px dashed var(--color-accent-700)" };
export const BSTY: Record<Bucket, Chip> = {
  morning: { bg: "var(--color-accent-100)", fg: "var(--color-accent-800)", bd: "1px solid var(--color-accent-300)" },
  mid: { bg: "var(--color-accent-300)", fg: "var(--color-accent-900)", bd: T },
  gy: { bg: "var(--color-accent-800)", fg: "var(--color-bg)", bd: T },
};
export const BUCKETS: Record<Bucket, string> = { morning: "Morning", mid: "Midshift", gy: "GY" };

export const WORKING: Code[] = ["RTO", "WFH", "HDY"];
/** Out of office (drives Outlook reminders). */
export const OOO: Code[] = ["VL", "SL", "EL", "HD", "BT"];
/** Uses a leave balance. */
export const ANNUAL: Code[] = ["VL", "SL", "EL", "HD"];
/** Shares the VL + SL pool. */
export const POOL: Code[] = ["VL", "SL", "HD"];
export const REQ_TYPES: Code[] = ["VL", "SL", "EL", "HD", "BT", "WFH", "RTO"];

export const LEVELS: Record<Level, string> = { member: "Member", lead: "Team lead", manager: "Manager", director: "Director" };
export const TYPE_L: Record<NodeType, string> = { dept: "Department", tower: "Tower", branch: "Team", system: "System", trade: "Trade" };
export const HTYPE: Record<HolidayType, string> = {
  regular: "Regular holiday",
  special: "Special non-working day",
  company: "Company day off",
};

export const SHIFTS0: Shift[] = [
  { id: "E", name: "Early morning", start: "05:00", end: "14:00", bucket: "morning" },
  { id: "M", name: "Morning", start: "06:00", end: "15:00", bucket: "morning" },
  { id: "D", name: "Day", start: "08:00", end: "17:00", bucket: "morning" },
  { id: "MID", name: "Midshift", start: "12:00", end: "21:00", bucket: "mid" },
  { id: "SW", name: "Swing", start: "15:00", end: "00:00", bucket: "mid" },
  { id: "N", name: "Night", start: "18:00", end: "03:00", bucket: "gy" },
  { id: "GY", name: "Graveyard", start: "22:00", end: "07:00", bucket: "gy" },
];

export const BCP_ST: Record<BcpStatus, string> = {
  wfh: "Working from home",
  office: "Working in office",
  aff_ok: "Affected – still working",
  aff_no: "Affected – cannot work",
  leave: "On leave",
  none: "No response",
};
export const BCP_KEYS: BcpStatus[] = ["wfh", "office", "aff_ok", "aff_no", "leave", "none"];
export const BCP_CLS: Record<BcpStatus, string> = {
  wfh: "tag-accent",
  office: "tag-accent",
  aff_ok: "tag-outline",
  aff_no: "tag-outline",
  leave: "tag-neutral",
  none: "tag-neutral",
};
export const CI_DESC: Record<Exclude<BcpStatus, "none">, string> = {
  wfh: "Safe and working from home",
  office: "Safe and working in the office",
  aff_ok: "Affected (no power, flooding, etc.) but able to work",
  aff_no: "Affected and unable to work right now",
  leave: "On approved leave today",
};
export type ReadyKey = "laptop" | "internet" | "backup" | "power" | "setup";
export const READY_F: [ReadyKey, string][] = [
  ["laptop", "Company laptop at home"],
  ["internet", "Home internet working"],
  ["backup", "Backup internet (pocket Wi-Fi or mobile data)"],
  ["power", "Power backup (UPS or generator)"],
  ["setup", "Safe work area at home"],
];
export const RD_L = { ready: "Ready", partial: "Partly ready", not: "Not ready", none: "Not submitted" };
export const RD_CLS = { ready: "tag-accent", partial: "tag-outline", not: "tag-outline", none: "tag-neutral" };

export const APPR_TAG = { approved: "tag-accent", pending: "tag-outline", declined: "tag-neutral" } as const;
export const APPR_WORD = { approved: "Approved", pending: "Pending", declined: "Declined" } as const;

/**
 * Sample staff. Names are fictional; ids line up with the Workload module's
 * sample people (0 = Ana Reyes, the prototype employee; 23 = Sam Delgado, the admin).
 */
export const NAMES = [
  "Ana Reyes", "Bea Santos", "Carla Mendoza", "Dan Villanueva", "Eli Navarro", "Franco Dizon", "Gio Ramos",
  "Tess Ocampo", "Uriel Pascual", "Hana Cruz", "Ivan Torres", "Jessa Flores", "Vince Robles", "Wendy Lacson",
  "Kim Bautista", "Leo Aquino", "Mia Castillo", "Xandro Manalo", "Yna Galang", "Nico Salazar", "Zach Dela Rosa",
  "Arvin Tolentino", "Bettina Sison", "Sam Delgado", "Carlo Ignacio", "Olive Tan", "Diego Samonte", "Erika Valdez",
  "Felix Aguilar", "Paolo Lim", "Rhea Soriano", "Gwen Salcedo", "Hector Dimaculangan", "Iris Montemayor",
];
export const ADMIN_ID = 23;
export const EMPLOYEE_ID = 0;

export const first = (n: string) => n.split(" ")[0];
export const emailOf = (n: string) => {
  const w = n.toLowerCase().split(" ");
  return `${w[0]}.${w[w.length - 1]}@dsv.com`;
};
export const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
