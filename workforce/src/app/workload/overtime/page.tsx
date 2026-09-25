"use client";

import { useState } from "react";
import { Blueprint, PageHead } from "@/components/ui";
import { dayKey, fmtT } from "@/lib/workload/clock";
import { fmtMin, personOf } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";

/**
 * Overtime reported at End work. Admins and the team's leads approve or decline it;
 * only approved overtime counts in the dashboard and this report.
 */
export default function OvertimePage() {
  const { data, run, me, now, isApprover } = useWorkload();
  const [range, setRange] = useState<"month" | "last">("month");
  if (!isApprover) return null;
  const name = (pid: number | null) => (pid === null ? "—" : (personOf(data, pid)?.name ?? `#${pid}`));
  const ends = data.activities.filter((a) => a.kind === "end" && a.otMin > 0);
  const pending = ends.filter((a) => a.otStatus === "pending").sort((a, b) => a.start - b.start);

  // Report period: this calendar month, or the previous one (the app keeps about 5 weeks).
  const today = dayKey(now);
  const ym = today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const want = range === "month" ? ym : prev;
  const decided = ends.filter((a) => a.otStatus !== "pending" && dayKey(a.start).startsWith(want)).sort((a, b) => b.start - a.start);
  const byPerson = new Map<number, { approved: number; days: number; declined: number }>();
  decided.forEach((a) => {
    const r = byPerson.get(a.pid) ?? { approved: 0, days: 0, declined: 0 };
    if (a.otStatus === "approved") {
      r.approved += a.otMin;
      r.days++;
    } else r.declined += a.otMin;
    byPerson.set(a.pid, r);
  });
  const rows = [...byPerson.entries()].sort((a, b) => b[1].approved - a[1].approved);

  const csv = () => {
    const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
    const body = [["Name", "Date", "Ended at", "Overtime (min)", "Status", "Decided by"].map(q).join(",")]
      .concat(decided.map((a) => [name(a.pid), dayKey(a.start), fmtT(a.start), a.otMin, a.otStatus ?? "", name(a.decidedBy)].map(q).join(",")))
      .join("\n");
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    el.download = `overtime-${data.org.team.name.replace(/[^A-Za-z0-9]+/g, "-")}-${want}.csv`;
    el.click();
    URL.revokeObjectURL(el.href);
  };

  return (
    <>
      <PageHead
        title={`Overtime · ${data.org.team.name}`}
        sub="Members report overtime when they end work after their shift. It counts in the dashboard and reports only once an admin or lead approves it. You can’t approve your own."
      />
      <Blueprint as="section" className="panel tight">
        <h2 className="h2">Waiting for approval · {pending.length}</h2>
        {pending.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Ended work</th>
                <th>Overtime</th>
                <th style={{ textAlign: "right" }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>
                    {name(a.pid)}
                    <div className="small">{personOf(data, a.pid)?.shift ?? ""}</div>
                  </td>
                  <td>{fmtT(a.start)}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMin(a.otMin)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {a.pid === me.id ? (
                        <span className="small">Another approver must decide</span>
                      ) : (
                        <>
                          <button className="btn btn-secondary btn-36" onClick={() => run({ type: "decideOt", id: a.id, st: "declined", by: me.id })}>
                            Decline
                          </button>
                          <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 16px" }} onClick={() => run({ type: "decideOt", id: a.id, st: "approved", by: me.id })}>
                            Approve
                          </Blueprint>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="small">Nothing waiting.</span>
        )}
      </Blueprint>

      <Blueprint as="section" className="panel tight">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 className="h2">Approved overtime</h2>
          <div className="row" style={{ gap: 8 }}>
            <select aria-label="Period" className="input" value={range} onChange={(e) => setRange(e.target.value as "month" | "last")}>
              <option value="month">This month ({ym})</option>
              <option value="last">Last month ({prev})</option>
            </select>
            <button className="btn btn-secondary btn-36" disabled={!decided.length} onClick={csv}>
              Download CSV
            </button>
          </div>
        </div>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Approved</th>
                <th>Days</th>
                <th>Declined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([pid, r]) => (
                <tr key={pid}>
                  <td style={{ fontWeight: 500 }}>{name(pid)}</td>
                  <td style={{ fontWeight: 600 }}>{r.approved ? fmtMin(r.approved) : "—"}</td>
                  <td>{r.days}</td>
                  <td>{r.declined ? fmtMin(r.declined) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="small">No overtime decided in this period.</span>
        )}
      </Blueprint>
    </>
  );
}
