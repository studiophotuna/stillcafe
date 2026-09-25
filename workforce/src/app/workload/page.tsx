"use client";

import { EmailBox } from "@/components/Dialogs";
import { TaskTable } from "@/components/TaskTable";
import { Blueprint, Icon, Kpi, PageHead, pct } from "@/components/ui";
import { dur } from "@/lib/workload/clock";
import { AV, trPathOf } from "@/lib/workload/constants";
import { AWAY, awayLabel, basisUnit, canWork, currentAway, doneToday, endedToday, fmtMin, helpQueue, missingRequired, ownQueue, personMetrics, sortTasks } from "@/lib/workload/engine";
import { fmtT } from "@/lib/workload/clock";
import { TaskTimer } from "@/components/WorkloadBits";
import { useWorkload } from "@/lib/workload/store";
import { taskDetail, taskRow } from "@/lib/workload/view";

export default function MyWorkPage() {
  const { data, now, run, me, setDialog, setHolidayWork } = useWorkload();
  const hol = me.holiday;
  const s = data.settings;
  const trades = me.trades.map((x) => trPathOf(data.org, x)).join(", ");
  const cur = data.tasks.find((t) => t.assignee === me.id && t.status === "in_progress");
  const myDone = doneToday(data.tasks.filter((t) => t.assignee === me.id), now);
  const avg = myDone.length ? dur(myDone.reduce((a, t) => a + (t.doneAt! - t.startedAt!), 0) / myDone.length) : "—";
  const metricF = data.fields.filter((f) => f.type === "number" && f.metric);
  const mm = personMetrics(data, me, now);

  const kpis = me.trades.length
    ? [
        { k: "Productivity", v: pct(mm.prod), m: `${mm.out} ${basisUnit(data)} of ${mm.target} target (so far ${mm.tgt.toFixed(1)})` },
        { k: "Utilization", v: pct(mm.util), m: `${dur(mm.handle)} on tasks of ${dur(mm.avail)} available (shift so far minus time away)` },
        {
          k: "Time away",
          v: fmtMin(Object.values(mm.away).reduce((a, b) => a + b, 0)),
          m: Object.entries(mm.away).map(([k, v]) => `${awayLabel(k as never)} ${fmtMin(v)}`).join(" · ") || "nothing logged today",
        },
        { k: "Timeliness", v: pct(mm.time), m: `${mm.onTime} of ${mm.done} done within SLA` },
        { k: "Average time", v: avg, m: "per task today" },
        { k: "Overtime", v: mm.otMin ? fmtMin(mm.otMin) : "—", m: mm.otPending ? `${fmtMin(mm.otPending)} waiting for approval` : "approved today" },
        ...metricF.map((f) => ({
          k: f.label.replace(/^No\. of /, ""),
          v: myDone.reduce((a, t) => a + (Number(t.fields[f.key]) || 0), 0),
          m: "completed today",
        })),
      ]
    : [{ k: "Waiting in queue", v: data.tasks.filter((t) => t.status === "new").length, m: "all trades" }];

  const assignedMine = sortTasks(data.tasks.filter((t) => t.assignee === me.id && (t.status === "assigned" || t.status === "on_hold")), s);
  // Members pick: own trades; when those are empty, other trades (same system first, then the team) to help with.
  const own = s.mode === "self" ? ownQueue(data, me) : [];
  const help = s.mode === "self" && !own.length && me.trades.length ? helpQueue(data, me).map((x) => x.t) : [];
  const pickable = own.length ? own : help;
  const myList = assignedMine.concat(pickable);
  const unavailable = !canWork(me, s);
  const hasAssigned = assignedMine.some((t) => t.status === "assigned");

  let idleTitle = "You’re free";
  let idleText = "";
  if (!me.trades.length) {
    idleTitle = "No trades allocated";
    idleText = "You aren’t allocated to a system and trade, so no tasks come to you. Ask an admin to allocate you in the Calendar › Admin › Members.";
  } else if (hol && !hol.working) {
    idleTitle = `Today is ${hol.name}`;
    idleText = "It’s a holiday, so tasks aren’t given to you. Working today? Tell us above and you can take tasks as usual.";
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
  const away = currentAway(data, me.id);
  const ended = endedToday(data, me.id, now);
  const onTeam = data.people.some((p) => p.id === me.id);
  const curMissing = cur ? missingRequired(data.fields, cur.fields) : [];

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

      {onTeam && hol && (
        <Blueprint as="section" className="panel status-bar holiday-bar">
          {hol.working ? (
            <>
              <span>
                <strong>Holiday duty · {hol.name}.</strong> You’re working today {hol.working === "WFH" ? "from home" : "in the office"}.
              </span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-secondary btn-36" onClick={() => setHolidayWork(hol.working === "WFH" ? "RTO" : "WFH")}>
                  {hol.working === "WFH" ? "I’m in the office" : "I’m working from home"}
                </button>
                <button className="btn btn-ghost" onClick={() => setHolidayWork(null)}>
                  Not working today
                </button>
              </div>
            </>
          ) : (
            <>
              <span>
                <strong>Today is {hol.name}.</strong> Working anyway? Update your status so tasks can come to you.
              </span>
              <div className="row" style={{ gap: 6 }}>
                <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 16px" }} onClick={() => setHolidayWork("RTO")}>
                  Working in office
                </Blueprint>
                <button className="btn btn-secondary btn-36" onClick={() => setHolidayWork("WFH")}>
                  Working from home
                </button>
              </div>
            </>
          )}
        </Blueprint>
      )}

      {onTeam && (
        <Blueprint as="section" className="panel status-bar">
          {ended ? (
            <>
              <span>
                <strong>Work ended at {fmtT(ended.start).split(", ").pop()}.</strong>{" "}
                {ended.otMin
                  ? `${fmtMin(ended.otMin)} overtime ${ended.otStatus === "pending" ? "waiting for approval" : ended.otStatus}.`
                  : "No overtime reported."}
              </span>
              {(!ended.otStatus || ended.otStatus === "pending") && (
                <button className="btn btn-secondary btn-36" onClick={() => run({ type: "undoEnd", pid: me.id })}>
                  Undo End work
                </button>
              )}
            </>
          ) : away ? (
            <>
              <span>
                <strong>On {awayLabel(away.kind).toLowerCase()}</strong> since {fmtT(away.start).split(", ").pop()} · {fmtMin(Math.max(0, Math.round((now - away.start) / 60000)))}
                {cur ? " · the time isn’t counted on your task" : ""}
              </span>
              <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 16px" }} onClick={() => run({ type: "back", pid: me.id })}>
                Back to work
              </Blueprint>
            </>
          ) : (
            <>
              <span className="small">Away from tasks? Log it so utilization stays accurate.</span>
              <div className="row" style={{ gap: 6 }}>
                {AWAY.map(([k, l]) => (
                  <button key={k} className="btn btn-secondary btn-36" onClick={() => run({ type: "away", kind: k, pid: me.id })}>
                    {l}
                  </button>
                ))}
                <button className="btn btn-secondary btn-36" style={{ marginLeft: 10 }} disabled={!!cur} title={cur ? "Finish your task or put it on hold first" : undefined} onClick={() => setDialog({ kind: "endWork" })}>
                  End work
                </button>
              </div>
            </>
          )}
        </Blueprint>
      )}

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
              <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
                <TaskTimer task={cur} />
                <span style={{ fontSize: 13.5, color: c.dueColor }}>{c.dueText}</span>
              </div>
              {curMissing.length > 0 && (
                <span style={{ display: "block", fontSize: 13, color: "var(--color-accent-800)", marginTop: 4 }}>
                  Needed before you can mark it done: {curMissing.join(", ")}
                </span>
              )}
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
            <Blueprint as="button" className="btn btn-primary btn-lg" disabled={unavailable || !!away || !!ended} onClick={() => run({ type: "startWork", pid: me.id })}>
              <Icon name="play" size={20} />
              Start work
            </Blueprint>
          )}
        </Blueprint>
      )}

      {myList.length > 0 && (
        <section className="panel" style={{ padding: 0, gap: 8 }}>
          <h2 className="h2">
            {s.mode !== "self"
              ? "Assigned to you and on hold"
              : help.length
                ? "Your trades are clear — help with other trades (your system first)"
                : "Assigned to you and available to pick"}
          </h2>
          <Blueprint className="scroll-x">
            <TaskTable variant="mine" rows={myList.map((t) => taskRow(data, t, me.id, false, now))} />
          </Blueprint>
        </section>
      )}
    </>
  );
}
