"use client";

import { useEffect, useMemo, useState } from "react";
import { Blueprint, Icon, Kpi, PageHead, pct } from "@/components/ui";
import { PeriodNav } from "@/components/WorkloadBits";
import { H, dayKey, dur, fmtT } from "@/lib/workload/clock";
import { AV, PR, tradeOf, trPathOf } from "@/lib/workload/constants";
import { awayLabel, cxCheck, cxOn, cxText, basisUnit, due, fmtMin, isOverdue, slaOf, slaText, taskTypeOf, taskWorkMs, ticketField, ticketOf, typeTargets } from "@/lib/workload/engine";
import { downloadSheets } from "@/lib/workload/excel";
import { ahtStats } from "@/lib/workload/aht";
import { BarList, ColumnChart, LineChart, VIZ } from "@/components/Charts";
import { personPeriod, teamPeriod, typeLabel, type PeriodInput, type PersonPeriod } from "@/lib/workload/metrics";
import { periodBuckets, periodLabel, periodRange, type PeriodKind } from "@/lib/workload/period";
import { useWorkload } from "@/lib/workload/store";
import type { Activity, Task } from "@/lib/workload/types";
import { useUnit } from "@/lib/workload/useUnit";

const KINDS: PeriodKind[] = ["day", "week", "month", "year"];
const ACT_DAYS = 34; // activity already loaded with the team (the server loads 35 days)

/**
 * Working days per person and time away for the period: from the server (Calendar and
 * saved activity), or sample weekdays in demo mode.
 */
