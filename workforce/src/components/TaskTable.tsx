"use client";

import { ticketField } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import { rowAction, type TaskRowVM } from "@/lib/workload/view";

/**
 * Task list used by My work ("mine"), Queue ("queue") and completed lists ("history",
 * with start / finish / time worked). Overdue rows and rows due within 2 hours are
 * highlighted; a Ticket column appears when the team has a ticket field.
 */
export function TaskTable({ rows, variant }: { rows: TaskRowVM[]; variant: "mine" | "queue" | "history" }) {
  const { run, me, setDialog, data } = useWorkload();
  const q = variant === "queue";
  const h = variant === "history";
  const tf = ticketField(data);
  return (
    <table className="table" style={{ minWidth: q || h ? 1100 : 760 }}>
      <thead>
        <tr>
          {tf && <th>{tf.label}</th>}
          <th>Task</th>
          <th>System › Trade</th>
          {!h && <th>Priority</th>}
          {q && <th>Received</th>}
          {!h && <th>Waiting</th>}
          {!h && <th>Due</th>}
          {h && <th>Started</th>}
          {h && <th>Finished</th>}
          {h && <th>Worked</th>}
          {h && <th>On hold</th>}
          {h && <th>On time</th>}
          {!h && <th>Status</th>}
          {(q || h) && <th>{h ? "Done by" : "Assignee"}</th>}
          {!h && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={!h && r.dueState ? "row-" + r.dueState : undefined}>
            {tf && <td className="nowrap" style={{ fontWeight: 500 }}>{r.ticket || "—"}</td>}
            <td>
              <button className="task-link" onClick={() => setDialog({ kind: "task", id: r.id })}>
                <span>{r.title}</span>
                <span>
                  {r.id} · {r.sourceLabel}
                </span>
              </button>
            </td>
            <td className={q || h ? "nowrap" : undefined}>{r.path}</td>
            {!h && (
              <td>
                <span className={"tag " + r.prCls}>{r.priority}</span>
              </td>
            )}
            {q && (
              <td className="nowrap" style={{ color: "var(--color-neutral-800)" }}>
                {r.receivedShort}
              </td>
            )}
            {!h && <td className="nowrap">{r.age}</td>}
            {!h && (
              <td className="nowrap" style={{ color: r.dueColor, fontWeight: r.dueBold ? 600 : 400 }}>
                {r.dueState === "overdue" && <span className="due-flag">Overdue</span>}
                {r.dueState === "soon" && <span className="due-flag soon">Due soon</span>}
                {r.dueShort}
              </td>
            )}
            {h && <td className="nowrap">{r.started}</td>}
            {h && <td className="nowrap">{r.finished}</td>}
            {h && <td className="nowrap">{r.worked}</td>}
            {h && <td className="nowrap">{r.held || "—"}</td>}
            {h && <td>{r.onTime ? "Yes" : <span style={{ color: "var(--color-accent-800)", fontWeight: 600 }}>Late</span>}</td>}
            {!h && (
              <td>
                <span className={"tag " + r.stCls}>{r.status}</span>
              </td>
            )}
            {(q || h) && <td className="nowrap">{r.assignee}</td>}
            {!h && (
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
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
