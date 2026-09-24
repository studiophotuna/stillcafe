"use client";

import { useWorkload } from "@/lib/workload/store";
import { rowAction, type TaskRowVM } from "@/lib/workload/view";

/** Task list used by My work ("mine") and Queue ("queue"). */
export function TaskTable({ rows, variant }: { rows: TaskRowVM[]; variant: "mine" | "queue" }) {
  const { run, me, setDialog } = useWorkload();
  const q = variant === "queue";
  return (
    <table className="table" style={{ minWidth: q ? 1040 : 760 }}>
      <thead>
        <tr>
          <th>Task</th>
          <th>System › Trade</th>
          <th>Priority</th>
          {q && <th>Received</th>}
          <th>Waiting</th>
          <th>Due</th>
          <th>Status</th>
          {q && <th>Assignee</th>}
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <button className="task-link" onClick={() => setDialog({ kind: "task", id: r.id })}>
                <span>{r.title}</span>
                <span>
                  {r.id} · {r.sourceLabel}
                </span>
              </button>
            </td>
            <td className={q ? "nowrap" : undefined}>{r.path}</td>
            <td>
              <span className={"tag " + r.prCls}>{r.priority}</span>
            </td>
            {q && (
              <td className="nowrap" style={{ color: "var(--color-neutral-800)" }}>
                {r.receivedShort}
              </td>
            )}
            <td className="nowrap">{r.age}</td>
            <td className="nowrap" style={{ color: r.dueColor, fontWeight: q && r.dueBold ? 600 : 400 }}>
              {r.dueShort}
            </td>
            <td>
              <span className={"tag " + r.stCls}>{r.status}</span>
            </td>
            {q && <td className="nowrap">{r.assignee}</td>}
            <td>
              {r.action && (
                <button
                  className="btn btn-secondary btn-36"
                  disabled={r.action.disabled}
                  onClick={() => {
                    const a = r.action!;
                    if (a.kind === "details") setDialog({ kind: "task", id: a.id });
                    else run(rowAction(a, me.id));
                  }}
                >
                  {r.action.label}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
