"use client";

import { parseCsv, rowsToObjects } from "../workload/excel";
import { BUCKETS, CODES, LEVELS, WORKING, lc } from "./constants";
import { DOW, MONL, dowOf, isWk, isoOf, daysInMonth } from "./dates";
import type { Cal } from "./engine";
import type { OrgNode } from "./types";
import type { UploadMode, UploadRow } from "./uploads";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const letter = (i: number) => String.fromCharCode(65 + i);

async function save(buf: ArrayBuffer, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const headerStyle = (c: { font: unknown; fill: unknown; alignment?: unknown }) => {
  c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF416180" } };
};

/**
 * Schedule template for a month, shaped like the calendar: Status and Shift tabs
 * (rows = people, columns = dates), a drop-down in every cell, weekends and
 * holidays shaded, pre-filled with the current schedule. Only changed cells import.
 */
export async function downloadScheduleTemplate(c: Cal, unitId: string, unitLabel: string, bid: string, ym: string) {
  const { default: ExcelJS } = await import("exceljs");
  const [y, m] = ym.split("-").map(Number);
  const n = daysInMonth(y, m - 1);
  const mS = isoOf(y, m - 1, 1);
  const dates = Array.from({ length: n }, (_, i) => isoOf(y, m - 1, i + 1));
  const ppl = c.d.people.filter((p) => c.O.inN(p, unitId) && (!p.resign || p.resign >= mS)).sort((a, b) => a.name.localeCompare(b.name));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workforce Management";
  const codes = ["RTO", "WFH", "RD", "VL", "SL", "EL", "HD", "BT", "HDY"];
  const shs = c.d.shifts.map((x) => x.id);
  const sheet = (name: string, val: (pid: number, d: string) => string, list: string[], help: string) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
    ws.getCell("A1").value = `Workforce Management ${name} · ${unitLabel} · ${MONL[m - 1]} ${y}`;
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1D2D3D" } };
    ws.getCell("A2").value = help;
    ws.getCell("A2").font = { italic: true, color: { argb: "FF5D5D60" } };
    const hdr = ["Name", "Email", ...dates.map((d) => `${d} (${DOW[dowOf(d)]})`)];
    const hr = ws.getRow(3);
    hr.values = hdr;
    hr.height = 32;
    hdr.forEach((_, i) => {
      const cell = hr.getCell(i + 1);
      headerStyle(cell as never);
      cell.alignment = { wrapText: true, vertical: "middle", horizontal: i < 2 ? "left" : "center" };
    });
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 32;
    dates.forEach((_, i) => (ws.getColumn(i + 3).width = 11));
    ppl.forEach((p, r) => {
      const row = ws.getRow(4 + r);
      row.getCell(1).value = p.name;
      row.getCell(2).value = p.email;
      dates.forEach((d, i) => {
        const cell = row.getCell(3 + i);
        const v = val(p.id, d);
        if (v) cell.value = v;
        cell.alignment = { horizontal: "center" };
        const hol = c.holFor(p, d);
        if (isWk(d) || hol) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hol ? "FFD4D4D7" : "FFE7E7EA" } };
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${list.join(",")}"`],
          showErrorMessage: true,
          errorTitle: "Not in the list",
          error: "Pick a value from the drop-down.",
        };
      });
    });
  };
  sheet(
    "Status",
    (pid, d) => {
      const x = c.raw(c.person(pid), d, bid);
      return x.gone || x.code === "HOL" ? "" : x.code;
    },
    codes,
    "Pick a status from the drop-down in each cell. Grey = weekend, darker grey = holiday (use HDY for holiday duty). Only changed cells are imported.",
  );
  sheet(
    "Shift",
    (pid, d) => {
      const p = c.person(pid);
      const x = c.raw(p, d, bid);
      return WORKING.includes(x.code as never) ? c.shiftFor(p, d) : "";
    },
    shs,
    "Pick a shift code from the drop-down. The Codes tab lists shift hours. Only changed cells are imported.",
  );
  const ref = wb.addWorksheet("Codes");
  ref.getRow(1).values = ["Status code", "Meaning", "", "Shift code", "Name", "Hours", "Manning group"];
  ref.getRow(1).font = { bold: true };
  codes.forEach((k, i) => {
    ref.getCell(2 + i, 1).value = k;
    ref.getCell(2 + i, 2).value = CODES[k as keyof typeof CODES].label;
  });
  c.d.shifts.forEach((x, i) => {
    ref.getCell(2 + i, 4).value = x.id;
    ref.getCell(2 + i, 5).value = x.name;
    ref.getCell(2 + i, 6).value = `${x.start}–${x.end}`;
    ref.getCell(2 + i, 7).value = BUCKETS[x.bucket];
  });
  [14, 24, 2, 12, 18, 14, 16].forEach((w, i) => (ref.getColumn(i + 1).width = w));
  const name = `Workforce_schedule_${unitLabel.replace(/[^A-Za-z0-9]+/g, "-")}_${ym}.xlsx`;
  await save(await wb.xlsx.writeBuffer(), name);
  return name;
}

