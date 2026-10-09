"use client";

import { useEffect, useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Blueprint, PageHead } from "@/components/ui";
import { rangeMs, type DateRange } from "@/lib/workload/period";
import { dayKey, fmtT } from "@/lib/workload/clock";
import { OT_KIND, fmtMin, personOf } from "@/lib/workload/engine";
import { trPathOf } from "@/lib/workload/constants";
import { useWorkload } from "@/lib/workload/store";
import { useUnit } from "@/lib/workload/useUnit";
import type { Activity } from "@/lib/workload/types";

/**
 * Overtime reported at End work. Admins and the team's leads approve or decline it;
 * only approved overtime counts in the dashboard and this report.
 */
export default function OvertimePage() {
  const { data, run, me, now, isApprover, mode, toast, sys, tr } = useWorkload();
  // The System › Trade filter: only overtime for the selected processes (a split entry
  // counts its parts there; an unsplit one counts when the person works there).
  const { unitTrades, people: unitPeople, unitLabel } = useUnit();
  const filtered = sys !== "all" || tr !== "all";
  const inTrades = new Set(unitTrades.map((t) => t.id));
  const inPeople = new Set(unitPeople.map((p) => p.id));
  const today0 = dayKey(now);
  // This month so far by default; Today or any From – To dates.
  const [range, setRange] = useState<DateRange>({ from: today0.slice(0, 8) + "01", to: today0 });
  const [rows0, setRows0] = useState<Activity[] | null>(null);
  const name = (pid: number | null) => (pid === null ? "—" : (personOf(data, pid)?.name ?? `#${pid}`));
  const ends = data.activities.filter((a) => a.kind === "end" && a.otMin > 0);
  const typeName = (id?: string) => (id ? ((data.settings.taskTypes ?? []).find((t) => t.id === id)?.name ?? "Deleted type") : "");
  const partName = (x: { trade: string; ttype?: string }) => trPathOf(data.org, x.trade) + (x.ttype ? ` · ${typeName(x.ttype)}` : "");
  /** The entry's breakdown, or the whole overtime as one unassigned part. */
  const allParts = (a: Activity) => (a.otSplit?.length ? a.otSplit : [{ trade: "", min: a.otMin }]);
  const partsOf = (a: Activity) => (filtered ? allParts(a).filter((x) => (x.trade ? inTrades.has(x.trade) : inPeople.has(a.pid))) : allParts(a));
  /** Minutes of the entry in the filter. */
  const minOf = (a: Activity) => partsOf(a).reduce((n, x) => n + x.min, 0);
  const pending = ends.filter((a) => a.otStatus === "pending" && minOf(a) > 0).sort((a, b) => a.start - b.start);
  // Overtime pre-approval answers: today's Yes, and the remarks behind a reported entry.
  const plans = data.activities.filter((a) => a.kind === "otplan");
  const planFor = (a: Activity) => plans.find((x) => x.pid === a.pid && dayKey(x.start) === dayKey(a.start));
  const expected = plans.filter((x) => x.plan === "yes" && dayKey(x.start) === today0 && (!filtered || inPeople.has(x.pid))).sort((a, b) => a.start - b.start);

  // Report period (inclusive dates).
  const [from, to] = rangeMs(range);
  const badRange = !range;
  const want = range ? `${range.from}_to_${range.to}` : "all";
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
  const decided = badRange ? [] : source.filter((a) => a.otStatus !== "pending" && minOf(a) > 0).sort((a, b) => b.start - a.start);
  const byPerson = new Map<number, { approved: number; days: number; declined: number }>();
  decided.forEach((a) => {
    const r = byPerson.get(a.pid) ?? { approved: 0, days: 0, declined: 0 };
    if (a.otStatus === "approved") {
      r.approved += minOf(a);
      r.days++;
    } else r.declined += minOf(a);
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
  // Approved overtime by type: regular (after the shift), holiday duty, rest day OT.
  const kindOf = (a: Activity) => (a.otKind ? OT_KIND[a.otKind] : "Regular overtime");
  const byKind = new Map<string, { min: number; people: Set<number> }>();
  decided
    .filter((a) => a.otStatus === "approved")
    .forEach((a) => {
      const r = byKind.get(kindOf(a)) ?? { min: 0, people: new Set<number>() };
      r.min += minOf(a);
      r.people.add(a.pid);
      byKind.set(kindOf(a), r);
    });

  const csv = () => {
    const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
    // One line per process the overtime was for.
    const body = [["Name", "Date", "Ended at", "Overtime type", "Process", "Task type", "Overtime (min)", "Total that day (min)", "Status", "Decided by"].map(q).join(",")]
      .concat(
        decided.flatMap((a) =>
          partsOf(a).map((x) =>
            [name(a.pid), dayKey(a.start), fmtT(a.start), kindOf(a), x.trade ? trPathOf(data.org, x.trade) : "", typeName((x as { ttype?: string }).ttype), x.min, a.otMin, a.otStatus ?? "", name(a.decidedBy)].map(q).join(","),
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
        title={`Overtime · ${filtered ? unitLabel : data.org.team.name}`}
        sub="Members report overtime when they end work after their shift, and on holiday duty or a rest day they work (all of that day counts). It counts in the dashboard and reports only once an admin or lead approves it. You can’t approve your own."
      />
      {data.settings.otPrompt?.on && (
        <Blueprint as="section" className="panel tight">
          <h2 className="h2">Expected overtime today · {expected.length}</h2>
          <span className="small">Members who answered Yes to the overtime pre-approval near the end of their shift. They report the actual time at End work.</span>
          {expected.length ? (
            <table className="table">
              <tbody>
                {expected.map((x) => (
                  <tr key={x.id}>
                    <td style={{ fontWeight: 500 }}>{name(x.pid)}</td>
                    <td className="nowrap">{fmtT(x.start)}</td>
                    <td>{x.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <span className="small">No one yet.</span>
          )}
        </Blueprint>
      )}
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
                    {a.otKind && (
                      <span className="tag tag-amber" style={{ marginLeft: 8 }}>
                        {OT_KIND[a.otKind]}
                      </span>
                    )}
                    {a.otSplit?.length ? (
                      <div className="small">{a.otSplit.map((x) => `${partName(x)} ${fmtMin(x.min)}`).join(" · ")}</div>
                    ) : null}
                    {planFor(a)?.note && <div className="small">Pre-approval: {planFor(a)!.note}</div>}
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
            <DateRangePicker value={range} onChange={setRange} today={today0} id="ot" />
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
        {byKind.size > 0 && (
          <>
            <h2 className="h2" style={{ marginTop: 10 }}>
              Approved overtime by type
            </h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Approved</th>
                  <th>People</th>
                </tr>
              </thead>
              <tbody>
                {[...byKind.entries()].map(([k, r]) => (
                  <tr key={k}>
                    <td style={{ fontWeight: 500 }}>{k}</td>
                    <td style={{ fontWeight: 600 }}>{fmtMin(r.min)}</td>
                    <td>{r.people.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
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
