"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Blueprint } from "@/components/ui";
import { fmtT, nowMs } from "@/lib/workload/clock";
import { awayLabel, currentAway, fmtMin, otPromptNow, staleTasks, taskWorkMs, ticketOf } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";

/** Current time, re-rendering every second (for running timers). */
export function useTick(ms = 1000) {
  const [t, setT] = useState(nowMs);
  useEffect(() => {
    const i = setInterval(() => setT(nowMs()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

/** 1:05:09 / 05:09 */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/**
 * While a member is on a break, lunch, meeting, ad hoc or training: a pop-up with a
 * running timer and Back to work, which can be shrunk to a corner chip.
 */
export function AwayPopup() {
  const { data, me, run } = useWorkload();
  const away = currentAway(data, me.id);
  const [small, setSmall] = useState<string | null>(null);
  const t = useTick();
  if (!away) return null;
  const el = clock(t - away.start);
  const back = () => run({ type: "back", pid: me.id });
  const backLabel = "Back to work";
  if (small === away.id)
    return (
      <div className="away-chip" role="status">
        <span>
          {awayLabel(away.kind)} <span className="mono">{el}</span>
        </span>
        <button className="btn btn-ghost" onClick={() => setSmall(null)}>
          Show
        </button>
        <button className="btn btn-primary btn-36" onClick={back}>
          {backLabel}
        </button>
      </div>
    );
  return (
    <div className="away-pop" role="dialog" aria-modal="true" aria-label={`${awayLabel(away.kind)} timer`}>
      <Blueprint className="away-card">
        <span className="small" style={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent-700)" }}>
          {awayLabel(away.kind)}
        </span>
        <span className="away-time" aria-live="off">
          {el}
        </span>
        <span className="small">Tasks are paused while you’re away.</span>
        <Blueprint as="button" className="btn btn-primary btn-40" style={{ padding: "0 22px" }} onClick={back}>
          {backLabel}
        </Blueprint>
        <button className="btn btn-ghost" onClick={() => setSmall(away.id)}>
          Minimize
        </button>
      </Blueprint>
    </div>
  );
}

/**
 * Reminder of tasks waiting `staleDays` or more (Allocation settings), and overtime
 * waiting that long for approvers. Shows once per team per day in this browser.
 */
export function StaleNotice() {
  const { data, me, isAdmin, isApprover, now, setDialog } = useWorkload();
  const [open, setOpen] = useState(false);
  const days = data.settings.staleDays ?? 2;
  const tasks = staleTasks(data, me.id, isAdmin, now);
  const cut = now - days * 24 * 3600_000;
  const ot = isApprover && days ? data.activities.filter((a) => a.otStatus === "pending" && a.start <= cut && a.pid !== me.id) : [];
  const key = `wfm.stale.${data.org.team.id}.${me.id}.${new Date(now).toISOString().slice(0, 10)}`;
  const n = tasks.length + ot.length;
  useEffect(() => {
    if (!n) return;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}
    setOpen(true);
  }, [n, key]);
  if (!open || !n) return null;
  const close = () => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    setOpen(false);
  };
  return (
    <div className="away-pop" role="dialog" aria-modal="true" aria-label="Waiting too long">
      <Blueprint className="away-card" style={{ alignItems: "stretch", textAlign: "left", width: "min(560px, calc(100% - 32px))" }}>
        <div className="dialog-title" style={{ fontSize: 24 }}>
          Waiting {days} day{days === 1 ? "" : "s"} or more
        </div>
        {tasks.length > 0 && (
          <>
            <span>
              {tasks.length} task{tasks.length === 1 ? "" : "s"} {isAdmin ? "in this team" : "assigned to you"} still open:
            </span>
            <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid var(--color-divider)" }}>
              <table className="table">
                <tbody>
                  {tasks.slice(0, 50).map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">{ticketOf(data, t) || t.id}</td>
                      <td>
                        <button
                          className="task-link"
                          onClick={() => {
                            close();
                            setDialog({ kind: "task", id: t.id });
                          }}
                        >
                          <span>{t.title}</span>
                        </button>
                      </td>
                      <td className="nowrap small">{Math.floor((now - t.received) / 86_400_000)} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {ot.length > 0 && (
          <span>
            {ot.length} overtime request{ot.length === 1 ? "" : "s"} waiting for approval ({ot.map((a) => fmtMin(a.otMin)).join(", ")}).{" "}
            <Link href="/workload/overtime" onClick={close}>
              Review overtime
            </Link>
          </span>
        )}
        <div className="dialog-actions" style={{ gap: 10 }}>
          <Link className="btn btn-secondary btn-40" href="/workload/queue" onClick={close}>
            Open queue
          </Link>
          <Blueprint as="button" className="btn btn-primary btn-40" style={{ padding: "0 18px" }} onClick={close}>
            OK
          </Blueprint>
        </div>
      </Blueprint>
    </div>
  );
}

/** Running time on a task (time away excluded), with its start time. */
export function TaskTimer({ task }: { task: import("@/lib/workload/types").Task }) {
  const { data } = useWorkload();
  const t = useTick();
  if (!task.startedAt) return null;
  const away = !!currentAway(data, task.assignee ?? -1);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "baseline" }} title="Time worked on this task; breaks and other time away aren’t counted">
      <span className="task-timer">{clock(taskWorkMs(data, task, t))}</span>
      <span className="small">
        {away ? "paused · " : ""}started {fmtT(task.startedAt).split(", ").pop()}
      </span>
    </span>
  );
}

/**
 * Overtime pre-approval: near the end of the member's shift, while their queue is still
 * busy, ask whether they expect overtime (with remarks). Only a Yes lets them report
 * overtime at End work; their leads see the answer on the Overtime page.
 */
export function OtPrompt() {
  const { data, me, run } = useWorkload();
  const t = useTick(30_000);
  const [note, setNote] = useState("");
  const ask = otPromptNow(data, me, t);
  if (!ask) return null;
  const end = fmtT(ask.shiftEnd).split(", ").pop();
  return (
    <div className="away-pop" role="dialog" aria-modal="true" aria-label="Overtime pre-approval">
      <Blueprint className="away-card" style={{ gap: 10, maxWidth: 460, textAlign: "left", alignItems: "stretch" }}>
        <span className="small" style={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent-700)" }}>
          Overtime pre-approval
        </span>
        <strong style={{ fontSize: 18 }}>Do you expect to work overtime today?</strong>
        <span className="small">
          Your shift ends at {end}. In your trades {ask.waiting} task{ask.waiting === 1 ? " is" : "s are"} still waiting and {ask.due} {ask.due === 1 ? "is" : "are"} due by then or overdue.
          If you answer Yes, you can report overtime at End work for your lead to approve. If No, End work just ends your day.
        </span>
        <div className="field">
          <label htmlFor="otp-note">Remarks (needed for Yes)</label>
          <textarea id="otp-note" className="input" rows={3} maxLength={500} value={note} placeholder="e.g. Month-end volume: 6 EU rate requests due today" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary btn-40" onClick={() => run({ type: "planOt", pid: me.id, yes: false, note })}>
            No
          </button>
          <Blueprint as="button" className="btn btn-primary btn-40" style={{ padding: "0 18px" }} disabled={!note.trim()} onClick={() => run({ type: "planOt", pid: me.id, yes: true, note })}>
            Yes, I expect overtime
          </Blueprint>
        </div>
      </Blueprint>
    </div>
  );
}
