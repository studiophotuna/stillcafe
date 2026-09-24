/** Members and schedule uploads: row checks and import (pure; shared by browser and server). */
import { ANNUAL, CODES, LEVELS, WORKING, lc } from "./constants";
import { fmt, toIso } from "./dates";
import type { Cal } from "./engine";
import { ALLOC_MIN } from "./org";
import type { CalPerson, CalendarData, Code, Level, LeaveRequest, OrgNode } from "./types";

export type UploadMode = "members" | "schedule";
export type UploadRow = Record<string, unknown>;

interface MemberApply {
  name: string;
  email: string;
  level: Level;
  leaf: string;
  hire: string;
  ent: number;
  el: number;
  carry: number;
  shift: string | null;
}
interface ScheduleApply {
  pid: number;
  date: string;
  code: Code | "";
  shift: string | null;
}
export interface CheckedUpload {
  n: number;
  summary: string;
  ok: boolean;
  msg: string;
  stText: string;
  stCls: string;
  skip?: boolean;
  member?: MemberApply;
  schedule?: ScheduleApply;
}

const col = (r: UploadRow, ...keys: string[]) => {
  for (const k of Object.keys(r)) if (keys.includes(lc(k))) return r[k];
  return "";
};
const nmEq = (n: OrgNode, v: unknown) => {
  const a = lc(n.name);
  const b = lc(v);
  return !!b && (a === b || a.split(" (")[0] === b);
};

export function checkUpload(c: Cal, mode: UploadMode, rows: UploadRow[], bid: string): CheckedUpload[] {
  const { O } = c;
  const depts = c.d.nodes.filter((n) => n.type === "dept");
  return rows.map((r, i): CheckedUpload => {
    if (mode === "members") {
      const name = String(col(r, "name", "employee name") ?? "").trim();
      const email = lc(col(r, "email"));
      const lvRaw = lc(col(r, "role", "level"));
      const lv = (Object.keys(LEVELS) as Level[]).find((k) => lc(LEVELS[k]) === lvRaw) || (lvRaw ? null : "member");
      // Directors need only a department, managers a tower; everyone else a team.
      const need = lv ? ALLOC_MIN[lv] : "branch";
      const twv = col(r, "tower");
      const tmv = col(r, "team");
      const d = depts.find((n) => nmEq(n, col(r, "department")));
      const tw = d && O.kids(d.id, "tower").find((n) => nmEq(n, col(r, "tower")));
      const tm = tw && O.kids(tw.id, "branch").find((n) => nmEq(n, col(r, "team")));
      const sv = col(r, "system");
      const tv = col(r, "trade");
      const sy = tm && sv ? O.kids(tm.id, "system").find((n) => nmEq(n, sv)) : undefined;
      const tr = tm && tv ? O.kids((sy || tm).id, "trade").find((n) => nmEq(n, tv)) : undefined;
      const ex = c.d.people.find((p) => p.email === email);
      const err = !name
        ? "Name is missing"
        : !/^[^@\s]+@[^@\s]+$/.test(email)
          ? "Email is missing or invalid"
          : !lv
            ? "Role must be Member, Team lead, Manager or Director"
            : !d
            ? "Department not found"
            : !tw && (need !== "dept" || twv)
              ? `Tower not found in ${d.name}`
              : !tm && (need === "branch" || tmv)
                ? tw ? `Team not found in ${tw.name}` : "Choose a tower before a team"
                : (sv || tv) && !tm
                  ? "A system or trade needs a team"
                : sv && !sy
                  ? `System “${sv}” not found in ${tm!.name}`
                  : tv && !tr
                    ? `Trade “${tv}” not found`
                    : "";
      const leaf = tr || sy || tm || tw || d;
      const shv = lc(col(r, "default shift"));
      const shift = c.d.shifts.find((y) => lc(y.id) === shv || lc(y.name) === shv)?.id ?? null;
      return {
        n: i + 2,
        summary: `${name} · ${email}` + (leaf ? " · " + [tm ? tm.name : tw ? tw.name : d?.name, sy?.name, tr?.name].filter(Boolean).join(" › ") : ""),
        ok: !err,
        msg:
          err ||
          (ex
            ? ex.assign.includes(leaf!.id)
              ? "Already allocated here; role will update"
              : "Existing person; allocation will be added"
            : "New person"),
        stText: err ? "Error" : ex ? "Update" : "New",
        stCls: err ? "tag-neutral" : "tag-accent",
        member: err
          ? undefined
          : {
              name,
              email,
              level: lv!,
              leaf: leaf!.id,
              hire: toIso(col(r, "hire date")) || c.today,
              ent: Number(col(r, "vl+sl entitlement", "annual entitlement")) || 25,
              el: Number(col(r, "el entitlement")) || 5,
              carry: Math.min(5, Number(col(r, "carry-over", "carry over")) || 0),
              shift,
            },
      };
    }
    // schedule
    const email = lc(col(r, "email"));
    const nm = lc(col(r, "name", "employee name"));
    const p = c.d.people.find((x) => (email && x.email === email) || (nm && lc(x.name) === nm));
    const date = toIso(col(r, "date"));
    let code = String(col(r, "code", "status", "schedule") ?? "").trim().toUpperCase() as Code | "";
    const shv = String(col(r, "shift") ?? "").trim();
    let shf = shv ? c.d.shifts.find((x) => lc(x.id) === lc(shv) || lc(x.name) === lc(shv)) : undefined;
    if (p && date && O.inN(p, bid)) {
      const cur = c.raw(p, date, bid);
      const c0 = code;
      const s0 = shf;
      if (code && cur.code === code) code = "";
      if (shf && WORKING.includes(cur.code as Code) && c.shiftFor(p, date) === shf.id) shf = undefined;
      if (!code && !shf && (c0 || s0)) return { n: i + 2, summary: "", ok: false, msg: "", stText: "", stCls: "", skip: true };
    }
    const err = !p
      ? "Person not found"
      : !O.inN(p, bid)
        ? `${p.name} isn’t in ${O.by[bid].name}`
        : !date
          ? "Date is missing or not a date"
          : shv && !shf
            ? `Shift “${shv}” isn’t in the shift list`
            : (code ? !CODES[code as Code] || code === "HOL" : !shf)
              ? "Give a Code (RTO, WFH, RD, VL, SL, EL, HD, BT, HDY) or a Shift"
              : p.resign && date > p.resign
                ? "After their last day"
                : "";
    return {
      n: i + 2,
      summary:
        (p ? p.name : email || nm || "—") +
        " · " +
        (date ? `${fmt(date)} ${date.slice(0, 4)}` : String(col(r, "date"))) +
        (code ? " · " + code : "") +
        (shf ? " · " + shf.id : ""),
      ok: !err,
      msg:
        err ||
        [ANNUAL.includes(code as Code) ? "Recorded as approved leave" : code ? "Sets the schedule for that day" : ""]
          .concat(shf ? [`Shift ${shf.name} ${shf.start}–${shf.end}`] : [])
          .filter(Boolean)
          .join(" · "),
      stText: err ? "Error" : "Ready",
      stCls: err ? "tag-neutral" : "tag-accent",
      schedule: err ? undefined : { pid: p!.id, date, code, shift: shf ? shf.id : null },
    };
  });
}

