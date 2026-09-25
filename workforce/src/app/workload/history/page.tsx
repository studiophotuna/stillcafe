"use client";

import { useState } from "react";
import { TaskTable } from "@/components/TaskTable";
import { Blueprint, PageHead } from "@/components/ui";
import { PeriodNav } from "@/components/WorkloadBits";
import { dur } from "@/lib/workload/clock";
import { lc, trPathOf } from "@/lib/workload/constants";
import { due, holdPeriods, personOf, taskWorkMs, ticketField, ticketOf } from "@/lib/workload/engine";
import { periodLabel, periodRange, type PeriodKind } from "@/lib/workload/period";
import { useWorkload } from "@/lib/workload/store";
import { taskRow } from "@/lib/workload/view";

/**
 * Completed tasks by day, week or month: a member's own, or the team's for admins and
 * leads. Filter by trade, person and timeliness, search by title, ID, ticket or any
 * field, and download with start and finish times.
 */
export default function HistoryPage() {
  const { data, now, me, isAdmin, isApprover } = useWorkload();
  const lead = isAdmin || isApprover;
  const [scope, setScope] = useState<"me" | "team">(lead ? "team" : "me");
  const [p, setP] = useState<{ kind: PeriodKind; anchor: number }>({ kind: "week", anchor: now });
  const [trade, setTrade] = useState("all");
  const [who, setWho] = useState("all");
  const [timely, setTimely] = useState<"all" | "ontime" | "late">("all");
  const [q, setQ] = useState("");
  const ql = lc(q);
  const [from, to] = periodRange(p.kind, p.anchor);
  const s = data.settings;
  const tf = ticketField(data);
  const list = data.tasks
    .filter(
      (t) =>
        t.status === "done" &&
        t.doneAt !== null &&
        t.doneAt >= from &&
        t.doneAt < to &&
        (scope === "team" && lead ? who === "all" || String(t.assignee) === who : t.assignee === me.id) &&
        (trade === "all" || t.trade === trade) &&
        (timely === "all" || (timely === "late") === t.doneAt > due(t, s)) &&
        (!ql || lc(t.title + " " + t.id + " " + ticketOf(data, t) + " " + Object.values(t.fields).join(" ")).includes(ql)),
    )
    .sort((a, b) => b.doneAt! - a.doneAt!);
  const worked = list.reduce((a, t) => a + taskWorkMs(data, t, now), 0);
  const late = list.filter((t) => t.doneAt! > due(t, s)).length;
  const people = [...new Set(data.tasks.filter((t) => t.status === "done" && t.assignee !== null).map((t) => t.assignee!))]
    .map((id) => ({ id, name: personOf(data, id)?.name ?? `#${id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const csv = () => {
    const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : "");
    const q2 = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const head = ["Task ID", ...(tf ? [tf.label] : []), "Title", "System › Trade", "Done by", "Received", "Started", "Finished", "Worked (min)", "On time", "On hold (min)", "On hold dates", "On hold reasons"].concat(
      data.fields.filter((f) => f !== tf).map((f) => f.label),
    );
    const rows = list.map((t) =>
      [
        t.id,
        ...(tf ? [ticketOf(data, t)] : []),
        t.title,
        trPathOf(data.org, t.trade),
        personOf(data, t.assignee)?.name ?? "",
        iso(t.received),
        iso(t.startedAt),
        iso(t.doneAt),
        Math.round(taskWorkMs(data, t, now) / 60000),
        t.doneAt! <= due(t, s) ? "Yes" : "No",
        Math.round(holdPeriods(t, now).reduce((a, p) => a + ((p.to ?? now) - p.from), 0) / 60000),
        holdPeriods(t, now).map((p) => `${iso(p.from)} to ${iso(p.to)}`).join("; "),
        holdPeriods(t, now).map((p) => p.reason).join("; "),
      ].concat(data.fields.filter((f) => f !== tf).map((f) => String(t.fields[f.key] ?? ""))),
    );
    const body = [head, ...rows].map((r) => r.map(q2).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    a.download = `tasks-${data.org.team.name.replace(/[^A-Za-z0-9]+/g, "-")}-${periodLabel(p.kind, p.anchor, now).replace(/[^A-Za-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHead
        title={`Task history · ${scope === "team" && lead ? data.org.team.name : "My tasks"}`}
        sub="Completed tasks with when they were started and finished, the time worked (time on hold, breaks and other time away excluded) and time on hold. Open a task for its hold dates and reasons."
      />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <PeriodNav kind={p.kind} anchor={p.anchor} onChange={(kind, anchor) => setP({ kind, anchor })} kinds={["day", "week", "month"]} />
        <div className="row" style={{ alignItems: "flex-end" }}>
          {lead && (
            <div className="field">
              <label htmlFor="h-scope">Show</label>
              <select id="h-scope" className="input" value={scope} onChange={(e) => setScope(e.target.value as "me" | "team")} style={{ width: "auto" }}>
                <option value="team">Whole team</option>
                <option value="me">My tasks</option>
              </select>
            </div>
          )}
          {lead && scope === "team" && (
            <div className="field">
              <label htmlFor="h-who">Person</label>
              <select id="h-who" className="input" value={who} onChange={(e) => setWho(e.target.value)} style={{ width: "auto", minWidth: 160 }}>
                <option value="all">Everyone</option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {data.org.trades.length > 1 && (
            <div className="field">
              <label htmlFor="h-tr">Trade</label>
              <select id="h-tr" className="input" value={trade} onChange={(e) => setTrade(e.target.value)} style={{ width: "auto", minWidth: 140 }}>
                <option value="all">All trades</option>
                {data.org.trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {trPathOf(data.org, t.id)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="h-time">Timeliness</label>
            <select id="h-time" className="input" value={timely} onChange={(e) => setTimely(e.target.value as typeof timely)} style={{ width: "auto" }}>
              <option value="all">All</option>
              <option value="ontime">On time</option>
              <option value="late">Late</option>
            </select>
          </div>
          <input
            className="input"
            type="search"
            aria-label="Search completed tasks"
            placeholder={tf ? `Search title, ID, ${tf.label.toLowerCase()}…` : "Search title, ID…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 240 }}
          />
          <button className="btn btn-secondary btn-36" disabled={!list.length} onClick={csv}>
            Download CSV
          </button>
        </div>
      </div>
      <div className="banner">
        {list.length} completed · {dur(worked)} worked · average {list.length ? dur(worked / list.length) : "—"} · {late} late
      </div>
      <Blueprint className="scroll-x">
        <TaskTable variant="history" rows={list.map((t) => taskRow(data, t, me.id, isAdmin, now))} />
        {!list.length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>No completed tasks in this period.</div>}
      </Blueprint>
    </>
  );
}
