"use client";

import { Blueprint, Kpi, PageHead, pct } from "@/components/ui";
import { dur, fmtT } from "@/lib/workload/clock";
import { AV, tradeOf, trPathOf } from "@/lib/workload/constants";
import { basisUnit, doneToday, fmtMin, isOverdue, personMetrics } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import type { Task } from "@/lib/workload/types";
import { useUnit } from "@/lib/workload/useUnit";

export default function DashboardPage() {
  const { data, now } = useWorkload();
  const { inUnit, unitTrades, people, unitLabel } = useUnit();
  const s = data.settings;
  const ut = data.tasks.filter(inUnit);
  const q = ut.filter((t) => t.status === "new");
  const doneT = doneToday(ut, now);
  const od = ut.filter((t) => isOverdue(t, s, now));
  const oldest = (l: Task[]) => (l.length ? dur(now - Math.min(...l.map((t) => t.received))) : "—");
  const avg = (l: Task[]) => (l.length ? dur(l.reduce((a, t) => a + (t.doneAt! - t.startedAt!), 0) / l.length) : "—");
  const sumF = (l: Task[], k: string) => l.reduce((a, t) => a + (Number(t.fields[k]) || 0), 0);
  const metricF = data.fields.filter((f) => f.type === "number" && f.metric);

  const ms = people.map((p) => personMetrics(data, p, now));
  const S = (k: "done" | "tgt" | "avail" | "handle" | "onTime") => ms.reduce((a, m) => a + m[k], 0);
  const tp = S("tgt") ? Math.round((S("done") / S("tgt")) * 100) : null;
  const tu = S("avail") ? Math.round((S("handle") / S("avail")) * 100) : null;
  const tt = S("done") ? Math.round((S("onTime") / S("done")) * 100) : null;

  const kpis = [
    { k: "Productivity", v: pct(tp), m: `${S("done")} done vs ${S("tgt").toFixed(1)} target so far` },
    { k: "Utilization", v: pct(tu), m: "task time ÷ productive time so far" },
    { k: "Timeliness", v: pct(tt), m: `${S("onTime")} of ${S("done")} within SLA` },
    { k: "In queue", v: q.length, m: `${q.filter((t) => !t.trade).length} need a trade` },
    { k: "Oldest waiting", v: oldest(q), m: "since received" },
    { k: "Overdue", v: od.length, m: "past their SLA" },
    { k: "Done today", v: doneT.length, m: "tasks" },
    { k: "Average time", v: avg(doneT), m: "per task today" },
    ...metricF.map((f) => ({ k: f.label.replace(/^No\. of /, ""), v: sumF(doneT, f.key), m: "completed today" })),
    { k: "Overtime", v: fmtMin(doneT.reduce((a, t) => a + (t.otMin ?? 0), 0)), m: `on ${doneT.filter((t) => t.ot).length} tasks today` },
  ];

  const byTrade = unitTrades.map((tr) => {
    const g = ut.filter((t) => t.trade === tr.id);
    const gq = g.filter((t) => t.status === "new");
    const god = g.filter((t) => isOverdue(t, s, now)).length;
    return {
      id: tr.id,
      path: trPathOf(data.org, tr.id),
      queue: gq.length,
      assigned: g.filter((t) => t.status === "assigned").length,
      prog: g.filter((t) => t.status === "in_progress").length,
      hold: g.filter((t) => t.status === "on_hold").length,
      oldest: oldest(gq),
      overdue: god,
      done: doneToday(g, now).length,
    };
  });

  const rows = people
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const d = doneToday(data.tasks.filter((t) => t.assignee === p.id), now);
      const w = data.tasks.find((t) => t.assignee === p.id && t.status === "in_progress");
      const m = personMetrics(data, p, now);
      return {
        p,
        trades: p.trades.map((x) => tradeOf(data.org, x)?.name ?? x).join(", "),
        working: w ? `${w.id} · ${dur(now - w.startedAt!)}` : "—",
        done: `${m.out} / ${m.target}`,
        m,
        avg: avg(d),
        metrics: metricF.map((f) => sumF(d, f.key)),
        ot: m.otMin ? fmtMin(m.otMin) : "—",
      };
    });

  return (
    <>
      <PageHead
        title={`Dashboard · ${unitLabel}`}
        style={{ maxWidth: "90ch" }}
        sub={`Today, ${fmtT(now).split(",")[0]}, so far. Productivity = tasks done ÷ target. Utilization = time on tasks ÷ productive hours. Timeliness = tasks done within SLA ÷ tasks done. Targets and working time are set in Admin › Targets.`}
      />
      <div className="grid-kpi dense">
        {kpis.map((k) => (
          <Kpi key={k.k} {...k} />
        ))}
      </div>
      <Blueprint as="section" className="panel tight scroll-x">
        <h2 className="h2">Queue by trade</h2>
        <table className="table" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th>System › Trade</th>
              <th>In queue</th>
              <th>Assigned</th>
              <th>In progress</th>
              <th>On hold</th>
              <th>Oldest waiting</th>
              <th>Overdue</th>
              <th>Done today</th>
            </tr>
          </thead>
          <tbody>
            {byTrade.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 500 }}>{b.path}</td>
                <td>{b.queue}</td>
                <td>{b.assigned}</td>
                <td>{b.prog}</td>
                <td>{b.hold}</td>
                <td>{b.oldest}</td>
                <td style={{ color: b.overdue ? "var(--color-accent-800)" : "inherit" }}>{b.overdue}</td>
                <td>{b.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>
      <Blueprint as="section" className="panel tight scroll-x">
        <h2 className="h2">People</h2>
        <table className="table" style={{ minWidth: 1200 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Trades</th>
              <th>Availability</th>
              <th>Working on</th>
              <th>{basisUnit(data) === "tasks" ? "Done / target" : `${basisUnit(data)} / target`}</th>
              <th>Productivity</th>
              <th>Utilization</th>
              <th>Timeliness</th>
              <th>Avg time</th>
              {metricF.map((f) => (
                <th key={f.key}>{f.label.replace(/^No\. of /, "")}</th>
              ))}
              <th>Overtime</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.id}>
                <td style={{ fontWeight: 500 }}>{r.p.name}</td>
                <td style={{ color: "var(--color-neutral-800)" }}>{r.trades}</td>
                <td>
                  <span className={"tag " + AV[r.p.avail][1]}>{AV[r.p.avail][0]}</span>
                </td>
                <td style={{ fontSize: 13 }}>{r.working}</td>
                <td>{r.done}</td>
                <td>{pct(r.m.prod)}</td>
                <td>{pct(r.m.util)}</td>
                <td>{pct(r.m.time)}</td>
                <td>{r.avg}</td>
                {r.metrics.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
                <td>{r.ot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>
    </>
  );
}
