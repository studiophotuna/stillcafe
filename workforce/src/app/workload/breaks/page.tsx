"use client";

import { useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Blueprint, PageHead } from "@/components/ui";
import { dayKey } from "@/lib/workload/clock";
import { breakAllowance, breakFlags } from "@/lib/workload/breaks";
import { fmtMin, personOf } from "@/lib/workload/engine";
import { rangeMs, todayRange, type DateRange } from "@/lib/workload/period";
import { useWorkload } from "@/lib/workload/store";
import { useUnit } from "@/lib/workload/useUnit";

/**
 * Leads: members whose break and lunch together went over the allowance. Each flag goes
 * to the member's assigned approver; every lead of the team can still see them all.
 */
export default function BreaksPage() {
  const { data, now, me, isApprover, sys, tr } = useWorkload();
  const [range, setRange] = useState<DateRange>(todayRange(now));
  const [from, to] = rangeMs(range);
  // Follows the System › Trade filter: members allocated there.
  const { people: unitPeople, unitLabel } = useUnit();
  const inUnit = new Set(unitPeople.map((p) => p.id));
  const all = breakFlags(data, from, to, now).filter((f) => sys === "all" && tr === "all" ? true : inUnit.has(f.pid));
  const approverOf = (pid: number) => personOf(data, pid)?.approver;
  const mineAny = all.some((f) => approverOf(f.pid) === me.id);
  const [who, setWho] = useState(mineAny ? "me" : "all");
  const flags = all.filter((f) => who === "all" || approverOf(f.pid) === me.id);
  const allowed = breakAllowance(data);
  if (!isApprover) return null;
  const name = (pid?: number) => (pid === undefined ? "" : (personOf(data, pid)?.name ?? "—"));
  const fmtDay = (k: string) => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <>
      <PageHead
        title={`Breaks over the allowance · ${unitLabel}`}
        sub={`Members whose break and lunch together went over ${fmtMin(allowed)} in a day (the planned breaks in Admin › Targets). Each is flagged to their approver; every lead of the team sees them all.`}
      />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <DateRangePicker value={range} onChange={(r) => setRange(r ?? todayRange(now))} today={dayKey(now)} id="brk" />
        <div className="field">
          <label htmlFor="brk-who">Show</label>
          <select id="brk-who" className="input" value={who} onChange={(e) => setWho(e.target.value)} style={{ width: "auto" }}>
            <option value="me">Assigned to me</option>
            <option value="all">Everyone in the team</option>
          </select>
        </div>
      </div>
      <Blueprint as="section" className="panel tight scroll-x">
        {flags.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Day</th>
                <th style={{ textAlign: "right" }}>Break + lunch</th>
                <th style={{ textAlign: "right" }}>Allowance</th>
                <th style={{ textAlign: "right" }}>Over by</th>
                <th>Approver</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.pid + f.day}>
                  <td style={{ fontWeight: 500 }}>{name(f.pid)}</td>
                  <td className="nowrap">{fmtDay(f.day)}</td>
                  <td style={{ textAlign: "right" }}>{fmtMin(f.min)}</td>
                  <td style={{ textAlign: "right" }} className="muted">
                    {fmtMin(f.allowed)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="tag tag-amber">{fmtMin(f.over)}</span>
                  </td>
                  <td>{approverOf(f.pid) === me.id ? "You" : name(approverOf(f.pid)) || <span className="muted">Team leads</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="small">No one went over {fmtMin(allowed)} of break and lunch{who === "me" ? " among the members assigned to you" : ""} in this period.</span>
        )}
      </Blueprint>
      <span className="small">Break and lunch are counted from Time away on My work (ongoing ones up to now). Break and lunch history is kept for the last 5 weeks.</span>
    </>
  );
}
