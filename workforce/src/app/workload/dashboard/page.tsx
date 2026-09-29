"use client";

import { useMemo } from "react";
import { Blueprint, Icon, Kpi, PageHead, pct } from "@/components/ui";
import { DateRangePicker, useStoredRange } from "@/components/DateRangePicker";
import { H, dayKey, dur, fmtT } from "@/lib/workload/clock";
import { AV, PR, tradeOf, trPathOf } from "@/lib/workload/constants";
import { awayLabel, cxCheck, cxOn, cxText, basisUnit, due, fmtMin, isOverdue, slaOf, slaText, taskTypeOf, taskWorkMs, ticketField, ticketOf, typeTargets } from "@/lib/workload/engine";
import { downloadSheets } from "@/lib/workload/excel";
import { ahtStats } from "@/lib/workload/aht";
import { AhtPanels } from "@/components/AhtPanels";
import { BarList, ColumnChart, LineChart, VIZ } from "@/components/Charts";
import { personPeriod, teamPeriod, typeLabel, type PersonPeriod } from "@/lib/workload/metrics";
import { rangeBuckets, rangeGrain, rangeLabel, rangeMs, todayRange } from "@/lib/workload/period";
import { useWorkload } from "@/lib/workload/store";
import type { Task } from "@/lib/workload/types";
import { useUnit } from "@/lib/workload/useUnit";
import { usePeriodInput } from "@/lib/workload/usePeriodInput";

export default function DashboardPage() {
  const { data, now, toast } = useWorkload();
  const { inUnit, unitTrades, people, unitLabel } = useUnit();
  // Shared with Handling time, so both pages show the same dates.
  const [rg, setRg] = useStoredRange("perf", todayRange(now));
  const r = rg ?? todayRange(now);
  const [from, to] = rangeMs(r);
  const grain = rangeGrain(r);
  const live = now >= from && now < to;
  const { input, error } = usePeriodInput(from, to);
  const s = data.settings;
  const ut = useMemo(() => data.tasks.filter(inUnit), [data.tasks, inUnit]);
  const weighted = typeTargets(data);
  const metricF = data.fields.filter((f) => f.type === "number" && f.metric);
  const types = s.taskTypes ?? [];
  const label = rangeLabel(r, now);

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
    const hourly = grain === "hour";
    const parts = rangeBuckets(r);
    const buckets = parts.map(([name, short, a, b]) => {
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
    const markIdx = parts.findIndex(([, , a, b]) => now >= a && now < b);
    // Average handling time per contract of each complexity level (tickets done in the period).
    const ahtAll = ahtStats({ ...withActs, tasks: ut }, from, until + 1);
    const aht = cxOn(s) ? ahtAll.levels : [];
    return { aht, ahtAll, rows, team, buckets, markIdx: markIdx < 0 ? undefined : markIdx, byTrade, byType, doneTasks: doneIn(ut).sort((a, b) => a.doneAt! - b.doneAt!), until, withActs };
  }, [input, now, to, from, people, data, ut, unitTrades, types, r.from, r.to, grain, s]);

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
        name: grain === "hour" ? "By hour" : grain === "month" ? "By month" : "By day",
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
      name: "AHT by member",
      rows: [
        ["Member", "Tickets", "Contracts", "AHT / ticket (min)", "AHT / contract (min)", "Time vs expected (%)", "Questions"],
        ...view.ahtAll.members.map((x): Row => [
          x.name,
          x.tickets,
          x.contracts,
          x.tickets ? Math.round(x.ms / x.tickets / 60000) : null,
          x.contracts ? Math.round(x.ms / x.contracts / 60000) : null,
          x.expMs ? Math.round((x.checkedMs / x.expMs) * 100) : null,
          x.slow,
        ]),
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
        <DateRangePicker value={r} onChange={setRg} today={dayKey(now)} id="dash" />
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
                <span className="small">{grain === "hour" ? "by hour" : grain === "month" ? "by month" : "by day"} · {label}</span>
              </div>
              <ColumnChart
                label={`Tasks received and done ${grain === "hour" ? "by hour" : grain === "month" ? "by month" : "by day"}, ${label}`}
                labels={view.buckets.map((b) => b.name)}
                ticks={view.buckets.map((b) => b.short)}
                series={[
                  { name: "Received", color: VIZ[0], values: view.buckets.map((b) => (b.future ? null : b.received)) },
                  { name: "Done", color: VIZ[1], values: view.buckets.map((b) => (b.future ? null : b.done)) },
                ]}
                mark={view.markIdx}
              />
            </Blueprint>
            {grain !== "hour" ? (
              <Blueprint as="section" className="panel">
                <div className="chart-head">
                  <h2 className="h2">Productivity and timeliness</h2>
                  <span className="small">{grain === "month" ? "by month" : "by day"} · target 100%</span>
                </div>
                <LineChart
                  label={`Team productivity and timeliness ${grain === "month" ? "by month" : "by day"}, ${label}`}
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
            {grain !== "hour" && (
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
                <span className="small">Details and the set AHT are in Handling time below.</span>
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
                <summary>{grain === "hour" ? "By hour" : grain === "month" ? "By month" : "By day"} · show the numbers</summary>
              <table className="table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>{grain === "hour" ? "Hour" : grain === "month" ? "Month" : "Day"}</th>
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
                  {live && grain === "hour" && <th>Availability</th>}
                  {live && grain === "hour" && <th>Working on</th>}
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
                      {live && grain === "hour" && (
                        <td>
                          <span className={"tag " + AV[r.p.avail][1]}>{AV[r.p.avail][0]}</span>
                        </td>
                      )}
                      {live && grain === "hour" && <td style={{ fontSize: 13 }}>{w ? `${w.id} · ${dur(now - w.startedAt!)}` : "—"}</td>}
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

          <AhtPanels st={view.ahtAll} />
        </>
      )}
    </>
  );
}
