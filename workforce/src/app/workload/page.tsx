"use client";

import Link from "next/link";
import { EmailBox } from "@/components/Dialogs";
import { TaskTable } from "@/components/TaskTable";
import { Blueprint, Icon, Kpi, PageHead, pct } from "@/components/ui";
import { M, dur } from "@/lib/workload/clock";
import { AV, trPathOf } from "@/lib/workload/constants";
import { personOf, AWAY, canPause, otAllowed, awayLabel, basisUnit, typeTargets, canWork, currentAway, doneToday, endedToday, fmtMin, helpQueue, missingRequired, ownQueue, personMetrics, sortTasks } from "@/lib/workload/engine";
import { fmtT } from "@/lib/workload/clock";
import { TaskTimer } from "@/components/WorkloadBits";
import { useWorkload } from "@/lib/workload/store";
import { breakAllowance } from "@/lib/workload/breaks";
import { taskDetail, taskRow } from "@/lib/workload/view";

export default function MyWorkPage() {
  const { data, now, run, me, setDialog, setHolidayWork, mode } = useWorkload();
  const hol = me.holiday;
  const s = data.settings;
  const trades = me.trades.map((x) => trPathOf(data.org, x)).join(", ");
  const cur = data.tasks.find((t) => t.assignee === me.id && t.status === "in_progress");
  const myDone = doneToday(data.tasks.filter((t) => t.assignee === me.id), now);
  const avg = myDone.length ? dur(myDone.reduce((a, t) => a + (t.doneAt! - t.startedAt!), 0) / myDone.length) : "—";
  const metricF = data.fields.filter((f) => f.type === "number" && f.metric);
  const mm = personMetrics(data, me, now);
  const brkOver = breakAllowance(data) ? Math.max(0, Math.round((mm.away.break ?? 0) + (mm.away.lunch ?? 0)) - breakAllowance(data)) : 0;

  const kpis = me.trades.length
    ? [
        {
          k: "Productivity",
          v: pct(mm.prod),
          m: typeTargets(data)
            ? `${Math.round(mm.share * 100)}% of a day’s target done${mm.mix ? ` · ${mm.mix}` : ""} (so far ${Math.round(mm.exp * 100)}%${mm.otDays ? `, incl. ${Math.round(mm.otDays * 100)}% for overtime` : ""})`
            : `${mm.out} ${basisUnit(data)} of ${mm.target}${mm.otTarget ? ` + ${mm.otTarget} for overtime` : ""} target (so far ${mm.tgt.toFixed(1)})`,
        },
        {
          k: "Utilization",
          v: pct(mm.util),
          m: `${dur(mm.handle)} on tasks of ${dur(mm.avail)} available (shift so far minus time away)${mm.idle >= M ? ` · idle ${dur(mm.idle)} with no task running` : ""}`,
        },
        {
          k: "Time away",
          v: fmtMin(Object.entries(mm.away).reduce((a, [k, v]) => a + (k === "idle" ? 0 : v), 0)),
          m:
            (Object.entries(mm.away).map(([k, v]) => `${awayLabel(k as never)} ${fmtMin(v)}`).join(" · ") || "nothing logged today") +
            (brkOver > 0 ? ` · break + lunch ${fmtMin(brkOver)} over the ${fmtMin(breakAllowance(data))} allowance (your lead is notified)` : ""),
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

  const assignedMine = sortTasks(data.tasks.filter((t) => t.assignee === me.id && (t.status === "assigned" || t.status === "on_hold")), data);
  // Only my own tasks here; tasks to pick are in the Queue.
  const myList = assignedMine;
  const waitingToPick = s.mode === "self" ? ownQueue(data, me).length || (me.trades.length ? helpQueue(data, me).length : 0) : 0;
  // Others asking to take one of my tasks.
  const claims = data.tasks.filter((t) => t.assignee === me.id && t.claim && t.status !== "done");
  const unavailable = !canWork(me, s);
  const hasAssigned = assignedMine.some((t) => t.status === "assigned");

  let idleTitle = "You’re free";
  let idleText = "";
  if (!me.trades.length) {
    idleTitle = "No trades allocated";
    idleText = "You aren’t allocated to a system and trade, so no tasks come to you. Ask an admin to allocate you (Admin › Members).";
  } else if (hol && !hol.working) {
    idleTitle = `Today is ${hol.name}`;
    idleText = "It’s a holiday, so tasks aren’t given to you. Working today? Tell us above and you can take tasks as usual.";
  } else if (unavailable) {
    idleTitle = "You’re marked unavailable";
    idleText = `The Calendar shows you as ${AV[me.avail][0].toLowerCase()} now, so tasks aren’t given to you.`;
  } else if (s.mode === "fifo")
    idleText = `Click Start work to get the next task in ${trades}. You get one task at a time, highest priority and oldest first.`;
  else if (s.mode === "self")
    idleText =
      (waitingToPick ? `${waitingToPick} task${waitingToPick === 1 ? "" : "s"} waiting. ` : "Nothing is waiting right now. ") +
      (s.multiPick ? "Pick tasks from the Queue (you can pick several), then start them here one at a time." : "Take a task from the Queue to start it.");
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
        sub={me.trades.length ? `You work on ${trades} · shift ${me.shift}.` : mode === "db"
            ? "You aren’t allocated to a system and trade in this team, so no tasks come to you. To take tasks, allocate yourself in Admin › Members; to manage the team’s work, use Admin › Manage queue and Workload dashboard."
            : "Admin view. Switch to employee (bottom of the menu) to see a member’s screen."}
      />
      <div className="grid-kpi">
        {kpis.map((k) => (
          <Kpi key={k.k} {...k} />
        ))}
      </div>

      {claims.map((t) => (
        <Blueprint as="section" key={t.id} className="panel status-bar claim-bar">
          <span>
            <strong>{personOf(data, t.claim!.by)?.name ?? "A teammate"} wants to take {t.id}</strong> · {t.title}
            {t.status === "in_progress" ? " (in progress)" : ""}. Let them take it, or keep it?
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-secondary btn-36" onClick={() => run({ type: "answerClaim", id: t.id, ok: false, pid: me.id })}>
              Keep it
            </button>
            <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 16px" }} onClick={() => run({ type: "answerClaim", id: t.id, ok: true, pid: me.id })}>
              Let them take it
            </Blueprint>
          </div>
        </Blueprint>
      ))}

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
                <button className="btn btn-ghost" onClick={() => setHolidayWork("HOL")}>
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
              <span className="small">
                {me.otDay
                  ? `Today is ${me.otDay === "holiday" ? "holiday duty" : "a rest day"}: the time you work counts as ${me.otDay === "holiday" ? "holiday duty" : "rest day"} overtime. Report it at End work.`
                  : me.avail === "offshift" && me.onToday
                  ? "Your shift is over. You can keep taking tasks as overtime and report it at End work."
                  : "Away from tasks? Log it so utilization stays accurate."}
              </span>
              <div className="row" style={{ gap: 6 }}>
                {AWAY.map(([k, l]) => (
                  <button key={k} className="btn btn-secondary btn-36" onClick={() => run({ type: "away", kind: k, pid: me.id })}>
                    {l}
                  </button>
                ))}
                <button className="btn btn-secondary btn-36" style={{ marginLeft: 10 }} disabled={!!cur} title={cur ? "Resolve your ticket or set it to pending first" : undefined} onClick={() => (otAllowed(data, me, now) ? setDialog({ kind: "endWork" }) : run({ type: "endWork", otMin: 0, pid: me.id }))}>
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
                  Needed before you can resolve it: {curMissing.join(", ")}
                </span>
              )}
            </div>
            <div className="row">
              {canPause(s) && (
                <button
                  className="btn btn-secondary btn-md"
                  title="Stop this task’s timer and put it back on your list, so you can work on another one"
                  onClick={() => run({ type: "pauseTask", id: cur.id, pid: me.id })}
                >
                  Pause
                </button>
              )}
              <button className="btn btn-secondary btn-md" onClick={() => setDialog({ kind: "hold", id: cur.id })}>
                Pending
              </button>
              <Blueprint
                as="button"
                className="btn btn-primary btn-md"
                style={{ padding: "0 20px", fontSize: 15 }}
                onClick={() => setDialog({ kind: "done", id: cur.id })}
              >
                <Icon name="check" />
                Resolve ticket
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
          {showStart ? (
            <Blueprint as="button" className="btn btn-primary btn-lg" disabled={unavailable || !!away || !!ended} onClick={() => run({ type: "startWork", pid: me.id })}>
              <Icon name="play" size={20} />
              Start work
            </Blueprint>
          ) : s.mode === "self" && me.trades.length > 0 ? (
            <Link className="btn btn-primary btn-lg" href="/workload/queue">
              Go to Queue
            </Link>
          ) : null}
        </Blueprint>
      )}

      {myList.length > 0 && (
        <section className="panel" style={{ padding: 0, gap: 8 }}>
          <h2 className="h2">Assigned to you and pending</h2>
          <Blueprint className="scroll-x">
            <TaskTable variant="mine" rows={myList.map((t) => taskRow(data, t, me.id, false, now))} />
          </Blueprint>
        </section>
      )}
    </>
  );
}