export function applyUpload(c: Cal, mode: UploadMode, ok: CheckedUpload[]): CalendarData {
  const d = c.d;
  if (mode === "members") {
    const people: CalPerson[] = d.people.slice();
    for (const { member: a } of ok) {
      if (!a) continue;
      const i = people.findIndex((p) => p.email === a.email);
      if (i >= 0) {
        const p = people[i];
        people[i] = { ...p, shift: a.shift || p.shift, level: a.level || p.level, assign: p.assign.includes(a.leaf) ? p.assign : p.assign.concat(a.leaf) };
      } else
        people.push({
          id: Math.max(-1, ...people.map((p) => p.id)) + 1,
          name: a.name,
          email: a.email,
          level: a.level,
          assign: [a.leaf],
          pattern: "A",
          shift: a.shift || "D",
          hire: a.hire,
          ytd: 0,
          ytdEl: 0,
          resign: null,
          entitle: a.ent,
          elEnt: a.el,
          carry: a.carry,
        });
    }
    return { ...d, people };
  }
  const overrides = { ...d.overrides };
  const roster = { ...d.roster };
  const reqs: LeaveRequest[] = [];
  let seq = d.seq;
  for (const { schedule: a } of ok) {
    if (!a) continue;
    const p = c.person(a.pid);
    if (a.shift) roster[a.pid + "|" + a.date] = a.shift;
    if (!a.code) continue;
    if (ANNUAL.includes(a.code)) {
      const ap: LeaveRequest["approvals"] = {};
      c.O.branchesOf(p).forEach((b) => (ap[b.id] = "approved"));
      reqs.push({
        id: "LR" + String(seq++).padStart(6, "0"),
        pid: a.pid,
        type: a.code,
        start: a.date,
        end: a.date,
        half: a.code === "HD" ? "AM" : null,
        reason: "Imported",
        created: c.today,
        approvals: ap,
      });
    } else overrides[a.pid + "|" + a.date] = a.code;
  }
  return { ...d, overrides, roster, requests: reqs.concat(d.requests), seq };
}
