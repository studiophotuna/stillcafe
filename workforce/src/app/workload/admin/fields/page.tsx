"use client";

import { Blueprint, Icon } from "@/components/ui";
import { useWorkload } from "@/lib/workload/store";
import type { FieldType, TaskField } from "@/lib/workload/types";

export default function FieldsPage() {
  const { data, run, toast } = useWorkload();
  // Built-in columns; systems and trades come from the team in Calendar › Organization.
  const { org } = data;
  const BUILTIN = [
    { label: "Title", type: "Text", opts: "Email subject for Outlook tasks", req: "Yes" },
    ...(org.systems.length ? [{ label: "System", type: "List", opts: org.systems.map((x) => x.name).join(", "), req: "When a trade name is in two systems" }] : []),
    { label: "Trade", type: "List", opts: org.trades.map((t) => t.name).join(", "), req: org.trades.length > 1 ? "Yes" : "No (one trade)" },
    { label: "Priority", type: "List", opts: "High, Normal, Low", req: "No (Normal)" },
    { label: "Received / Due", type: "Date", opts: "Due is set from the SLA", req: "Auto" },
  ];
  const setFields = (fn: (f: TaskField[]) => TaskField[]) => run({ type: "setFields", fields: fn(data.fields) });
  const setF = (i: number, patch: Partial<TaskField>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, dir: number) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const a = fs.slice();
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Task fields · {org.team.name}</h1>
          <span style={{ maxWidth: "80ch" }}>
            Each team decides what information a task carries. Required fields must be filled in the upload file and before a task can be marked done. The upload template follows this list.
          </span>
        </div>
        <Blueprint
          as="button"
          className="btn btn-primary btn-36"
          onClick={() =>
            setFields((fs) => fs.concat({ key: "f" + Date.now().toString(36), label: "New field", type: "text", required: false }))
          }
        >
          <Icon name="plus" size={16} />
          Add field
        </Blueprint>
      </div>
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Options</th>
              <th>Required</th>
              <th>Counts in dashboard</th>
              <th style={{ textAlign: "right" }}>Order</th>
            </tr>
          </thead>
          <tbody>
            {BUILTIN.map((b) => (
              <tr key={b.label} style={{ color: "var(--color-neutral-700)" }}>
                <td>
                  <span style={{ fontWeight: 500, color: "var(--color-text)" }}>{b.label}</span>{" "}
                  <span className="tag tag-neutral" style={{ marginLeft: 6 }}>
                    Built in
                  </span>
                </td>
                <td>{b.type}</td>
                <td>{b.opts}</td>
                <td>{b.req}</td>
                <td>—</td>
                <td />
              </tr>
            ))}
            {data.fields.map((f, i) => (
              <tr key={f.key}>
                <td>
                  <input className="input" aria-label="Field label" value={f.label} onChange={(e) => setF(i, { label: e.target.value })} style={{ minWidth: 180 }} />
                </td>
                <td>
                  <select className="input" aria-label="Field type" value={f.type} onChange={(e) => setF(i, { type: e.target.value as FieldType })} style={{ width: "auto" }}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">List</option>
                  </select>
                </td>
                <td>
                  {f.type === "select" && (
                    <input
                      className="input"
                      aria-label="List options"
                      value={f.options ?? ""}
                      onChange={(e) => setF(i, { options: e.target.value })}
                      placeholder="Comma-separated"
                      style={{ minWidth: 200 }}
                    />
                  )}
                </td>
                <td>
                  <input type="checkbox" className="check" aria-label="Required" checked={f.required} onChange={() => setF(i, { required: !f.required })} />
                </td>
                <td>
                  {f.type === "number" && (
                    <input type="checkbox" className="check" aria-label="Counts in dashboard" checked={!!f.metric} onChange={() => setF(i, { metric: !f.metric })} />
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-icon" onClick={() => move(i, -1)} aria-label="Move up" title="Move up">
                      <Icon name="up" size={16} />
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => move(i, 1)} aria-label="Move down" title="Move down">
                      <Icon name="down" size={16} />
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ color: "var(--color-neutral-700)" }}
                      onClick={() => {
                        setFields((fs) => fs.filter((x) => x.key !== f.key));
                        toast(f.label + " removed.");
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>
    </>
  );
}
