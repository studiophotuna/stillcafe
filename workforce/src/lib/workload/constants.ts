import type { AllocationMode, Availability, Person, Priority, TaskField, TaskStatus, Trade, WlOrg } from "./types";

/** Sample-data org (demo mode): Rate Management › GPM / RCM › trades. With a database the org comes from the Calendar. */
const TEAM = { id: "rm", name: "Rate Management" };

const SYS: Record<string, string> = { gpm: "GPM", rcm: "RCM" };

const TRADES: Trade[] = [
  { id: "fewb", name: "FEWB", sys: "gpm" },
  { id: "inas", name: "INAS", sys: "gpm" },
  { id: "eu", name: "EU", sys: "gpm" },
  { id: "us", name: "US", sys: "rcm" },
  { id: "asla", name: "ASLA", sys: "rcm" },
  { id: "lcl", name: "LCL", sys: "rcm" },
];

export const DEMO_ORG: WlOrg = {
  team: TEAM,
  systems: Object.entries(SYS).map(([id, name]) => ({ id, name })),
  trades: TRADES,
  teams: [{ ...TEAM, tower: "A&S Support - Rate Management" }],
};

export const tradeOf = (o: WlOrg, id: string) => o.trades.find((t) => t.id === id);
export const sysName = (o: WlOrg, id: string) => o.systems.find((s) => s.id === id)?.name ?? "";
/** "GPM › FEWB", "FEWB" when there is no system, or "Needs trade". */
export const trPathOf = (o: WlOrg, id: string) => {
  const t = tradeOf(o, id);
  if (!t) return "Needs trade";
  return t.sys ? `${sysName(o, t.sys)} › ${t.name}` : t.name;
};

/** Sample people. Availability and shifts come from the Calendar in the full app. */
const PEOPLE_SEED: [number, string, string[]][] = [
  [0, "Ana Reyes", ["lcl"]],
  [1, "Bea Santos", ["inas"]],
  [2, "Carla Mendoza", ["inas"]],
  [3, "Dan Villanueva", ["eu"]],
  [4, "Eli Navarro", ["eu"]],
  [5, "Franco Dizon", ["fewb"]],
  [6, "Gio Ramos", ["eu"]],
  [9, "Hana Cruz", ["fewb"]],
  [10, "Ivan Torres", ["fewb"]],
  [11, "Jessa Flores", ["fewb"]],
  [14, "Kim Bautista", ["lcl", "us", "asla"]],
  [15, "Leo Aquino", ["lcl"]],
  [16, "Mia Castillo", ["lcl"]],
  [19, "Nico Salazar", ["lcl"]],
  [25, "Olive Tan", ["us"]],
  [29, "Paolo Lim", ["asla"]],
  [30, "Rhea Soriano", ["asla"]],
  [23, "Sam Delgado", []],
];
const AVAIL_SEED: Record<number, Availability> = { 4: "leave", 19: "leave", 10: "offshift" };

export const PEOPLE: Person[] = PEOPLE_SEED.map(([id, name, trades]) => ({
  id,
  name,
  trades,
  avail: AVAIL_SEED[id] ?? "available",
  shift: id === 10 ? "GY 22:00–07:00" : "Day 08:00–17:00",
  shiftStart: id === 10 ? 22 : 8,
}));

/** Prototype identities: admin = Sam Delgado, employee = Ana Reyes. */
export const ADMIN_ID = 23;
export const EMPLOYEE_ID = 0;

export const person = (id: number) => PEOPLE.find((p) => p.id === id);

export const AV: Record<Availability, [string, string]> = {
  available: ["Available", "tag-accent"],
  leave: ["On leave", "tag-neutral"],
  offshift: ["Off shift", "tag-neutral"],
};

export const PR: Record<Priority, [string, string]> = {
  high: ["High", "tag-accent"],
  normal: ["Normal", "tag-outline"],
  low: ["Low", "tag-neutral"],
};

export const ST: Record<TaskStatus, [string, string]> = {
  new: ["In queue", "tag-outline"],
  assigned: ["Assigned", "tag-accent"],
  in_progress: ["In progress", "tag-accent"],
  on_hold: ["On hold", "tag-neutral"],
  done: ["Done", "tag-neutral"],
};

export const MODES: [AllocationMode, string, string][] = [
  ["fifo", "First in, first out", "Members click “Start work” and get the next task in their system and trade."],
  ["self", "Members pick", "Members choose a task from the queue for their system and trade."],
  ["manual", "Admin assigns", "An admin assigns each task. Members start what is assigned to them."],
  ["rr", "Round-robin", "New tasks are shared out evenly to available members of the trade."],
];
export const modeLabel = (m: AllocationMode) => MODES.find((x) => x[0] === m)![1];

export const CARRIERS = ["MSCU", "HLCU", "CMDU", "ONEY", "ZIMU", "MAEU", "COSU"];

export const FIELDS0: TaskField[] = [
  { key: "ticket", label: "Ticket no.", type: "text", required: true },
  { key: "carrier", label: "Carrier", type: "select", options: CARRIERS.join(", "), required: true },
  { key: "contract", label: "Contract no.", type: "text", required: false },
  { key: "contracts", label: "No. of contracts", type: "number", required: true, metric: true },
  { key: "amendments", label: "No. of amendments", type: "number", required: false, metric: true },
  { key: "remarks", label: "Remarks", type: "text", required: false },
];

export const fieldOptions = (f: TaskField) =>
  String(f.options ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
