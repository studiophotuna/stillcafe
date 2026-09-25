"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Blueprint } from "@/components/ui";
import { fmtT, nowMs } from "@/lib/workload/clock";
import { awayLabel, currentAway, fmtMin, staleTasks, taskWorkMs, ticketOf } from "@/lib/workload/engine";
import { periodLabel, shiftPeriod, type PeriodKind } from "@/lib/workload/period";
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

/** Day / Week / Month / All selector with previous-next arrows. */
export function PeriodNav({
  kind,
  anchor,
  onChange,
  kinds = ["day", "week", "month", "all"],
}: {
  kind: PeriodKind;
  anchor: number;
  onChange: (kind: PeriodKind, anchor: number) => void;
  kinds?: PeriodKind[];
}) {
  const now = nowMs();
  const L: Record<PeriodKind, string> = { day: "Day", week: "Week", month: "Month", all: "All dates" };
  return (
    <div className="period-nav">
      <select aria-label="Period" className="input" value={kind} onChange={(e) => onChange(e.target.value as PeriodKind, anchor)} style={{ width: "auto" }}>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {L[k]}
          </option>
        ))}
      </select>
      {kind !== "all" && (
        <>
          <button className="btn btn-secondary btn-icon" aria-label="Previous" onClick={() => onChange(kind, shiftPeriod(kind, anchor, -1))}>
            ‹
          </button>
          <span className="label">{periodLabel(kind, anchor, now)}</span>
          <button className="btn btn-secondary btn-icon" aria-label="Next" onClick={() => onChange(kind, shiftPeriod(kind, anchor, 1))}>
            ›
          </button>
          <button className="btn btn-ghost" onClick={() => onChange(kind, now)}>
            Today
          </button>
        </>
      )}
    </div>
  );
}

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
          Back to work
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
          Back to work
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
