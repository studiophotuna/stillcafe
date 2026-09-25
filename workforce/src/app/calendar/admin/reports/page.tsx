"use client";

import { useState } from "react";
import { bcpScopeOpts } from "@/components/calendar/CalDialogs";
import { Blueprint, Icon } from "@/components/ui";
import { daysInMonth, isoOf } from "@/lib/calendar/dates";
import { REPORT_TYPES, buildReport, toCsv, type ReportType } from "@/lib/calendar/reports";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

export default function ReportsPage() {
  const s = useCalendar();
  const v = useCalView();
  const { O } = s.cal;
  const mS = isoOf(s.y, s.m, 1);
  const mE = isoOf(s.y, s.m, daysInMonth(s.y, s.m));
  const [type, setType] = useState<ReportType>("attendance");
  const [scope0, setScope] = useState(v.dept.id);
  const [from, setFrom] = useState(mS);
  const [to0, setTo] = useState(mE);
  const [ev, setEv] = useState("");
  const scope = O.by[scope0] ? scope0 : v.dept.id;
  const to = to0 >= from ? to0 : from;
  const evs = s.data.bcpEvents.filter((e) => O.by[e.scope] && O.anc(e.scope).includes(v.dept.id));
  const evSel = evs.find((e) => e.id === ev)?.id ?? evs[0]?.id ?? "";
  const { rows, desc } = buildReport(s.cal, type, scope, from, to, evSel, v.dept.id);
  // Search across every column, then page through the matches.
  const [q, setQ] = useState("");
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const ql = q.trim().toLowerCase();
  const all = rows.slice(1);
  const body = ql ? all.filter((r) => r.some((cv) => String(cv).toLowerCase().includes(ql))) : all;
  const pages = size ? Math.max(1, Math.ceil(body.length / size)) : 1;
  const pg = Math.min(page, pages - 1);
  const shown = size ? body.slice(pg * size, pg * size + size) : body;
  const first = body.length ? (size ? pg * size + 1 : 1) : 0;
  const last = size ? Math.min(body.length, pg * size + size) : body.length;
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv([rows[0], ...body])], { type: "text/csv" }));
    a.download = `Workforce_${type}_${O.by[scope].name.split(" (")[0].replace(/[^A-Za-z0-9]+/g, "-")}_${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    s.toast("Report downloaded.");
  };
  return (
    <>
      <div className="page-head">
        <h1>Reports · {v.deptShort}</h1>
        <span>Generate CSV files for the whole department, a tower or a team. Open them in Excel.</span>
      </div>
      <Blueprint as="section" className="panel" style={{ gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, alignItems: "end" }}>
          <div className="field">
            <label htmlFor="rep-t">Report</label>
            <select id="rep-t" className="input" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
              {REPORT_TYPES.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rep-s">Scope</label>
            <select id="rep-s" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
              {bcpScopeOpts(s, v.dept.id).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rep-f">From</label>
            <input id="rep-f" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rep-to">To</label>
            <input id="rep-to" className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          {type === "bcp" && (
            <div className="field">
              <label htmlFor="rep-ev">BCP event</label>
              <select id="rep-ev" className="input" value={evSel} onChange={(e) => setEv(e.target.value)}>
                {evs.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-neutral-800)", maxWidth: "75ch" }}>{desc}</p>
          <Blueprint as="button" className="btn btn-primary btn-40" style={{ padding: "0 18px" }} disabled={!body.length} onClick={download}>
            <Icon name="download" size={16} />
            Download CSV ({body.length}{ql ? " matching" : ""} rows)
          </Blueprint>
        </div>
      </Blueprint>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <input
            className="input"
            type="search"
            aria-label="Search the report"
            placeholder="Search any column, e.g. a name or date"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            style={{ width: 300 }}
          />
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <span className="small" style={{ fontSize: 12.5 }}>
              {body.length ? `Rows ${first}–${last} of ${body.length}` : "No rows"}
              {ql && all.length !== body.length ? ` (filtered from ${all.length})` : ""}
            </span>
            <select
              aria-label="Rows per page"
              className="input"
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(0);
              }}
              style={{ width: "auto" }}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
              <option value={0}>All rows</option>
            </select>
            <button className="btn btn-secondary btn-36" disabled={pg === 0} onClick={() => setPage(pg - 1)}>
              ‹ Previous
            </button>
            <span className="small" style={{ fontSize: 12.5 }}>
              Page {pg + 1} of {pages}
            </span>
            <button className="btn btn-secondary btn-36" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>
              Next ›
            </button>
          </div>
        </div>
        <Blueprint className="report-scroll">
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>{rows[0].map((h, i) => <th key={i} className="nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>{r.map((cv, j) => <td key={j} className="nowrap">{String(cv)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {!body.length && <div style={{ padding: "20px 14px", color: "var(--color-neutral-700)" }}>{ql ? "No rows match your search." : "No rows for this report and period."}</div>}
        </Blueprint>
      </div>
    </>
  );
}
