/** CSV reports (dept / tower / team + date range). Pure: rows[0] is the header. */
import { ANNUAL, BCP_ST, READY_F, WORKING } from "./constants";
import { DOW as DOW_NAMES, addDays, dowOf, isWk } from "./dates";
import { allApproved, anyPending, type Cal } from "./engine";
import type { CalPerson, Code } from "./types";

export type ReportType = "attendance" | "leave" | "manning" | "bcp" | "headcount";
export const REPORT_TYPES: [ReportType, string][] = [
  ["attendance", "Attendance (RTO/WFH) per person"],
  ["leave", "Leave taken and balances"],
  ["manning", "Shift and holiday manning"],
  ["bcp", "BCP status"],
  ["headcount", "Resignations and headcount"],
];

export interface ReportResult {
  rows: (string | number)[][];
  desc: string;
}

export function buildReport(c: Cal, type: ReportType, scope: string, from: string, to: string, evId?: string, deptId?: string): ReportResult {
  const { O } = c;
  const s = c.d;
  const dates: string[] = [];
  for (let d = from, g = 0; d <= to && g < 370; d = addDays(d, 1), g++) dates.push(d);
  const ppl = s.people
    .filter((p) => O.inN(p, scope) && (!p.resign || p.resign >= from) && (!p.hire || p.hire <= to))
    .sort((a, b) => a.name.localeCompare(b.name));
  const path = (p: CalPerson) => {
    const a = p.assign.find((x) => O.anc(x).includes(scope)) || p.assign[0];
    const g = (t: "tower" | "branch" | "system" | "trade") => O.up(a, t)?.name ?? "";
    return [g("tower"), g("branch"), g("system"), g("trade")];
  };
  const shName = (id: string) => s.shifts.find((y) => y.id === id)?.name ?? "";
  const rows: (string | number)[][] = [];
  let desc = "";
  const year = from.slice(0, 4);
  if (type === "attendance") {
    desc = "One row per person: working days in the range and how each was spent. Office rate = in-office days ÷ (in-office + WFH days).";
    rows.push(["Name", "Email", "Tower", "Team", "System", "Trade", "Default shift", "Working days", "In office (RTO)", "Work from home", "Leave days", "Business trip", "Rest day", "Holiday duty", "Office rate %"]);
    for (const p of ppl) {
      let wd = 0, rto = 0, wfh = 0, lv = 0, bt = 0, rd = 0, hdy = 0;
      for (const d of dates) {
        const x = c.raw(p, d, null);
        if (x.gone) continue;
        if (!isWk(d) && x.code !== "HOL") wd++;
        if (x.code === "RTO") rto++;
        else if (x.code === "WFH") wfh++;
        else if (ANNUAL.includes(x.code as Code) && !x.pending) lv += x.code === "HD" ? 0.5 : 1;
        else if (x.code === "BT") bt++;
        else if (x.code === "RD") rd++;
        else if (x.code === "HDY") hdy++;
      }
      rows.push([p.name, p.email, ...path(p), shName(p.shift), wd, rto, wfh, lv, bt, rd, hdy, rto + wfh ? Math.round((rto / (rto + wfh)) * 100) : ""]);
    }
  }
  if (type === "leave") {
    desc = "Approved leave taken in the range by type, plus each person’s balances as of today. VL and SL share one pool (25 + up to 5 carried over); EL has its own 5 days.";
    rows.push(["Name", "Email", "Tower", "Team", "VL", "SL", "EL", "Half-days", "Leave days in range", "VL+SL entitlement", `Carried over from ${+year - 1}`, `VL+SL used ${year}`, "VL+SL remaining", "EL entitlement", `EL used ${year}`, "EL remaining", "Pending days", `Carries into ${+year + 1}`]);
    for (const p of ppl) {
      const rq = c.reqsOf(p.id);
      const cnt: Record<string, number> = { VL: 0, SL: 0, EL: 0, HD: 0 };
      rq.filter(allApproved).forEach((q) => {
        if (!(q.type in cnt)) return;
        for (let d = q.start > from ? q.start : from, e = q.end < to ? q.end : to, g = 0; d <= e && g < 400; d = addDays(d, 1), g++)
          if (!isWk(d) && !c.hols[d]) cnt[q.type] += 1;
      });
      const used = c.usedOf(p);
      const elU = c.elUsedOf(p);
      const pool = c.poolOf(p);
      const pend = rq.filter(anyPending).reduce((a, q) => a + c.reqDays(q), 0);
      const pth = path(p);
      rows.push([p.name, p.email, pth[0], pth[1], cnt.VL, cnt.SL, cnt.EL, cnt.HD, cnt.VL + cnt.SL + cnt.EL + cnt.HD * 0.5, p.entitle, p.carry || 0, used, pool - used, p.elEnt ?? 5, elU, (p.elEnt ?? 5) - elU, pend, Math.max(0, Math.min(5, pool - used))]);
    }
  }
  if (type === "manning") {
    desc = "One row per day: headcount by status and shift group (Morning, Midshift, GY), plus who is on holiday duty.";
    rows.push(["Date", "Day", "Holiday", "In office", "Work from home", "On leave", "Morning", "Midshift", "GY", "Holiday duty", "On holiday duty"]);
    for (const d of dates) {
      const cs = ppl.map((p) => ({ p, x: c.raw(p, d, null) }));
      const w = cs.filter((y) => WORKING.includes(y.x.code as Code) && !y.x.pending);
      const b = (k: string) => w.filter((y) => s.shifts.find((z) => z.id === y.x.shift)?.bucket === k).length;
      const hd = cs.filter((y) => y.x.code === "HDY");
      const hol = s.holidays.find((x) => x.date === d);
      rows.push([d, DOW_NAMES[dowOf(d)], hol ? hol.name : "", cs.filter((y) => y.x.code === "RTO").length, cs.filter((y) => y.x.code === "WFH").length, cs.filter((y) => ANNUAL.includes(y.x.code as Code) && !y.x.pending).length, b("morning"), b("mid"), b("gy"), hd.length, hd.map((y) => y.p.name).join("; ")]);
    }
  }
  if (type === "bcp") {
    desc = "Check-in status for the selected BCP event, with each person’s readiness record.";
    rows.push(["Event", "Name", "Email", "Tower", "Team", "Check-in status", "Note", "Checked in", "Readiness", "Company laptop", "Home internet", "Backup internet", "Power backup", "Safe work area", "Readiness updated"]);
    const evs = s.bcpEvents.filter((e) => O.by[e.scope] && (!deptId || O.anc(e.scope).includes(deptId)));
    const ev = evs.find((e) => e.id === evId) || evs[0];
    if (ev) {
      const ci = s.checkins[ev.id] || {};
      s.people
        .filter((p) => O.inN(p, scope) && O.inN(p, ev.scope) && !(p.resign && p.resign < ev.start))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((p) => {
          const x = ci[p.id];
          const rd = s.bcpReady[p.id];
          const n = rd ? READY_F.filter(([k]) => rd[k]).length : -1;
          const pth = path(p);
          rows.push([ev.name, p.name, p.email, pth[0], pth[1], BCP_ST[x ? x.status : "none"], x ? x.note : "", x ? x.at : "", n < 0 ? "Not submitted" : n === 5 ? "Ready" : n >= 3 ? "Partly ready" : "Not ready", ...READY_F.map(([k]) => (rd ? (rd[k] ? "Yes" : "No") : "")), rd?.updated ?? ""]);
        });
    }
  }
  if (type === "headcount") {
    desc = "One row per team: headcount at the start and end of the range, joiners and resignations.";
    rows.push(["Tower", "Team", "Headcount at start", "Joined", "Resigned", "Headcount at end", "Resigned (names)"]);
    const tm = O.up(scope, "branch");
    const teams = tm ? [tm] : O.desc(scope, "branch");
    for (const t of teams) {
      const g = s.people.filter((p) => O.inN(p, t.id));
      const st = g.filter((p) => p.hire <= from && (!p.resign || p.resign >= from)).length;
      const jn = g.filter((p) => p.hire >= from && p.hire <= to).length;
      const rs = g.filter((p) => p.resign && p.resign >= from && p.resign <= to);
      const en = g.filter((p) => p.hire <= to && (!p.resign || p.resign > to)).length;
      rows.push([O.up(t.id, "tower")?.name ?? "", t.name, st, jn, rs.length, en, rs.map((p) => `${p.name} (${p.resign})`).join("; ")]);
    }
  }
  return { rows, desc };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** CSV text with a BOM so Excel opens UTF-8 correctly. */
export const toCsv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
