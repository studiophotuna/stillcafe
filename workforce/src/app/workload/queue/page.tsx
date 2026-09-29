"use client";

import { useState } from "react";
import { TaskTable } from "@/components/TaskTable";
import { Blueprint } from "@/components/ui";
import { lc } from "@/lib/workload/constants";
import { DateRangePicker } from "@/components/DateRangePicker";
import { dayKey } from "@/lib/workload/clock";
import { isOverdue, sortTasks, ticketField, ticketOf } from "@/lib/workload/engine";
import { rangeMs, todayRange, type DateRange } from "@/lib/workload/period";
import type { Task } from "@/lib/workload/types";
import { useWorkload } from "@/lib/workload/store";
import { useUnit } from "@/lib/workload/useUnit";
import { taskRow, typeNameOf } from "@/lib/workload/view";

const STATUS_OPTS = [
  ["open", "All open"],
  ["new", "In queue"],
  ["assigned", "Assigned"],
  ["in_progress", "In progress"],
  ["on_hold", "Pending"],
] as const;

export default function QueuePage() {
  const { data, now, run, me, isAdmin } = useWorkload();
  const { inUnit, unitLabel } = useUnit();
  const [tab, setTab] = useState<"active" | "done">("active");
  const [stf, setStf] = useState("open");
  const [q, setQ] = useState("");
  // Active: by received date (all dates by default). Completed: by finish date (today by default).
  const [pa, setPa] = useState<DateRange>(null);
  const [pd, setPd] = useState<DateRange>(todayRange(now));
  const ql = lc(q);
  const match = (t: Task) =>
    !ql || lc(t.title + " " + t.id + " " + ticketOf(data, t) + " " + typeNameOf(data, t) + " " + Object.values(t.fields).join(" ")).includes(ql);
  const [af, at] = rangeMs(pa);
  const [df, dt] = rangeMs(pd);
  const active = sortTasks(
    data.tasks.filter(
      (t) =>
        t.status !== "done" &&
        inUnit(t) &&
        (stf === "open" || t.status === stf) &&
        t.received >= af &&
        t.received < at &&
        match(t),
    ),
    data,
  );
  const done = data.tasks
    .filter((t) => t.status === "done" && t.doneAt !== null && inUnit(t) && t.doneAt >= df && t.doneAt < dt && match(t))
    .sort((a, b) => b.doneAt! - a.doneAt!);
  const overdue = active.filter((t) => isOverdue(t, data, now)).length;
  const canDistribute = isAdmin && (data.settings.mode === "rr" || data.settings.mode === "manual");
  const tf = ticketField(data);

  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Queue · {unitLabel}</h1>
          <span>
            {tab === "active"
              ? `Oldest first within each priority. ${overdue ? `${overdue} overdue (red); ` : ""}tasks due within 2 hours are amber.`
              : "Completed tasks, newest first, with start and finish times."}
          </span>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <input
            className="input"
            type="search"
            aria-label="Search tasks"
            placeholder={tf ? `Search title, ID or ${tf.label.toLowerCase()}` : "Search title or ID"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 260 }}
          />
          {canDistribute && tab === "active" && (
            <button className="btn btn-secondary btn-36" onClick={() => run({ type: "distribute" })}>
              Share out queue now
            </button>
          )}
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}>
          Active · {data.tasks.filter((t) => t.status !== "done" && inUnit(t)).length}
        </button>
        <button role="tab" aria-selected={tab === "done"} onClick={() => setTab("done")}>
          Completed
        </button>
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        {tab === "active" ? (
          <>
            <DateRangePicker value={pa} onChange={setPa} today={dayKey(now)} allowAll id="qa" />
            <div className="field">
              <label htmlFor="q-st">Status</label>
              <select id="q-st" className="input" value={stf} onChange={(e) => setStf(e.target.value)} style={{ width: "auto", minWidth: 170 }}>
                {STATUS_OPTS.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <DateRangePicker value={pd} onChange={setPd} today={dayKey(now)} id="qd" />
        )}
      </div>
      <Blueprint className="scroll-x">
        {tab === "active" ? (
          <TaskTable variant="queue" rows={active.map((t) => taskRow(data, t, me.id, isAdmin, now))} />
        ) : (
          <TaskTable variant="history" rows={done.map((t) => taskRow(data, t, me.id, isAdmin, now))} />
        )}
        {!(tab === "active" ? active : done).length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>No tasks match.</div>}
      </Blueprint>
    </>
  );
}
