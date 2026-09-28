"use client";

import { fieldOptions } from "./constants";
import type { UploadRow } from "./engine";
import type { TaskField, WlOrg, TaskType } from "./types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const colLetter = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/**
 * Task upload template built from the team's fields and its systems and trades
 * (from the Calendar): required columns get " *", list columns get drop-downs
 * from a hidden Lists sheet, 500 input rows.
 */
export async function downloadTaskTemplate(fields: TaskField[], org: WlOrg, types: TaskType[] = []) {
  // System is only needed when a trade name appears under two systems; a team that is
  // its own single unit needs neither column.
  const single = org.trades.length === 1 && org.trades[0].id === org.team.id;
  const tradeNames = [...new Set(org.trades.map((t) => t.name))];
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workforce Management";
  const ws = wb.addWorksheet("Tasks", { views: [{ state: "frozen", ySplit: 1 }] });
  const ls = wb.addWorksheet("Lists");

  const cols: [string, boolean, TaskField?][] = [
    ["Title", true],
    ...(single ? [] : org.systems.length ? ([["System", false]] as [string, boolean][]) : []),
    ...(single ? [] : ([["Trade", true]] as [string, boolean][])),
    ["Priority", false],
    ...(types.length ? ([["Task type", false]] as [string, boolean][]) : []),
    ["Received", false],
    ...fields.map((f): [string, boolean, TaskField] => [f.label, f.required, f]),
  ];
  const header = ws.getRow(1);
  header.values = cols.map(([l, r]) => l + (r ? " *" : ""));
  cols.forEach((_, i) => {
    const c = header.getCell(i + 1);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF416180" } };
    ws.getColumn(i + 1).width = i === 0 ? 40 : 18;
  });

  const lists: [string, string[]][] = [
    ...(org.systems.length && !single ? ([["System", org.systems.map((x) => x.name)]] as [string, string[]][]) : []),
    ...(single ? [] : ([["Trade", tradeNames]] as [string, string[]][])),
    ["Priority", ["High", "Normal", "Low"]],
    ...(types.length ? ([["Task type", types.map((t) => t.name)]] as [string, string[]][]) : []),
    ...fields.filter((f) => f.type === "select").map((f): [string, string[]] => [f.label, fieldOptions(f)]),
  ];
  lists.forEach(([k, v], ci) => {
    ls.getCell(1, ci + 1).value = k;
    v.forEach((x, ri) => (ls.getCell(ri + 2, ci + 1).value = x));
  });
  ls.state = "hidden";

  for (let r = 2; r <= 501; r++) {
    const row = ws.getRow(r);
    cols.forEach(([l, , f], ci) => {
      const cell = row.getCell(ci + 1);
      const li = lists.findIndex(([k]) => k === l);
      if (li >= 0) {
        const L = colLetter(li);
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Lists!$${L}$2:$${L}$${lists[li][1].length + 1}`],
          showErrorMessage: true,
          error: "Pick a value from the drop-down.",
        };
      }
      if (l === "Received") cell.numFmt = "yyyy-mm-dd hh:mm";
      if (f?.type === "date") cell.numFmt = "yyyy-mm-dd";
      if (f?.type === "number")
        cell.dataValidation = {
          type: "decimal",
          allowBlank: true,
          operator: "greaterThanOrEqual",
          formulae: [0],
          showErrorMessage: true,
          error: "Enter a number.",
        };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
  a.download = `Workload_tasks_${org.team.name.replace(/[^A-Za-z0-9]+/g, "-")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Header row → objects; strips the " *" required marker and drops empty rows. */
/** An Excel date cell as text: "2026-09-25 12:26:00", or "2026-09-25" when it has no time. */
export const excelDateText = (v: Date) => {
  if (isNaN(v.getTime())) return "";
  const s = v.toISOString();
  return s.slice(11, 19) === "00:00:00" ? s.slice(0, 10) : s.slice(0, 10) + " " + s.slice(11, 19);
};

export function rowsToObjects(table: unknown[][]): UploadRow[] {
  const [head = [], ...body] = table;
  const keys = head.map((h) => String(h ?? "").replace(/\s*\*$/, "").trim());
  return body
    .map((r) =>
      Object.fromEntries(
        keys.map((k, i) => {
          const v = r[i] ?? "";
          // Dates as text so rows survive the trip to the server as JSON: "yyyy-mm-dd hh:mm:ss"
          // (Excel shows team time; ExcelJS gives it in the UTC fields), or just the date at midnight.
          return [k, v instanceof Date ? excelDateText(v) : v];
        }),
      ),
    )
    .filter((o) => Object.values(o).some((v) => String(v).trim()));
}

/** Read an uploaded .xlsx (sheet "Tasks", else the first) or .csv into row objects. */
export async function readTaskFile(file: File): Promise<UploadRow[]> {
  if (/\.csv$/i.test(file.name)) return rowsToObjects(parseCsv(await file.text()));
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Tasks") ?? wb.worksheets[0];
  if (!ws) return [];
  const table: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: unknown[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value;
      // Rich text / formula / hyperlink cells → plain value.
      vals.push(
        v && typeof v === "object" && !(v instanceof Date)
          ? "result" in v ? v.result : "text" in v ? v.text : "richText" in v ? v.richText.map((t) => t.text).join("") : ""
          : v ?? "",
      );
    }
    table.push(vals);
  });
  return rowsToObjects(table);
}

/** A workbook of simple tables (first row = header), downloaded as .xlsx. */
export async function downloadSheets(fileName: string, sheets: { name: string; rows: (string | number | null)[][] }[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workforce Management";
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    sh.rows.forEach((r) => ws.addRow(r.map((v) => (v === null ? "" : v))));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF416180" } }));
    ws.columns.forEach((col, i) => {
      const w = Math.max(...sh.rows.map((r) => String(r[i] ?? "").length), 6);
      col.width = Math.min(48, w + 2);
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
