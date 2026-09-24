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
