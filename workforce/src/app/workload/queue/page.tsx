"use client";

import { useState } from "react";
import { TaskTable } from "@/components/TaskTable";
import { Blueprint } from "@/components/ui";
import { lc } from "@/lib/workload/constants";
import { distribute, sortTasks } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import { useUnit } from "@/lib/workload/useUnit";
import { taskRow } from "@/lib/workload/view";

const STATUS_OPTS = [
  ["open", "All open"],
  ["new", "In queue"],
  ["assigned", "Assigned"],
  ["in_progress", "In progress"],
  ["on_hold", "On hold"],
  ["done", "Done"],
  ["all", "Everything"],
] as const;

export default function QueuePage() {
  const { data, now, run, me, isAdmin } = useWorkload();
  const { inUnit, unitLabel } = useUnit();
  const [stf, setStf] = useState("open");
  const [q, setQ] = useState("");
  const ql = lc(q);
  const list = sortTasks(
    data.tasks.filter(
      (t) =>
        inUnit(t) &&
        (stf === "all" || (stf === "open" ? t.status !== "done" : t.status === stf)) &&
        (!ql || lc(t.title + " " + t.id + " " + Object.values(t.fields).join(" ")).includes(ql)),
    ),
    data.settings,
  );
  const canDistribute = isAdmin && (data.settings.mode === "rr" || data.settings.mode === "manual");

  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Queue · {unitLabel}</h1>
          <span>Oldest first within each priority. Overdue tasks are marked. Click a task for details.</span>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
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
          <input className="input" type="search" aria-label="Search tasks" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          {canDistribute && (
            <button className="btn btn-secondary btn-36" onClick={() => run((d, n) => distribute(d, n))}>
              Share out queue now
            </button>
          )}
        </div>
      </div>
      <Blueprint className="scroll-x">
        <TaskTable variant="queue" rows={list.map((t) => taskRow(data, t, me.id, isAdmin, now))} />
        {!list.length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>No tasks match.</div>}
      </Blueprint>
    </>
  );
}
