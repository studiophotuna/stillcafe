"use client";

import { EmailBox } from "@/components/Dialogs";
import { TaskTable } from "@/components/TaskTable";
import { Blueprint, Icon, Kpi, PageHead, pct } from "@/components/ui";
import { dur } from "@/lib/workload/clock";
import { AV, trPath } from "@/lib/workload/constants";
import { canWork, doneToday, personMetrics, sortTasks, startWork } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import { taskDetail, taskRow } from "@/lib/workload/view";

export default function MyWorkPage() {
  const { data, now, run, me, setDialog } = useWorkload();
  const s = data.settings;
  const trades = me.trades.map(trPath).join(", ");
  const cur = data.tasks.find((t) => t.assignee === me.id && t.status === "in_progress");
  const myDone = doneToday(data.tasks.filter((t) => t.assignee === me.id), now);
  const avg = myDone.length ? dur(myDone.reduce((a, t) => a + (t.doneAt! - t.startedAt!), 0) / myDone.length) : "—";
  const metricF = data.fields.filter((f) => f.type === "number" && f.metric);
  const mm = personMetrics(data, me, now);

  const kpis = me.trades.length
    ? [
        { k: "Productivity", v: pct(mm.prod), m: `${mm.done} done of ${mm.target} target (so far ${mm.tgt.toFixed(1)})` },
        { k: "Utilization", v: pct(mm.util), m: `${dur(mm.handle)} on tasks of ${dur(mm.avail)} productive time so far` },
        { k: "Timeliness", v: pct(mm.time), m: `${mm.onTime} of ${mm.done} done within SLA` },
        { k: "Average time", v: avg, m: "per task today" },
        ...metricF.map((f) => ({
          k: f.label.replace(/^No\. of /, ""),
          v: myDone.reduce((a, t) => a + (Number(t.fields[f.key]) || 0), 0),
          m: "completed today",
        })),
      ]
    : [{ k: "Waiting in queue", v: data.tasks.filter((t) => t.status === "new").length, m: "all trades" }];

  const assignedMine = sortTasks(data.tasks.filter((t) => t.assignee === me.id && (t.status === "assigned" || t.status === "on_hold")), s);
  const pickable = s.mode === "self" ? sortTasks(data.tasks.filter((t) => t.status === "new" && me.trades.includes(t.trade)), s) : [];
  const myList = assignedMine.concat(pickable);
  const unavailable = !canWork(me, s);
  const hasAssigned = assignedMine.some((t) => t.status === "assigned");

  let idleTitle = "You’re free";
  let idleText = "";
  if (!me.trades.length) {
    idleTitle = "No trades allocated";
    idleText = "You aren’t allocated to a system and trade, so no tasks come to you. Ask an admin to allocate you in the Calendar › Admin › Members.";
  } else if (unavailable) {
    idleTitle = "You’re marked unavailable";
    idleText = `The Calendar shows you as ${AV[me.avail][0].toLowerCase()} now, so tasks aren’t given to you.`;
  } else if (s.mode === "fifo")
    idleText = `Click Start work to get the next task in ${trades}. You get one task at a time, highest priority and oldest first.`;
  else if (s.mode === "self") idleText = `Pick a task from the list below. Only tasks in ${trades} are shown.`;
  else
    idleText = hasAssigned
      ? "You have tasks assigned to you. Click Start work to begin the next one."
      : `Tasks are assigned by an admin${s.mode === "rr" ? " (shared out automatically)" : ""}. Nothing is assigned to you right now.`;
  const showStart = !!me.trades.length && (s.mode === "fifo" || hasAssigned);

  const c = cur ? taskDetail(data, cur, now) : null;

  return (
    <>
      <PageHead
        title="My work"
        sub={me.trades.length ? `You work on ${trades} · shift ${me.shift}.` : "Admin view. Switch to employee (bottom of the menu) to see a member’s screen."}
      />
      <div className="grid-kpi">
        {kpis.map((k) => (
          <Kpi key={k.k} {...k} />
        ))}
      </div>

      {cur && c ? (
        <Blueprint as="section" className="current">
          <div className="current-top">
            <div>
              <div className="task-meta">
                <span className="tag tag-accent">In progress</span>
                <span className={"tag " + c.prCls}>{c.priority}</span>
                <span>
                  {cur.id} · {c.path} · {c.sourceLabel}
                </span>
              </div>
              <h2>{cur.title}</h2>
              <span style={{ fontSize: 13.5, color: c.dueColor }}>
                {c.dueText} · started {c.startedAgo} ago
              </span>
            </div>
            <div className="row">
              <button className="btn btn-secondary btn-md" onClick={() => setDialog({ kind: "hold", id: cur.id })}>
                Put on hold
              </button>
              <Blueprint
                as="button"
                className="btn btn-primary btn-md"
                style={{ padding: "0 20px", fontSize: 15 }}
                onClick={() => setDialog({ kind: "done", id: cur.id })}
              >
                <Icon name="check" />
                Mark done
              </Blueprint>
            </div>
          </div>
          <div className="current-body">
            <div className="kv">
              {c.fieldRows.map((f) => [<span key={f.label + "k"}>{f.label}</span>, <span key={f.label + "v"}>{f.value}</span>])}
            </div>
            {cur.email && <EmailBox email={cur.email} received={c.receivedText} />}
          </div>
        </Blueprint>
      ) : (
        <Blueprint as="section" className="idle">
          <div>
            <h2>{idleTitle}</h2>
            <span>{idleText}</span>
          </div>
          {showStart && (
            <Blueprint as="button" className="btn btn-primary btn-lg" disabled={unavailable} onClick={() => run((d, n) => startWork(d, me.id, n))}>
              <Icon name="play" size={20} />
              Start work
            </Blueprint>
          )}
        </Blueprint>
      )}

      {myList.length > 0 && (
        <section className="panel" style={{ padding: 0, gap: 8 }}>
          <h2 className="h2">{s.mode === "self" ? "Assigned to you and available to pick" : "Assigned to you and on hold"}</h2>
          <Blueprint className="scroll-x">
            <TaskTable variant="mine" rows={myList.map((t) => taskRow(data, t, me.id, false, now))} />
          </Blueprint>
        </section>
      )}
    </>
  );
}
