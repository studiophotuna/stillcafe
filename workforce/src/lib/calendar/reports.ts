/** CSV reports (dept / tower / team + date range). Pure: rows[0] is the header. */
import { ANNUAL, BCP_ST, CODES, READY_F, WORKING } from "./constants";
import { DOW as DOW_NAMES, addDays, dowOf, isWk } from "./dates";
import { allApproved, anyPending, type Cal } from "./engine";
import { attendanceSummary } from "./summary";
import type { CalPerson, Code } from "./types";

export type ReportType = "attendance" | "summary" | "schedule" | "leave" | "holiday" | "manning" | "bcp" | "headcount";
export const REPORT_TYPES: [ReportType, string][] = [
  ["attendance", "Attendance (RTO/WFH) per person"],
  ["summary", "Attendance summary (per team and system)"],
  ["schedule", "Schedule (per person per day)"],
  ["leave", "Leave taken and balances"],
  ["holiday", "Holiday manning"],
  ["manning", "Shift manning (per day)"],
  ["bcp", "BCP status"],
  ["headcount", "Resignations and headcount"],
];

export interface ReportResult {
  rows: (string | number)[][];
  desc: string;
  /** Count tiles shown above the report. */
  tiles: { k: string; v: string | number; m?: string }[];
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
  const tiles: ReportResult["tiles"] = [];
  const sum = (col: number) => rows.slice(1).reduce((a, r) => a + (Number(r[col]) || 0), 0);
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
    const r = sum(8), w = sum(9);
    tiles.push({ k: "People", v: rows.length - 1 }, { k: "In office days", v: r }, { k: "WFH days", v: w }, { k: "Leave days", v: sum(10) }, { k: "Holiday duty days", v: sum(13) }, { k: "Office rate", v: r + w ? `${Math.round((r / (r + w)) * 100)}%` : "—", m: "in office ÷ (in office + WFH)" });
  }
  if (type === "summary") {
    desc = "Per day, each team then each of its systems: people working (RTO, WFH, holiday duty, rest day OT) out of the headcount, and how many are in office, WFH, on leave and so on. Midshift and GY count those on those shifts.";
    const K: Code[] = ["RTO", "WFH", "HDY", "RDOT", "SL", "VL", "EL", "HD", "BT", "RD", "HOL", "ML", "PL", "SPL"];
    rows.push(["Date", "Day", "Team", "System", "Present", "Headcount", ...K.map((k) => CODES[k].label), "Midshift (working)", "GY (working)"]);
    for (const d of dates.slice(0, 62)) {
      for (const b of attendanceSummary(c, scope, d)) {
        const n = (k: Code) => b.lines.find((l) => l.code === k)?.n ?? 0;
        const sh = (bk: string) => b.lines.reduce((a, l) => a + (Number(l.shifts.match(new RegExp("(\\d+) " + bk))?.[1]) || 0), 0);
        rows.push([d, DOW_NAMES[dowOf(d)], b.level === "team" ? b.name : "", b.level === "system" ? b.name : "", b.present, b.headcount, ...K.map(n), sh("Midshift"), sh("GY")]);
      }
    }
    const teamRows = rows.slice(1).filter((r) => r[2]);
    const col = (i: number) => teamRows.reduce((a, r) => a + (Number(r[i]) || 0), 0);
    tiles.push(
      { k: "Headcount", v: dates.length === 1 ? col(5) : `${col(5)}`, m: dates.length === 1 ? "people" : "person-days" },
      { k: "Present", v: col(4), m: "working; leave deducted" },
      { k: "In office", v: col(6) },
      { k: "WFH", v: col(7) },
      { k: "On leave", v: col(10) + col(11) + col(12) + col(13) + col(17) + col(18) + col(19), m: "SL, VL, EL, half-day, maternity, paternity, solo parent" },
      { k: "OT days", v: col(8) + col(9), m: "holiday duty + rest day OT" },
    );
  }
  if (type === "schedule") {
    desc = "One row per person, one column per day: their status and shift (e.g. RTO · Day, WFH · Night, RDOT · Day, VL). Up to 62 days.";
    const ds = dates.slice(0, 62);
    rows.push(["Tower", "Team", "System", "Trade", "Name", "Default shift", ...ds.map((d) => `${d} ${DOW_NAMES[dowOf(d)]}`)]);
    const cnt: Partial<Record<Code, number>> = {};
    for (const p of ppl) {
      rows.push([
        ...path(p),
        p.name,
        shName(p.shift),
        ...ds.map((d) => {
          const x = c.raw(p, d, null);
          if (x.gone || (p.hire && p.hire > d)) return "—";
          if (!x.code) return "";
          cnt[x.code] = (cnt[x.code] ?? 0) + 1;
          return x.code + (x.shift && WORKING.includes(x.code) ? ` · ${shName(x.shift)}` : "") + (x.pending ? " (pending)" : "");
        }),
      ]);
    }
    const n = (k: Code) => cnt[k] ?? 0;
    tiles.push({ k: "People", v: ppl.length }, { k: "RTO days", v: n("RTO") }, { k: "WFH days", v: n("WFH") }, { k: "Leave days", v: n("VL") + n("SL") + n("EL") + n("HD") + n("ML") + n("PL") + n("SPL") }, { k: "Rest days", v: n("RD") }, { k: "OT days", v: n("HDY") + n("RDOT"), m: "holiday duty + rest day OT" });
  }
  if (type === "leave") {
    desc = "Approved leave taken in the range by type, plus each person’s balances as of today. VL and SL share one pool (25 a year, pro-rated in the hire year, + up to 5 carried over); EL has its own 5 days. Maternity, paternity and solo parent leave are counted separately.";
    rows.push(["Name", "Email", "Tower", "Team", "VL", "SL", "EL", "Half-days", "Maternity", "Paternity", "Solo parent", "Leave days in range", "VL+SL entitlement", `Carried over from ${+year - 1}`, `VL+SL used ${year}`, "VL+SL remaining", "EL entitlement", `EL used ${year}`, "EL remaining", "Pending days", `Carries into ${+year + 1}`]);
    for (const p of ppl) {
      const rq = c.reqsOf(p.id);
      const cnt: Record<string, number> = { VL: 0, SL: 0, EL: 0, HD: 0, ML: 0, PL: 0, SPL: 0 };
      rq.filter(allApproved).forEach((q) => {
        if (!(q.type in cnt)) return;
        for (let d = q.start > from ? q.start : from, e = q.end < to ? q.end : to, g = 0; d <= e && g < 400; d = addDays(d, 1), g++)
          if (q.type === "ML" || (!isWk(d) && !c.hols[d])) cnt[q.type] += 1; // maternity: calendar days
      });
      const used = c.usedOf(p);
      const elU = c.elUsedOf(p);
      const pool = c.poolOf(p);
      const pend = rq.filter(anyPending).reduce((a, q) => a + c.reqDays(q), 0);
      const pth = path(p);
      const lv = cnt.VL + cnt.SL + cnt.EL + cnt.HD * 0.5 + cnt.ML + cnt.PL + cnt.SPL;
      rows.push([p.name, p.email, pth[0], pth[1], cnt.VL, cnt.SL, cnt.EL, cnt.HD, cnt.ML, cnt.PL, cnt.SPL, lv, c.entOf(p), c.carryOf(p), used, pool - used, p.elEnt ?? 5, elU, (p.elEnt ?? 5) - elU, pend, c.carryNext(p)]);
    }
    tiles.push({ k: "People", v: rows.length - 1 }, { k: "VL days", v: sum(4) }, { k: "SL days", v: sum(5) }, { k: "EL days", v: sum(6) }, { k: "Half-days", v: sum(7) }, { k: "Pending days", v: sum(19) });
  }
  if (type === "holiday") {
    // Department / Tower / Team / Name, then one column per holiday in the date range with each person's status.
    const hdays = [...new Set(s.holidays.filter((h) => h.date >= from && h.date <= to && !isWk(h.date)).map((h) => h.date))].sort();
    const hname = (d: string) => [...new Set(s.holidays.filter((h) => h.date === d).map((h) => h.name))].join(" / ");
    desc = hdays.length
      ? `One row per person, one column per holiday (${hdays.length}) in the range. Holiday duty shows where they work (RTO or WFH); “Holiday” means not working.`
      : "No holidays fall on a weekday in this date range. Pick a range that includes a holiday.";
    rows.push(["Department", "Tower", "Team", "Name", ...hdays.map((d) => `${d} ${DOW_NAMES[dowOf(d)]} · ${hname(d)}`)]);
    const st = (p: CalPerson, d: string) => {
      const x = c.raw(p, d, null);
      if (x.gone || (p.hire && p.hire > d)) return "—";
      if (x.code === "HOL") return "Holiday";
      if (x.code === "HDY") {
        const o = s.overrides[p.id + "|" + d];
        return o === "WFH" ? "Holiday duty · WFH" : o === "RTO" ? "Holiday duty · RTO" : "Holiday duty";
      }
      // The holiday doesn't apply to this person's team: their usual status.
      return x.code ? `${CODES[x.code].label}${x.pending ? " (pending)" : ""}` : "";
    };
    const deptOf = (p: CalPerson) => {
      const a = p.assign.find((x) => O.anc(x).includes(scope)) || p.assign[0];
      return O.up(a, "dept")?.name ?? "";
    };
    const byTeam = ppl
      .map((p) => ({ p, pth: [deptOf(p), ...path(p)] }))
      .sort((a, b) => a.pth[0].localeCompare(b.pth[0]) || a.pth[1].localeCompare(b.pth[1]) || a.pth[2].localeCompare(b.pth[2]) || a.p.name.localeCompare(b.p.name));
    for (const { p, pth } of byTeam) rows.push([pth[0], pth[1], pth[2], p.name, ...hdays.map((d) => st(p, d))]);
    if (hdays.length && byTeam.length)
      rows.push(["", "", "", "Total on holiday duty", ...hdays.map((d) => byTeam.filter(({ p }) => c.raw(p, d, null).code === "HDY").length)]);
    const all = byTeam.flatMap(({ p }) => hdays.map((d) => st(p, d)));
    tiles.push(
      { k: "Holidays", v: hdays.length },
      { k: "People", v: byTeam.length },
      { k: "Holiday duty · RTO", v: all.filter((x) => x === "Holiday duty · RTO").length },
      { k: "Holiday duty · WFH", v: all.filter((x) => x === "Holiday duty · WFH").length },
      { k: "Not working", v: all.filter((x) => x === "Holiday").length },
    );
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
  if (type === "manning") {
    const nd = Math.max(1, rows.length - 1);
    const avg = (i: number) => Math.round((sum(i) / nd) * 10) / 10;
    tiles.push({ k: "Days", v: rows.length - 1 }, { k: "In office / day", v: avg(3), m: "average" }, { k: "WFH / day", v: avg(4), m: "average" }, { k: "On leave / day", v: avg(5), m: "average" }, { k: "GY / day", v: avg(8), m: "average" }, { k: "Holiday duty", v: sum(9), m: "person-days" });
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
    const stc = (v: string) => rows.slice(1).filter((r) => r[5] === v).length;
    const ppl2 = rows.length - 1;
    tiles.push({ k: "In scope", v: ppl2 }, { k: "Responded", v: ppl2 - stc(BCP_ST.none), m: ppl2 ? `${Math.round(((ppl2 - stc(BCP_ST.none)) / ppl2) * 100)}%` : "" }, ...(["wfh", "office", "aff_ok", "aff_no"] as const).map((k) => ({ k: BCP_ST[k], v: stc(BCP_ST[k]) })));
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
    tiles.push({ k: "Teams", v: rows.length - 1 }, { k: "Headcount at start", v: sum(2) }, { k: "Joined", v: sum(3) }, { k: "Resigned", v: sum(4) }, { k: "Headcount at end", v: sum(5) });
  }
  return { rows, desc, tiles };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** CSV text with a BOM so Excel opens UTF-8 correctly. */
export const toCsv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
