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
  const body = rows.slice(1);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
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
            Download CSV ({body.length} rows)
          </Blueprint>
        </div>
      </Blueprint>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="small" style={{ fontSize: 12 }}>Preview · {Math.min(12, body.length)} of {body.length} rows</span>
        <Blueprint className="scroll-x">
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>{rows[0].map((h, i) => <th key={i} className="nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {body.slice(0, 12).map((r, i) => (
                <tr key={i}>{r.map((cv, j) => <td key={j} className="nowrap">{String(cv)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Blueprint>
      </div>
    </>
  );
}
