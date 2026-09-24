import { NAMES, SHIFTS0, emailOf } from "./constants";
import { addDays, isWk, isoOf, pad } from "./dates";
import { Cal, logsDecision, logsSubmit } from "./engine";
import { teamDefaults } from "./org";
import type { CalPerson, CalendarData, Checkin, Code, Level, LeaveRequest, NotifLog, OrgNode, Readiness } from "./types";

/** Org seed: BSS › 5 towers › Rate Management (GPM/RCM trades) and Customer Service. */
export const NODES0: OrgNode[] = [
  { id: "bss", type: "dept", name: "BSS (Business Support Services)", parent: null },
  { id: "t_ops", type: "tower", name: "A&S Support - Operational", parent: "bss" },
  { id: "t_ie", type: "tower", name: "A&S Support - Import & Export", parent: "bss" },
  { id: "t_rm", type: "tower", name: "A&S Support - Rate Management", parent: "bss" },
  { id: "t_com", type: "tower", name: "A&S Support - Commercial", parent: "bss" },
  { id: "t_cus", type: "tower", name: "Customs", parent: "bss" },
  { id: "rm", type: "branch", name: "Rate Management", parent: "t_rm", ...teamDefaults({ admins: [23] }) },
  { id: "gpm", type: "system", name: "GPM", parent: "rm" },
  { id: "rcm", type: "system", name: "RCM", parent: "rm" },
  { id: "fewb", type: "trade", name: "FEWB", parent: "gpm" },
  { id: "inas", type: "trade", name: "INAS", parent: "gpm" },
  { id: "eu", type: "trade", name: "EU", parent: "gpm" },
  { id: "us", type: "trade", name: "US", parent: "rcm" },
  { id: "asla", type: "trade", name: "ASLA", parent: "rcm" },
  { id: "lcl", type: "trade", name: "LCL", parent: "rcm" },
  { id: "cs", type: "branch", name: "Customer Service", parent: "t_ops", ...teamDefaults({ mode: "auto", admins: [27] }) },
];

const ASSIGN: Record<number, string[]> = {
  0: ["lcl", "cs"], 1: ["inas"], 2: ["inas"], 17: ["inas"], 3: ["eu"], 4: ["eu"], 6: ["eu"], 7: ["eu"], 21: ["eu"],
  5: ["fewb"], 9: ["fewb"], 10: ["fewb"], 11: ["fewb"], 12: ["fewb"], 13: ["fewb"], 32: ["fewb"], 33: ["fewb", "eu"],
  8: ["rm"], 18: ["rm"], 28: ["rm"], 23: ["rm"], 24: ["gpm"], 14: ["rcm"], 15: ["lcl"], 16: ["lcl"], 19: ["lcl"],
  20: ["lcl"], 22: ["lcl"], 25: ["us"], 26: ["rm", "cs"], 27: ["cs"], 29: ["asla"], 30: ["asla"], 31: ["cs"],
};
const LEVEL0: Record<number, Level> = { 23: "manager", 26: "director", 27: "manager", 24: "lead", 21: "lead", 14: "lead" };
const HOL0: [string, string, "regular" | "special" | "company", string?][] = [
  ["2026-08-21", "Ninoy Aquino Day", "special"],
  ["2026-08-31", "National Heroes Day", "regular"],
  ["2026-10-16", "Rate Management team day", "company", "rm"],
  ["2026-11-02", "All Souls’ Day", "special"],
  ["2026-11-30", "Bonifacio Day", "regular"],
  ["2026-12-08", "Immaculate Conception", "special"],
  ["2026-12-24", "Christmas Eve", "special"],
  ["2026-12-25", "Christmas Day", "regular"],
  ["2026-12-30", "Rizal Day", "regular"],
  ["2026-12-31", "New Year’s Eve", "special"],
];

