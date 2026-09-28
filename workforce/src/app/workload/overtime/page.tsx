"use client";

import { useEffect, useState } from "react";
import { Blueprint, PageHead } from "@/components/ui";
import { H, TZ_OFFSET_H, dayKey, fmtT } from "@/lib/workload/clock";
import { fmtMin, personOf } from "@/lib/workload/engine";
import { trPathOf } from "@/lib/workload/constants";
import { useWorkload } from "@/lib/workload/store";
import type { Activity } from "@/lib/workload/types";

/** Team-local midnight of a yyyy-mm-dd date. */
const dateMs = (d: string) => Date.parse(d + "T00:00:00Z") - TZ_OFFSET_H * H;
const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * Overtime reported at End work. Admins and the team's leads approve or decline it;
 * only approved overtime counts in the dashboard and this report.
 */
export default function OvertimePage() {
  const { data, run, me, now, isApprover, mode, toast } = useWorkload();
  const [range, setRange] = useState<"month" | "last" | "custom">("month");
  const today0 = dayKey(now);
  const [fromD, setFromD] = useState(today0.slice(0, 8) + "01");
  const [toD, setToD] = useState(today0);
  const [rows0, setRows0] = useState<Activity[] | null>(null);
  const name = (pid: number | null) => (pid === null ? "—" : (personOf(data, pid)?.name ?? `#${pid}`));
  const ends = data.activities.filter((a) => a.kind === "end" && a.otMin > 0);
  const typeName = (id?: string) => (id ? ((data.settings.taskTypes ?? []).find((t) => t.id === id)?.name ?? "Deleted type") : "");
  const partName = (x: { trade: string; ttype?: string }) => trPathOf(data.org, x.trade) + (x.ttype ? ` · ${typeName(x.ttype)}` : "");
  /** The entry's breakdown, or the whole overtime as one unassigned part. */
  const partsOf = (a: Activity) => (a.otSplit?.length ? a.otSplit : [{ trade: "", min: a.otMin }]);
  const pending = ends.filter((a) => a.otStatus === "pending").sort((a, b) => a.start - b.start);

  // Report period: this month, last month, or any From–To dates (inclusive).
  const ym = today0.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const [from, to] =
    range === "month"
      ? [dateMs(ym + "-01"), dateMs(nextMonth(ym) + "-01")]
      : range === "last"
        ? [dateMs(prev + "-01"), dateMs(ym + "-01")]
        : [dateMs(fromD), dateMs(toD) + 24 * H];
  const badRange = !(to > from) || !fromD || !toD;
  const want = range === "month" ? ym : range === "last" ? prev : `${fromD}_to_${toD}`;
  // Saved data: fetch the period from the server (the page itself holds about 5 weeks).
  const team = data.org.team.id;
  useEffect(() => {
    if (mode !== "db" || badRange) return;
    let live = true;
    setRows0(null);
    fetch(`/api/wl/overtime?team=${encodeURIComponent(team)}&from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) return toast(j.error || "The overtime report couldn’t be loaded.");
        setRows0(j.rows);
      })
      .catch(() => live && toast("The overtime report couldn’t be loaded."));
    return () => {
      live = false;
    };
  }, [mode, team, from, to, badRange, toast]);
  if (!isApprover) return null;
  const source = mode === "db" ? (rows0 ?? []) : ends.filter((a) => a.start >= from && a.start < to);
  const decided = badRange ? [] : source.filter((a) => a.otStatus !== "pending").sort((a, b) => b.start - a.start);
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
  // Approved overtime per process (and task type).
  const byProc = new Map<string, { name: string; min: number; people: Set<number> }>();
  decided
    .filter((a) => a.otStatus === "approved")
    .forEach((a) =>
      partsOf(a).forEach((x) => {
        const k = x.trade + "|" + ((x as { ttype?: string }).ttype ?? "");
        const r = byProc.get(k) ?? { name: x.trade ? partName(x) : "Not split by process", min: 0, people: new Set<number>() };
        r.min += x.min;
        r.people.add(a.pid);
        byProc.set(k, r);
      }),
    );
  const procRows = [...byProc.values()].sort((a, b) => b.min - a.min);

  const csv = () => {
    const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
    // One line per process the overtime was for.
    const body = [["Name", "Date", "Ended at", "Process", "Task type", "Overtime (min)", "Total that day (min)", "Status", "Decided by"].map(q).join(",")]
      .concat(
        decided.flatMap((a) =>
          partsOf(a).map((x) =>
            [name(a.pid), dayKey(a.start), fmtT(a.start), x.trade ? trPathOf(data.org, x.trade) : "", typeName((x as { ttype?: string }).ttype), x.min, a.otMin, a.otStatus ?? "", name(a.decidedBy)].map(q).join(","),
          ),
        ),
      )
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
                  <td>
                    <span style={{ fontWeight: 600 }}>{fmtMin(a.otMin)}</span>
                    {a.otSplit?.length ? (
                      <div className="small">{a.otSplit.map((x) => `${partName(x)} ${fmtMin(x.min)}`).join(" · ")}</div>
                    ) : null}
                  </td>
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
            <select aria-label="Period" className="input" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
              <option value="month">This month ({ym})</option>
              <option value="last">Last month ({prev})</option>
              <option value="custom">Choose dates…</option>
            </select>
            {range === "custom" && (
              <>
                <input aria-label="From" className="input" type="date" value={fromD} max={toD} onChange={(e) => setFromD(e.target.value)} style={{ width: "auto" }} />
                <span className="small">to</span>
                <input aria-label="To" className="input" type="date" value={toD} min={fromD} onChange={(e) => setToD(e.target.value)} style={{ width: "auto" }} />
              </>
            )}
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
        {procRows.length > 0 && (
          <>
            <h2 className="h2" style={{ marginTop: 10 }}>
              Approved overtime by process
            </h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Process</th>
                  <th>Approved</th>
                  <th>People</th>
                </tr>
              </thead>
              <tbody>
                {procRows.map((r) => (
                  <tr key={r.name}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td style={{ fontWeight: 600 }}>{fmtMin(r.min)}</td>
                    <td>{r.people.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Blueprint>
    </>
  );
}