/** Members template with drop-downs from the current selection (hidden Lists sheet). */
export async function downloadMembersTemplate(c: Cal, dept: OrgNode, tower: OrgNode, branch: OrgNode) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workforce Management";
  const ws = wb.addWorksheet("Members", { views: [{ state: "frozen", ySplit: 1 }] });
  const ls = wb.addWorksheet("Lists");
  const cols = ["Name", "Email", "Role", "Department", "Tower", "Team", "System", "Trade", "Default Shift", "Hire Date", "VL+SL Entitlement", "EL Entitlement", "Carry-over"];
  const hr = ws.getRow(1);
  hr.values = cols;
  hr.height = 24;
  cols.forEach((_, i) => {
    const cell = hr.getCell(i + 1);
    headerStyle(cell as never);
    cell.alignment = { vertical: "middle" };
  });
  [26, 32, 14, 30, 34, 24, 14, 14, 14, 14, 18, 14, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const { O } = c;
  const lists: Record<string, string[]> = {
    Role: Object.values(LEVELS),
    Department: c.d.nodes.filter((n) => n.type === "dept").map((n) => n.name),
    Tower: O.kids(dept.id, "tower").map((n) => n.name),
    Team: O.kids(tower.id, "branch").map((n) => n.name),
    System: O.kids(branch.id, "system").map((n) => n.name),
    Trade: O.desc(branch.id, "trade").map((n) => n.name),
    "Default Shift": c.d.shifts.map((x) => x.id),
  };
  const keys = Object.keys(lists);
  keys.forEach((k, ci) => {
    ls.getCell(1, ci + 1).value = k;
    lists[k].forEach((v, ri) => (ls.getCell(ri + 2, ci + 1).value = v));
  });
  ls.state = "hidden";
  for (let r = 2; r <= 301; r++) {
    const row = ws.getRow(r);
    if (r <= 51) {
      row.getCell(3).value = "Member";
      row.getCell(4).value = dept.name;
      row.getCell(5).value = tower.name;
      row.getCell(6).value = branch.name;
      row.getCell(9).value = "D";
      row.getCell(11).value = 25;
      row.getCell(12).value = 5;
      row.getCell(13).value = 0;
    }
    keys.forEach((k, ci) => {
      const n = lists[k].length;
      if (!n) return;
      row.getCell(cols.indexOf(k) + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$${letter(ci)}$2:$${letter(ci)}$${n + 1}`],
        showErrorMessage: true,
        error: "Pick a value from the drop-down.",
      };
    });
    row.getCell(10).numFmt = "yyyy-mm-dd";
    [11, 12, 13].forEach(
      (cc) =>
        (row.getCell(cc).dataValidation = {
          type: "whole",
          allowBlank: true,
          operator: "between",
          formulae: [0, cc === 13 ? 5 : 40],
          showErrorMessage: true,
          error: cc === 13 ? "Carry-over is 0 to 5 days." : "Enter a whole number of days.",
        }),
    );
  }
  const name = `Workforce_members_${branch.name.replace(/[^A-Za-z0-9]+/g, "-")}.xlsx`;
  await save(await wb.xlsx.writeBuffer(), name);
  return name;
}

const cellText = (v: unknown): unknown => {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    return o.result ?? o.text ?? o.richText?.map((t) => t.text).join("") ?? "";
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v ?? "";
};

/**
 * Read an upload into row objects. Schedule workbooks from the template
 * (Status / Shift tabs) become one row per person and date: {Email, Name, Date, Code, Shift}.
 */
export async function readCalendarUpload(file: File, mode: UploadMode): Promise<UploadRow[]> {
  if (/\.csv$/i.test(file.name)) return rowsToObjects(parseCsv(await file.text()));
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const table = (name?: string) => {
    const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
    if (!ws) return null;
    const out: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const vals: unknown[] = [];
      for (let cc = 1; cc <= ws.columnCount; cc++) vals.push(cellText(row.getCell(cc).value));
      out[rn - 1] = vals;
    });
    return Array.from(out, (r) => r ?? []);
  };
  if (mode === "schedule" && (wb.getWorksheet("Status") || wb.getWorksheet("Shift"))) {
    const map: Record<string, UploadRow> = {};
    const grid = (name: string, key: "Code" | "Shift") => {
      const A = table(name);
      if (!A) return;
      const hi = A.findIndex((r) => lc(r[0]) === "name" && lc(r[1]) === "email");
      if (hi < 0) return;
      const H = A[hi];
      for (const r of A.slice(hi + 1)) {
        const em = lc(r[1]);
        if (!em && !r[0]) continue;
        H.forEach((hd, ci) => {
          if (ci < 2) return;
          const d = String(hd).slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
          const v = String(r[ci] ?? "").trim();
          if (!v) return;
          const k = em + "|" + d;
          const o = (map[k] ??= { Email: em, Name: r[0], Date: d, Code: "", Shift: "" });
          o[key] = v;
        });
      }
    };
    grid("Status", "Code");
    grid("Shift", "Shift");
    return Object.values(map);
  }
  const t = table(mode === "members" && wb.getWorksheet("Members") ? "Members" : undefined) ?? [];
  const rows = rowsToObjects(t);
  return mode === "members" ? rows.filter((r) => String(r.Name ?? "").trim() || String(r.Email ?? "").trim()) : rows;
}

/**
 * Headcount monitoring workbook: one sheet per tower, laid out like the team's existing
 * file — Cost Centre, Process, Employee, Sub Process, FTE, then Actual / Billed per month,
 * with totals without and with the team leads.
 */
export async function downloadHeadcount(towers: import("./headcount").HcTower[], year: number, title: string) {
  const { default: ExcelJS } = await import("exceljs");
  const { MONTHS } = await import("./headcount");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workforce Management";
  const NAVY = "FF0B2265";
  const GREY = "FFD9D9D9";
  const TEAM = "FFDCE3EF";
  const LEAD = "FF8EA9DB";
  const ZERO = "FFF8CBAD";
  const TOTAL = "FFEBF1DE";
  const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const used = new Set<string>();
  for (const t of towers) {
    // Sheet names: max 31 chars, unique, no []:*?/\
    let nm = t.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Tower";
    for (let i = 2; used.has(nm); i++) nm = `${nm.slice(0, 28)} ${i}`;
    used.add(nm);
    const ws = wb.addWorksheet(nm, { views: [{ state: "frozen", xSplit: 5, ySplit: 4 }] });
    ws.getCell(1, 1).value = `${title} ${year} – ${t.name.toUpperCase()}`;
    ws.getCell(1, 1).font = { bold: true, size: 12 };
    const hdr = ["Cost Centre", "PROCESS", "EMPLOYEE NAME", "Sub Process", "FTE Allocation"];
    hdr.forEach((h, i) => {
      ws.mergeCells(3, i + 1, 4, i + 1);
      const c = ws.getCell(3, i + 1);
      c.value = h;
    });
    MONTHS.forEach((m, i) => {
      const col = 6 + i * 2;
      ws.mergeCells(3, col, 3, col + 1);
      ws.getCell(3, col).value = m;
      ws.getCell(4, col).value = "Actual";
      ws.getCell(4, col + 1).value = "Billed";
    });
    const last = 5 + MONTHS.length * 2;
    for (let r = 3; r <= 4; r++)
      for (let c = 1; c <= last; c++) {
        const cell = ws.getCell(r, c);
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = border;
      }
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 22;
    ws.getColumn(3).width = 30;
    ws.getColumn(4).width = 24;
    ws.getColumn(5).width = 10;
    for (let c = 6; c <= last; c++) ws.getColumn(c).width = 7.5;

    let r = 5;
    for (const tm of t.teams) {
      const start = r;
      for (const row of tm.rows) {
        ws.getCell(r, 3).value = row.name;
        ws.getCell(r, 4).value = row.sub;
        ws.getCell(r, 5).value = row.fte;
        row.months.forEach((m, i) => {
          const col = 6 + i * 2;
          ws.getCell(r, col).value = m.actual;
          ws.getCell(r, col + 1).value = m.billed;
          for (const [cc, v] of [[col, m.actual], [col + 1, m.billed]] as const) {
            const cell = ws.getCell(r, cc);
            cell.alignment = { horizontal: "center" };
            if (v === null) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
            else if (v === 0 && m.actual === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZERO } };
          }
        });
        if (row.lead)
          for (let c = 3; c <= 5; c++) {
            ws.getCell(r, c).font = { bold: true };
            ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LEAD } };
          }
        for (let c = 3; c <= last; c++) ws.getCell(r, c).border = border;
        r++;
      }
      const end = Math.max(start, r - 1);
      if (r === start) r++; // empty team: keep one row
      if (end > start) {
        ws.mergeCells(start, 1, end, 1);
        ws.mergeCells(start, 2, end, 2);
      }
      ws.getCell(start, 1).value = tm.costCentre;
      ws.getCell(start, 2).value = tm.name;
      for (const c of [1, 2]) {
        const cell = ws.getCell(start, c);
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAM } };
        cell.border = border;
      }
      for (const [label, tot] of [[`Total ${tm.name} without TL`, tm.without], [`Total ${tm.name} with TL`, tm.withTl]] as const) {
        ws.mergeCells(r, 3, r, 5);
        ws.getCell(r, 3).value = label;
        ws.getCell(r, 3).alignment = { horizontal: "right" };
        tot.forEach((x, i) => {
          ws.getCell(r, 6 + i * 2).value = x.actual;
          ws.getCell(r, 7 + i * 2).value = x.billed;
        });
        for (let c = 3; c <= last; c++) {
          const cell = ws.getCell(r, c);
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL } };
          cell.border = border;
          if (c >= 6) cell.alignment = { horizontal: "center" };
        }
        r++;
      }
      r++;
    }
  }
  if (!towers.length) wb.addWorksheet("Headcount");
  await save(await wb.xlsx.writeBuffer(), `Headcount_${year}.xlsx`);
}