/** Sample calendar for BSS, as in the design prototype (sample dates are in Aug–Dec 2026). */
export function initialCalendar(today: string): CalendarData {
  const people: CalPerson[] = NAMES.map((n, i) => ({
    id: i,
    name: n,
    email: emailOf(n),
    level: LEVEL0[i] || "member",
    assign: (ASSIGN[i] || ["rm"]).slice(),
    pattern: i % 3 === 0 ? "B" : "A",
    shift: ["D", "D", "M", "MID", "D", "GY", "E", "D", "N", "SW"][i % 10],
    hire: isoOf(2017 + ((i * 7) % 9), (i * 5) % 12, 1 + ((i * 11) % 27)),
    ytd: 3 + ((i * 5) % 14),
    ytdEl: i % 3,
    carry: [0, 3, 5, 2, 0, 1, 4, 5, 0, 2][i % 10],
    resign: i === 18 ? "2026-08-14" : i === 28 ? "2026-09-18" : null,
    entitle: 25,
    elEnt: 5,
  }));
  const nodes: OrgNode[] = JSON.parse(JSON.stringify(NODES0));
  let id = 1;
  const mk = (o: Partial<LeaveRequest> & Pick<LeaveRequest, "pid" | "type" | "start" | "end" | "created" | "approvals">): LeaveRequest => ({
    id: "LR" + String(id++).padStart(6, "0"),
    half: null,
    reason: "",
    ...o,
  });
  const explicit = [
    mk({ pid: 0, type: "VL", start: "2026-09-28", end: "2026-09-30", reason: "Family trip", created: "2026-09-21", approvals: { rm: "pending", cs: "approved" } }),
    mk({ pid: 14, type: "VL", start: "2026-10-05", end: "2026-10-06", reason: "Sister’s wedding", created: "2026-09-22", approvals: { rm: "pending" } }),
    mk({ pid: 8, type: "HD", half: "PM", start: "2026-09-25", end: "2026-09-25", reason: "Medical appointment", created: "2026-09-23", approvals: { rm: "pending" } }),
    mk({ pid: 5, type: "BT", start: "2026-10-01", end: "2026-10-02", reason: "Client visit, Cebu", created: "2026-09-23", approvals: { rm: "pending" } }),
    mk({ pid: 0, type: "VL", start: "2026-09-11", end: "2026-09-11", reason: "Personal errand", created: "2026-09-02", approvals: { rm: "declined", cs: "approved" } }),
    mk({ pid: 28, type: "VL", start: "2026-09-14", end: "2026-09-15", created: "2026-09-01", approvals: { rm: "approved" } }),
    mk({ pid: 26, type: "VL", start: "2026-09-16", end: "2026-09-18", created: "2026-09-01", approvals: { rm: "approved", cs: "approved" } }),
    mk({ pid: 27, type: "BT", start: "2026-09-29", end: "2026-09-30", reason: "Regional meeting", created: "2026-09-10", approvals: { cs: "approved" } }),
  ];
  const base: CalendarData = {
    people, nodes, requests: [], overrides: {}, roster: {}, shifts: SHIFTS0.map((s) => ({ ...s })), holidays: [],
    bcpReady: {}, bcpEvents: [], checkins: {}, logs: [], seq: 0,
  };
  const O = new Cal(base, today).O;

  let sd = 11;
  const r = () => ((sd = (sd * 16807) % 2147483647), sd / 2147483647);
  const seeded: LeaveRequest[] = [];
  for (const p of people) {
    if (p.id === 0) continue;
    const k = r() < 0.35 ? 0 : r() < 0.7 ? 1 : 2;
    for (let j = 0; j < k; j++) {
      const m = r() < 0.75 ? 8 : 9;
      let start = isoOf(2026, m, 1 + Math.floor(r() * 28));
      while (isWk(start)) start = addDays(start, 1);
      const t = (["VL", "VL", "VL", "SL", "HD", "BT", "EL", "VL"] as Code[])[Math.floor(r() * 8)];
      const len = t === "VL" ? 1 + Math.floor(r() * 3) : t === "BT" ? 2 : 1;
      let end = start;
      for (let q = 1; q < len; q++) {
        end = addDays(end, 1);
        while (isWk(end)) end = addDays(end, 1);
      }
      if (p.resign && start > p.resign) continue;
      const ap: LeaveRequest["approvals"] = {};
      O.branchesOf(p).forEach((b) => (ap[b.id] = "approved"));
      seeded.push(mk({ pid: p.id, type: t, start, end, half: t === "HD" ? "AM" : null, created: "2026-08-" + pad(10 + j), approvals: ap }));
    }
  }
  const holidays = HOL0.map((x, i) => ({ id: "H" + i, date: x[0], name: x[1], type: x[2], scope: x[3] || "all" }));
  const data: CalendarData = { ...base, requests: explicit.concat(seeded), holidays };
  const c = new Cal(data, today);
  const logs: NotifLog[] = [
    ...logsDecision(c, explicit[4], "rm", "declined", "Thu 3 Sep, 09:12", "admin"),
    ...logsSubmit(c, explicit[0], "Mon 21 Sep, 09:14", null),
    ...logsSubmit(c, explicit[3], "Wed 23 Sep, 14:30", null),
    ...logsSubmit(c, explicit[2], "Wed 23 Sep, 16:02", null),
  ]
    .reverse()
    .map((l, i) => ({ ...l, id: "N" + i }));

  const roster: Record<string, string> = {};
  for (const p of people)
    if (p.shift === "GY" || p.shift === "N")
      for (let d = 1; d <= 30; d++) {
        const iso = isoOf(2026, 8, d);
        if (!isWk(iso) && Math.floor((d - 1) / 7) % 2 === 1) roster[p.id + "|" + iso] = p.shift === "GY" ? "N" : "GY";
      }

  let s2 = 5;
  const r2 = () => ((s2 = (s2 * 16807) % 2147483647), s2 / 2147483647);
  const bcpReady: Record<number, Readiness> = {};
  for (const p of people) {
    if (p.id === 0 || r2() < 0.12) continue;
    bcpReady[p.id] = {
      laptop: r2() < 0.95,
      internet: r2() < 0.9,
      backup: r2() < 0.55,
      power: r2() < 0.4,
      setup: r2() < 0.85,
      updated: isoOf(2026, 7 + Math.floor(r2() * 2), 1 + Math.floor(r2() * 27)),
    };
  }
  const bcpEvents = [
    { id: "E2", name: "Typhoon Helen – Signal No. 3 (NCR)", start: "2026-09-24", end: "", scope: "bss", status: "active" as const, note: "Office closes at 12:00. Work from home if it is safe to do so, and check in below." },
    { id: "E1", name: "Power interruption – Ortigas", start: "2026-08-12", end: "2026-08-12", scope: "bss", status: "closed" as const, note: "" },
  ];
  const stK = ["wfh", "wfh", "wfh", "wfh", "office", "aff_ok", "aff_no", "wfh", "leave"] as const;
  const checkins: Record<string, Record<number, Checkin>> = { E2: {}, E1: {} };
  for (const p of people) {
    if (p.resign && p.resign < "2026-09-24") continue;
    if (p.id !== 0 && r2() < 0.74) {
      const st = stK[Math.floor(r2() * stK.length)];
      checkins.E2[p.id] = {
        status: st,
        note: st === "aff_no" ? "Flooding in our area, no power" : st === "aff_ok" ? "Brownouts, using mobile data" : "",
        at: `Thu 24 Sep, 0${8 + Math.floor(r2() * 2)}:${pad(Math.floor(r2() * 60))}`,
      };
    }
    if (!(p.resign && p.resign < "2026-08-12")) checkins.E1[p.id] = { status: r2() < 0.8 ? "wfh" : "aff_ok", note: "", at: "Wed 12 Aug" };
  }
  const overrides: CalendarData["overrides"] = {
    "3|2026-09-22": "RTO", "7|2026-09-24": "WFH", "12|2026-09-26": "RTO",
    "23|2026-11-30": "HDY", "14|2026-11-30": "HDY", "25|2026-11-30": "HDY", "5|2026-10-16": "HDY", "9|2026-10-16": "HDY",
  };
  return { ...data, logs, roster, bcpReady, bcpEvents, checkins, overrides, seq: 100 + data.requests.length };
}
