"use client";

import { useEffect, useState } from "react";
import { Blueprint } from "@/components/ui";
import { fmtY } from "@/lib/calendar/dates";
import { attendanceSummary, leadSummary, summaryText, type SummaryBlock } from "@/lib/calendar/summary";
import { useCalendar } from "@/lib/calendar/store";

/**
 * Attendance summary for a day: each team (people with a status / headcount), then each
 * system with its RTO, WFH, leave … counts. Copy gives the same as text for chat or email.
 */
export function AttendanceSummary({ scope, date0 }: { scope: string; date0: string }) {
  const s = useCalendar();
  const [date, setDate] = useState(date0);
  const [by, setBy] = useState<"team" | "lead">("team");
  useEffect(() => {
    try {
      if (localStorage.getItem("wfm.attBy") === "lead") setBy("lead");
    } catch {}
  }, []);
  const pickBy = (v: "team" | "lead") => {
    setBy(v);
    try {
      localStorage.setItem("wfm.attBy", v);
    } catch {}
  };
  const blocks: (SummaryBlock & { lead?: string })[] = by === "lead" ? leadSummary(s.cal, scope, date) : attendanceSummary(s.cal, scope, date);
  const text = summaryText(blocks, by === "lead" ? " - " : " ");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Attendance · ${fmtY(date)}\n\n` + text);
      s.toast("Summary copied.");
    } catch {
      s.toast("Couldn’t copy. Select the text and copy it instead.");
    }
  };
  return (
    <Blueprint as="section" className="panel" style={{ gap: 12 }}>
      <div className="chart-head">
        <h2 className="h2">Attendance summary</h2>
        <div className="row" style={{ gap: 8 }}>
          <div className="tabs" role="tablist" aria-label="Group by">
            <button role="tab" aria-selected={by === "team"} onClick={() => pickBy("team")}>
              By system
            </button>
            <button role="tab" aria-selected={by === "lead"} onClick={() => pickBy("lead")}>
              By lead
            </button>
          </div>
          <button className={"btn btn-36 " + (date === s.today ? "btn-primary" : "btn-secondary")} onClick={() => setDate(s.today)}>
            Today
          </button>
          <input aria-label="Date" className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 160, height: 36 }} />
          <button className="btn btn-secondary btn-36" onClick={copy} disabled={!blocks.length}>
            Copy
          </button>
        </div>
      </div>
      {blocks.length ? (
        <div className="att-sum">
          {blocks.map((b) => (
            <div key={b.id} className={"att-block " + (b.level === "team" ? "att-team" : "att-sys")}>
              <div className="att-head">
                <span>
                  {b.name}
                  {b.lead && <span className="small"> · {b.lead}</span>}
                </span>
                <strong>
                  {b.withStatus}/{b.headcount}
                </strong>
              </div>
              {b.detail &&
                (b.lines.length ? (
                  <ul>
                    {b.lines.map((l) => (
                      <li key={l.code}>
                        <span>{l.code}</span>
                        <span>
                          {l.n}
                          {l.shifts && <span className="small"> ({l.shifts})</span>}
                          {l.pending ? <span className="small"> · {l.pending} pending</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="small">No one scheduled</span>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <span className="small">{by === "lead" ? "No team leads with members in this scope." : "No one in this scope."}</span>
      )}
      <span className="small">
        {by === "lead"
          ? "By lead: each team lead’s members (their assigned approver, else the lead allocated above them), named after the lead’s allocations. "
          : ""}
        With status / headcount: people with a schedule or leave that day out of everyone in the group. Midshift and GY in brackets are among those counts.
      </span>
    </Blueprint>
  );
}