function usePeriodInput(from: number, to: number): { input: PeriodInput | null; error: string } {
  const { data, now, mode } = useWorkload();
  const [got, setGot] = useState<{ key: string; workDays: PeriodInput["workDays"]; activities: Activity[] } | null>(null);
  const [error, setError] = useState("");
  const team = data.org.team.id;
  const key = `${team}|${from}|${to}`;
  useEffect(() => {
    if (mode !== "db") return;
    let live = true;
    setError("");
    fetch(`/api/wl/period?team=${encodeURIComponent(team)}&from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setError(j.error || "The dashboard couldn’t be loaded.");
        else setGot({ key, workDays: j.workDays ?? {}, activities: j.activities ?? [] });
      })
      .catch(() => live && setError("The dashboard couldn’t be loaded. Check your connection."));
    return () => {
      live = false;
    };
  }, [mode, team, from, to, key]);
  // Days count from when the team started using Workload (its first task), so earlier
  // months don't show as days worked with nothing done.
  const start = useMemo(() => (data.tasks.length ? dayKey(Math.min(...data.tasks.map((t) => t.received))) : dayKey(now)), [data.tasks, now]);
  return useMemo(() => {
    const since = (w: PeriodInput["workDays"]) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.filter((x) => x >= start)]));
    if (mode !== "db") {
      const workDays: PeriodInput["workDays"] = {};
      const today = dayKey(now);
      for (const p of data.people) {
        const days: string[] = [];
        for (let t = from; t < to && dayKey(t) <= today; t += 24 * H) {
          const dow = new Date(t + 8 * H).getUTCDay();
          if (dow !== 0 && dow !== 6 && (dayKey(t) !== today || p.avail !== "leave")) days.push(dayKey(t));
        }
        workDays[p.id] = days;
      }
      return { input: { from, to, now, workDays: since(workDays), activities: data.activities }, error: "" };
    }
    if (!got || got.key !== key) return { input: null, error };
    // Recent activity is already loaded with the team and stays current; older periods use the server's.
    const recent = from >= now - ACT_DAYS * 24 * H;
    return { input: { from, to, now, workDays: since(got.workDays), activities: recent ? data.activities : got.activities }, error };
  }, [mode, got, key, from, to, now, data.people, data.activities, error, start]);
}

export default function DashboardPage() {
  const { data, now, toast } = useWorkload();
  const { inUnit, unitTrades, people, unitLabel } = useUnit();
  const [per, setPer] = useState<{ kind: PeriodKind; anchor: number }>({ kind: "day", anchor: now });
  const [from, to] = periodRange(per.kind, per.anchor);
  const live = now >= from && now < to;
  const { input, error } = usePeriodInput(from, to);
  const s = data.settings;
  const ut = useMemo(() => data.tasks.filter(inUnit), [data.tasks, inUnit]);
  const weighted = typeTargets(data);
  const metricF = data.fields.filter((f) => f.type === "number" && f.metric);
  const types = s.taskTypes ?? [];
  const label = periodLabel(per.kind, per.anchor, now);

  const view = useMemo(() => {
    if (!input) return null;
    const until = Math.min(now, to);
    const withActs = { ...data, activities: input.activities };
    const rows = people
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => personPeriod(data, p, input));
    const team = teamPeriod(data, rows, ut, input);
    const doneIn = (l: Task[]) => l.filter((t) => t.status === "done" && t.doneAt !== null && t.doneAt >= from && t.doneAt < until);
    const onTimePct = (l: Task[]) => (l.length ? Math.round((l.filter((t) => t.doneAt! <= due(t, data)).length / l.length) * 100) : null);
    const avgOf = (l: Task[]) => {
      const x = l.filter((t) => t.startedAt);
      return x.length ? x.reduce((a, t) => a + taskWorkMs(withActs, t, until), 0) / x.length : null;
    };
    const received = (l: Task[]) => l.filter((t) => t.received >= from && t.received < to).length;
    // A day breaks down by hour (productivity is a daily measure, so none per hour).
    const hourly = per.kind === "day";
    const parts: [string, number, number][] = hourly
      ? Array.from({ length: 24 }, (_, h): [string, number, number] => [`${String(h).padStart(2, "0")}:00`, from + h * H, from + (h + 1) * H])
      : periodBuckets(per.kind, per.anchor);
    const buckets = parts.map(([name, a, b]) => {
      const short = hourly ? name.slice(0, 2) : per.kind === "week" ? name.slice(0, 3) : per.kind === "month" ? name.split(" ")[1] : name;
      if (a > now) return { name, short, future: true, received: 0, done: 0, onTime: null as number | null, prod: null as number | null };
      const sub = { ...input, from: a, to: b };
      const t2 = teamPeriod(data, rows.map((r) => personPeriod(data, r.p, sub)), ut, sub);
      return { name, short, future: false, received: t2.received, done: t2.done, onTime: t2.time, prod: hourly ? null : t2.prod };
    });
    const byTrade = unitTrades.map((tr) => {
      const g = ut.filter((t) => t.trade === tr.id);
      const d = doneIn(g);
      return {
        id: tr.id,
        path: trPathOf(data.org, tr.id),
        received: received(g),
        done: d.length,
        onTime: onTimePct(d),
        avg: avgOf(d),
        queue: g.filter((t) => t.status === "new").length,
        assigned: g.filter((t) => t.status === "assigned").length,
        prog: g.filter((t) => t.status === "in_progress").length,
        hold: g.filter((t) => t.status === "on_hold").length,
        overdue: g.filter((t) => isOverdue(t, data, now)).length,
      };
    });
    const byType = types.length
      ? [{ id: "", name: "Standard requests", sla: "By priority", target: "Member’s target" }]
          .concat(types.map((x) => ({ id: x.id, name: x.name, sla: slaText(x.sla), target: x.target ? String(x.target) : "Member’s target" })))
          .map((x) => {
            const g = ut.filter((t) => (t.ttype ?? "") === x.id || (x.id === "" && !!t.ttype && !taskTypeOf(s, t)));
            const d = doneIn(g);
            return { ...x, received: received(g), done: d.length, onTime: onTimePct(d), open: g.filter((t) => t.status !== "done").length };
          })
      : [];
    const markIdx = parts.findIndex(([, a, b]) => now >= a && now < b);
    // Average handling time per contract of each complexity level (tickets done in the period).
    const aht = cxOn(s) ? ahtStats({ ...withActs, tasks: ut }, from, until + 1).levels : [];
    return { aht, rows, team, buckets, markIdx: markIdx < 0 ? undefined : markIdx, byTrade, byType, doneTasks: doneIn(ut).sort((a, b) => a.doneAt! - b.doneAt!), until, withActs };
  }, [input, now, to, from, people, data, ut, unitTrades, types, per.kind, per.anchor, s]);

  const q = ut.filter((t) => t.status === "new");
  const oldest = q.length ? dur(now - Math.min(...q.map((t) => t.received))) : "—";
  const sumF = (l: Task[], k: string) => l.reduce((a, t) => a + (Number(t.fields[k]) || 0), 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const shareText = (r: PersonPeriod) => (weighted ? `${r2(r.share)} of ${r2(r.days)} days` : `target ${Math.round(r.target * r.days * 10) / 10}`);

  const exportXlsx = async () => {
    if (!view) return;
    const tf = ticketField(data);
    const T = (ms: number | null) => (ms ? fmtT(ms) : "");
    const min = (ms: number | null) => (ms === null ? "" : Math.round(ms / 60000));
    type Row = (string | number | null)[];
    const sheets: { name: string; rows: Row[] }[] = [
      {
        name: "Summary",
        rows: [
          ["Measure", "Value"],
          ["Team", unitLabel],
          ["Period", label],
          ["Productivity %", view.team.prod],
          ["Utilization %", view.team.util],
          ["Timeliness %", view.team.time],
          ["Received", view.team.received],
          ["Done", view.team.done],
          ["Done within SLA", view.team.onTime],
          ["Average time per task (min)", min(view.team.avgMs)],
          ["Approved overtime (min)", view.team.otMin],
          ["Time away (min)", view.team.awayMin],
          ...metricF.map((f): Row => [f.label, sumF(view.doneTasks, f.key)]),
          ["Exported", fmtT(now)],
        ],
      },
    ];
    if (view.buckets.length)
      sheets.push({
        name: per.kind === "day" ? "By hour" : per.kind === "year" ? "By month" : "By day",
        rows: [
          ["Period", "Received", "Done", "Timeliness %", "Productivity %"],
          ...view.buckets.map((b): Row => (b.future ? [b.name, null, null, null, null] : [b.name, b.received, b.done, b.onTime, b.prod])),
        ],
      });
    sheets.push({
      name: "People",
      rows: [
        ["Name", "Trades", "Days worked", "Done", weighted ? "Days of target done" : "Target for the days worked", "Productivity %", "Utilization %", "Timeliness %", "Avg time (min)", "Time away (min)", ...metricF.map((f) => f.label), "Overtime approved (min)", "Overtime pending (min)"],
        ...view.rows.map((r): Row => [
          r.p.name,
          r.p.trades.map((x) => tradeOf(data.org, x)?.name ?? x).join(", "),
          r2(r.days),
          r.done.length,
          weighted ? r2(r.share) : Math.round(r.target * r.days * 10) / 10,
          r.prod,
          r.util,
          r.time,
          min(r.avgMs),
          r.awayMin,
          ...metricF.map((f) => sumF(r.done, f.key)),
          r.otMin,
          r.otPending,
        ]),
      ],
    });
    sheets.push({
      name: "Trades",
      rows: [["System › Trade", "Received", "Done", "Timeliness %", "Avg time (min)"], ...view.byTrade.map((b): Row => [b.path, b.received, b.done, b.onTime, min(b.avg)])],
    });
    if (view.byType.length)
      sheets.push({
        name: "Task types",
        rows: [["Task type", "SLA", "Target / day", "Received", "Done", "Timeliness %"], ...view.byType.map((b): Row => [b.name, b.sla, b.target, b.received, b.done, b.onTime])],
      });
    if (view.aht.length)
      sheets.push({
        name: "AHT by complexity",
        rows: [
          ["Level", "Set AHT (min)", "Actual AHT / contract (min)", "Contracts", "Tickets"],
          ...view.aht.map(({ level, row }): Row => [level.name, level.aht ?? null, row.contracts ? Math.round(row.ms / row.contracts / 60000) : null, row.contracts, row.tickets]),
        ],
      });
    sheets.push({
      name: "Tasks done",
      rows: [
        ["Task ID", ...(tf ? [tf.label] : []), "Title", "System › Trade", "Task type", "Priority", "SLA (h)", "Received", "Due", "Started", "Finished", "Worked (min)", "On time", "Done by", ...(cxOn(s) ? ["Complexity", "Expected (min)", "Complexity check"] : []), ...data.fields.filter((f) => f !== tf).map((f) => f.label)],
        ...view.doneTasks.map((t): Row => [
          t.id,
          ...(tf ? [ticketOf(data, t)] : []),
          t.title,
          trPathOf(data.org, t.trade),
          typeLabel(data, t),
          PR[t.pr][0],
          slaOf(t, s),
          T(t.received),
          T(due(t, data)),
          T(t.startedAt),
          T(t.doneAt),
          min(taskWorkMs(view.withActs, t, view.until)),
          t.doneAt! <= due(t, data) ? "Yes" : "No",
          data.people.find((p) => p.id === t.assignee)?.name ?? "",
          ...(cxOn(s)
            ? (() => {
                const c = cxCheck(data, t);
                const r = t.cxReview;
                return [
                  t.cx ? cxText(s, t.cx) : "",
                  c ? min(c.expMs) : "",
                  r ? (r.verdict === "ok" ? "Confirmed" : "Corrected") : c?.flag ? "Question" : "",
                ];
              })()
            : []),
          ...data.fields.filter((f) => f !== tf).map((f) => String(t.fields[f.key] ?? "")),
        ]),
      ],
    });
    try {
      await downloadSheets(`Workload_dashboard_${unitLabel.replace(/[^A-Za-z0-9]+/g, "-")}_${label.replace(/[^A-Za-z0-9]+/g, "-")}.xlsx`, sheets);
    } catch {
      toast("The export couldn’t be created. Try again.");
    }
  };

  return (
    <>
      <PageHead
        title={`Dashboard · ${unitLabel}`}
        style={{ maxWidth: "95ch" }}
        sub="Productivity = work done ÷ target for the days worked (days scheduled in the Calendar since the team started using Workload; today so far), plus the tasks that fit in any overtime (whole tasks at the daily pace, e.g. 4 a day in 6.8 productive hours: 3 h adds 1). Utilization = time on tasks ÷ available time. Timeliness = tasks done within SLA ÷ tasks done. Targets and working time are set in Admin › Targets."
      />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <PeriodNav kind={per.kind} anchor={per.anchor} onChange={(kind, anchor) => setPer({ kind, anchor })} kinds={KINDS} />
        <button className="btn btn-secondary btn-36" disabled={!view} onClick={exportXlsx}>
          <Icon name="download" size={16} />
          Export to Excel
        </button>
      </div>
      {error && <div className="banner">{error}</div>}
      {!view ? (
        !error && <div className="banner">Loading {label}…</div>
      ) : (
        <>
          <div className="grid-kpi dense">
            <Kpi k="Productivity" v={pct(view.team.prod)} m={`${label}`} />
            <Kpi k="Utilization" v={pct(view.team.util)} m="task time ÷ available time" />
            <Kpi k="Timeliness" v={pct(view.team.time)} m={`${view.team.onTime} of ${view.team.done} within SLA`} />
            <Kpi k="Received" v={view.team.received} m="tasks in the period" />
            <Kpi k="Done" v={view.team.done} m="tasks in the period" />
            <Kpi k="Average time" v={view.team.avgMs === null ? "—" : dur(view.team.avgMs)} m="worked per task" />
            <Kpi k="Overtime" v={view.team.otMin ? fmtMin(view.team.otMin) : "—"} m="approved" />
            <Kpi k="Time away" v={view.team.awayMin ? fmtMin(view.team.awayMin) : "—"} m="breaks, meetings, training…" />
            {metricF.map((f) => (
              <Kpi key={f.key} k={f.label.replace(/^No\. of /, "")} v={sumF(view.doneTasks, f.key)} m="completed" />
            ))}
            {live && <Kpi k="In queue now" v={q.length} m={`oldest waiting ${oldest}`} />}
            {live && <Kpi k="Overdue now" v={ut.filter((t) => isOverdue(t, data, now)).length} m="open past their SLA" />}
          </div>

          <div className="chart-grid">
            <Blueprint as="section" className="panel">
              <div className="chart-head">
                <h2 className="h2">Received and done</h2>
                <span className="small">{per.kind === "day" ? "by hour" : per.kind === "year" ? "by month" : "by day"} · {label}</span>
              </div>
              <ColumnChart
                label={`Tasks received and done ${per.kind === "day" ? "by hour" : per.kind === "year" ? "by month" : "by day"}, ${label}`}
                labels={view.buckets.map((b) => b.name)}
                ticks={view.buckets.map((b) => b.short)}
                series={[
                  { name: "Received", color: VIZ[0], values: view.buckets.map((b) => (b.future ? null : b.received)) },
                  { name: "Done", color: VIZ[1], values: view.buckets.map((b) => (b.future ? null : b.done)) },
                ]}
                mark={view.markIdx}
              />
            </Blueprint>
            {per.kind !== "day" ? (
              <Blueprint as="section" className="panel">
                <div className="chart-head">
                  <h2 className="h2">Productivity and timeliness</h2>
                  <span className="small">{per.kind === "year" ? "by month" : "by day"} · target 100%</span>
                </div>
                <LineChart
                  label={`Team productivity and timeliness ${per.kind === "year" ? "by month" : "by day"}, ${label}`}
                  labels={view.buckets.map((b) => b.name)}
                  ticks={view.buckets.map((b) => b.short)}
                  series={[
                    { name: "Productivity", color: VIZ[0], values: view.buckets.map((b) => (b.future ? null : b.prod)) },
                    { name: "Timeliness", color: VIZ[1], values: view.buckets.map((b) => (b.future ? null : b.onTime)) },
                  ]}
                  reference={{ value: 100, label: "Target 100%" }}
                  mark={view.markIdx}
                />
              </Blueprint>
            ) : (
              <Blueprint as="section" className="panel">
                <div className="chart-head">
                  <h2 className="h2">Productivity by person</h2>
                  <span className="small">today so far · target 100%</span>
                </div>
                <BarList
                  rows={view.rows.map((r) => ({ key: String(r.p.id), label: r.p.name, value: r.prod, note: r.mix || undefined }))}
                  fmt={(n) => `${Math.round(n)}%`}
                  target={{ value: 100, label: "Target" }}
                  empty="No one has a target for today yet."
                />
              </Blueprint>
            )}
          </div>

          <div className="chart-grid">
            <Blueprint as="section" className="panel">
              <div className="chart-head">
                <h2 className="h2">Done by trade</h2>
                <span className="small">{label}</span>
              </div>
              <BarList rows={view.byTrade.map((b) => ({ key: b.id, label: b.path, value: b.done, note: `${b.received} received · timeliness ${pct(b.onTime)}` }))} />
            </Blueprint>
            {per.kind !== "day" && (
              <Blueprint as="section" className="panel">
                <div className="chart-head">
                  <h2 className="h2">Productivity by person</h2>
                  <span className="small">{label} · target 100%</span>
                </div>
                <BarList
                  rows={view.rows.map((r) => ({ key: String(r.p.id), label: r.p.name, value: r.prod, note: r.mix || undefined }))}
                  fmt={(n) => `${Math.round(n)}%`}
                  target={{ value: 100, label: "Target" }}
                  empty="No one worked a scheduled day in this period."
                />
              </Blueprint>
            )}
            {view.aht.length > 0 && (
              <Blueprint as="section" className="panel">
                <div className="chart-head">
                  <h2 className="h2">Handling time by complexity</h2>
                  <span className="small">{label} · per contract</span>
                </div>
                <BarList
                  rows={view.aht.map(({ level, row }) => ({
                    key: level.id,
                    label: level.name,
                    value: row.contracts ? Math.round(row.ms / row.contracts / 60000) : null,
                    note: `${row.contracts} contract${row.contracts === 1 ? "" : "s"}${level.aht ? ` · set ${level.aht} min` : ""}`,
                  }))}
                  fmt={(n) => fmtMin(Math.round(n))}
                  empty="No tickets tagged with complexity in this period."
                />
                <details className="table-view">
                  <summary>Show the numbers</summary>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th style={{ textAlign: "right" }}>Set AHT</th>
                        <th style={{ textAlign: "right" }}>Actual AHT / contract</th>
                        <th style={{ textAlign: "right" }}>Difference</th>
                        <th style={{ textAlign: "right" }}>Contracts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.aht.map(({ level, row }) => {
                        const act = row.contracts ? row.ms / row.contracts : null;
                        const diff = act !== null && level.aht ? Math.round((act / (level.aht * 60000) - 1) * 100) : null;
                        return (
                          <tr key={level.id}>
                            <td>{level.name}</td>
                            <td style={{ textAlign: "right" }}>{level.aht ? `${level.aht} min` : "—"}</td>
                            <td style={{ textAlign: "right" }}>{act === null ? "—" : dur(act)}</td>
                            <td style={{ textAlign: "right" }}>{diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff}%`}</td>
                            <td style={{ textAlign: "right" }}>{row.contracts}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              </Blueprint>
            )}
            {view.byType.length > 0 && (
              <Blueprint as="section" className="panel">
                <div className="chart-head">
                  <h2 className="h2">Timeliness by task type</h2>
                  <span className="small">{label} · done within SLA</span>
                </div>
                <BarList
                  rows={view.byType.map((b) => ({ key: b.id || "std", label: `${b.name} · ${b.sla}`, value: b.onTime, note: `${b.done} done` }))}
                  fmt={(n) => `${Math.round(n)}%`}
                  max={100}
                  empty="Nothing done in this period."
                />
              </Blueprint>
            )}
          </div>

          {view.buckets.length > 0 && (
            <Blueprint as="section" className="panel tight scroll-x">
              <details className="table-view">
                <summary>{per.kind === "day" ? "By hour" : per.kind === "year" ? "By month" : "By day"} · show the numbers</summary>
              <table className="table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>{per.kind === "day" ? "Hour" : per.kind === "year" ? "Month" : "Day"}</th>
                    <th>Received</th>
                    <th>Done</th>
                    <th>Timeliness</th>
                    <th>Productivity</th>
                  </tr>
                </thead>
                <tbody>
                  {view.buckets.map((b) => (
                    <tr key={b.name} style={b.future ? { color: "var(--color-neutral-600)" } : undefined}>
                      <td className="nowrap" style={{ fontWeight: 500 }}>
                        {b.name}
                      </td>
                      <td>{b.future ? "" : b.received}</td>
                      <td>{b.future ? "" : b.done}</td>
                      <td>{b.future ? "" : pct(b.onTime)}</td>
                      <td>{b.future ? "" : pct(b.prod)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </details>
            </Blueprint>
          )}

          <Blueprint as="section" className="panel tight scroll-x">
            <h2 className="h2">By trade</h2>
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>System › Trade</th>
                  <th>Received</th>
                  <th>Done</th>
                  <th>Timeliness</th>
                  <th>Avg time</th>
                  {live && <th>In queue</th>}
                  {live && <th>Assigned</th>}
                  {live && <th>In progress</th>}
                  {live && <th>Pending</th>}
                  {live && <th>Overdue</th>}
                </tr>
              </thead>
              <tbody>
                {view.byTrade.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{b.path}</td>
                    <td>{b.received}</td>
                    <td>{b.done}</td>
                    <td>{pct(b.onTime)}</td>
                    <td>{b.avg === null ? "—" : dur(b.avg)}</td>
                    {live && <td>{b.queue}</td>}
                    {live && <td>{b.assigned}</td>}
                    {live && <td>{b.prog}</td>}
                    {live && <td>{b.hold}</td>}
                    {live && <td style={{ color: b.overdue ? "var(--color-accent-800)" : "inherit" }}>{b.overdue}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Blueprint>

          {view.byType.length > 0 && (
            <Blueprint as="section" className="panel tight scroll-x">
              <h2 className="h2">By task type</h2>
              <table className="table" style={{ minWidth: 680 }}>
                <thead>
                  <tr>
                    <th>Task type</th>
                    <th>SLA</th>
                    <th>Target / day</th>
                    <th>Received</th>
                    <th>Done</th>
                    <th>Timeliness</th>
                    {live && <th>Open now</th>}
                  </tr>
                </thead>
                <tbody>
                  {view.byType.map((b) => (
                    <tr key={b.id || "std"}>
                      <td style={{ fontWeight: 500 }}>{b.name}</td>
                      <td>{b.sla}</td>
                      <td>{b.target}</td>
                      <td>{b.received}</td>
                      <td>{b.done}</td>
                      <td>{pct(b.onTime)}</td>
                      {live && <td>{b.open}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Blueprint>
          )}

          <Blueprint as="section" className="panel tight scroll-x">
            <h2 className="h2">People</h2>
            <table className="table" style={{ minWidth: 1200 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  {live && per.kind === "day" && <th>Availability</th>}
                  {live && per.kind === "day" && <th>Working on</th>}
                  <th>Days worked</th>
                  <th>{weighted ? "Done (days of target)" : basisUnit(data) === "tasks" ? "Done / target" : `${basisUnit(data)} / target`}</th>
                  <th>Productivity</th>
                  <th>Utilization</th>
                  <th>Timeliness</th>
                  <th>Avg time</th>
                  <th>Time away</th>
                  {metricF.map((f) => (
                    <th key={f.key}>{f.label.replace(/^No\. of /, "")}</th>
                  ))}
                  <th>Overtime (approved)</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r) => {
                  const w = data.tasks.find((t) => t.assignee === r.p.id && t.status === "in_progress");
                  return (
                    <tr key={r.p.id}>
                      <td>
                        <span style={{ fontWeight: 500 }}>{r.p.name}</span>
                        <div className="small">{r.p.trades.map((x) => tradeOf(data.org, x)?.name ?? x).join(", ")}</div>
                      </td>
                      {live && per.kind === "day" && (
                        <td>
                          <span className={"tag " + AV[r.p.avail][1]}>{AV[r.p.avail][0]}</span>
                        </td>
                      )}
                      {live && per.kind === "day" && <td style={{ fontSize: 13 }}>{w ? `${w.id} · ${dur(now - w.startedAt!)}` : "—"}</td>}
                      <td>{Math.round(r.days * 10) / 10}</td>
                      <td title={r.mix || undefined}>
                        {r.done.length} · {shareText(r)}
                        {weighted && r.mix && <div className="small">{r.mix}</div>}
                      </td>
                      <td>{pct(r.prod)}</td>
                      <td>{pct(r.util)}</td>
                      <td>{pct(r.time)}</td>
                      <td>{r.avgMs === null ? "—" : dur(r.avgMs)}</td>
                      <td title={Object.entries(r.away).map(([k, v]) => `${awayLabel(k as never)} ${fmtMin(v)}`).join(", ")}>{r.awayMin ? fmtMin(r.awayMin) : "—"}</td>
                      {metricF.map((f) => (
                        <td key={f.key}>{sumF(r.done, f.key)}</td>
                      ))}
                      <td>
                        {r.otMin ? fmtMin(r.otMin) : "—"}
                        {r.otPending ? <div className="small">+{fmtMin(r.otPending)} pending</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Blueprint>
        </>
      )}
    </>
  );
}
