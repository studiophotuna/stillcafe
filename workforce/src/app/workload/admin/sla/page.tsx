"use client";

import { useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Blueprint, Icon, PageHead } from "@/components/ui";
import { PR, lc, trPathOf } from "@/lib/workload/constants";
import { slaText } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import type { Priority, Settings, TaskType } from "@/lib/workload/types";

/**
 * SLA settings for a team: the standard SLA (by priority) for requests without a type,
 * task types with their own SLA, and whether weekends and Calendar holidays count.
 */
export default function SlaPage() {
  const { data, run, now } = useWorkload();
  const s = data.settings;
  const types = s.taskTypes ?? [];
  const set = (patch: Partial<Settings>) => run({ type: "setSettings", patch });
  const [edit, setEdit] = useState<TaskType | "new" | null>(null);
  const [del, setDel] = useState<TaskType | null>(null);
  const openOf = (id: string) => data.tasks.filter((t) => t.status !== "done" && t.ttype === id).length;
  const today = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  const nextHols = data.holidays.filter((d) => d >= today).slice(0, 3);

  return (
    <>
      <PageHead
        title={`SLA & task types · ${data.org.team.name}`}
        sub="Every request gets the standard SLA for its priority, unless it has a task type with its own SLA. Changes save immediately and apply to tasks received from now on."
      />
      <div className="grid-2">
        <Blueprint as="section" className="panel" style={{ gap: 12 }}>
          <h2 className="h2">Standard SLA</h2>
          <span className="small">For requests without a task type, in hours from when the request was received.</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {(["high", "normal", "low"] as Priority[]).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={"sla-" + k}>{PR[k][0]}</label>
                <input
                  id={"sla-" + k}
                  key={s.sla[k]}
                  className="input"
                  type="number"
                  min={0.25}
                  step={0.25}
                  defaultValue={s.sla[k]}
                  onBlur={(e) => {
                    const v = Math.min(2000, Math.max(0.25, Number(e.target.value) || 24));
                    e.target.value = String(v);
                    if (v !== s.sla[k]) set({ sla: { ...s.sla, [k]: v } });
                  }}
                />
              </div>
            ))}
          </div>
        </Blueprint>
        <Blueprint as="section" className="panel" style={{ gap: 12 }}>
          <h2 className="h2">What counts toward SLA time</h2>
          <label className="check-row">
            <input type="checkbox" className="check" checked={s.slaWeekends === true} onChange={() => set({ slaWeekends: s.slaWeekends !== true })} />
            <span>
              <strong>Count weekends</strong>
              <span className="small">
                {s.slaWeekends === true
                  ? "Due time runs through Saturdays and Sundays."
                  : "Saturdays and Sundays are skipped: a 24-hour request received Friday 15:00 is due Monday 15:00."}
              </span>
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" className="check" checked={s.slaHolidays === true} onChange={() => set({ slaHolidays: s.slaHolidays !== true })} />
            <span>
              <strong>Count holidays</strong>
              <span className="small">
                {s.slaHolidays === true ? "Due time runs through holidays." : "Holidays from the Calendar (for everyone, or this team’s department or tower) are skipped like weekends."}
                {nextHols.length ? ` Next: ${nextHols.join(", ")}.` : " No upcoming holidays in the Calendar."}
              </span>
            </span>
          </label>
          <span className="small">Waiting and overdue time in Queue and My work follow the same rule.</span>
        </Blueprint>
      </div>

      <Blueprint as="section" className="panel" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2 className="h2">Task types</h2>
            <span className="small">
              Requests with their own SLA, e.g. Doc review 2 h or Booking 4 h. A task gets its type from the upload’s Task type column, from keywords in the email subject or
              title, or when an admin sets it in the task details.
            </span>
          </div>
          <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 14px" }} onClick={() => setEdit("new")}>
            <Icon name="plus" size={16} />
            Add task type
          </Blueprint>
        </div>
        {types.length ? (
          <div className="boxed-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Task type</th>
                  <th>SLA</th>
                  <th>Trades</th>
                  <th>Keywords</th>
                  <th>Open tasks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.name}</td>
                    <td className="nowrap">{slaText(t.sla)}</td>
                    <td>{t.trades.length ? t.trades.map((x) => trPathOf(data.org, x)).join(", ") : <span className="muted">All trades</span>}</td>
                    <td>{t.keywords.length ? t.keywords.join(", ") : <span className="muted">—</span>}</td>
                    <td>{openOf(t.id)}</td>
                    <td className="nowrap" style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost" onClick={() => setEdit(t)}>
                        Edit
                      </button>
                      <button className="btn btn-ghost" style={{ color: "var(--color-neutral-700)" }} onClick={() => setDel(t)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="banner">No task types yet. Every request uses the standard SLA.</div>
        )}
        <span className="small">
          A task keeps the SLA it came in with. Editing a type’s SLA applies to new tasks; to change an open task, set its type or priority again in the task details.
        </span>
      </Blueprint>

      {edit && (
        <TypeDialog
          orig={edit === "new" ? null : edit}
          others={types.filter((t) => edit === "new" || t.id !== edit.id)}
          onClose={() => setEdit(null)}
          onSave={(rec) => {
            set({ taskTypes: edit === "new" ? types.concat(rec) : types.map((t) => (t.id === rec.id ? rec : t)) });
            setEdit(null);
          }}
        />
      )}
      {del && (
        <Modal onClose={() => setDel(null)} width={460} pad>
          <div className="dialog-title" style={{ fontSize: 24 }}>
            Delete {del.name}?
          </div>
          <span>
            {openOf(del.id)
              ? `${openOf(del.id)} open task${openOf(del.id) === 1 ? "" : "s"} of this type keep the SLA they came in with.`
              : "No open tasks use it."}{" "}
            New tasks can’t be given this type any more.
          </span>
          <div className="dialog-actions" style={{ gap: 10 }}>
            <button className="btn btn-secondary btn-40" onClick={() => setDel(null)}>
              Cancel
            </button>
            <Blueprint
              as="button"
              className="btn btn-primary btn-40"
              style={{ padding: "0 18px" }}
              onClick={() => {
                set({ taskTypes: types.filter((t) => t.id !== del.id) });
                setDel(null);
              }}
            >
              Delete
            </Blueprint>
          </div>
        </Modal>
      )}
    </>
  );
}

function TypeDialog({ orig, others, onClose, onSave }: { orig: TaskType | null; others: TaskType[]; onClose: () => void; onSave: (t: TaskType) => void }) {
  const { data } = useWorkload();
  const [name, setName] = useState(orig?.name ?? "");
  const [unit, setUnit] = useState<"h" | "min">(orig && orig.sla < 1 ? "min" : "h");
  const [sla, setSla] = useState(orig ? String(orig.sla < 1 ? Math.round(orig.sla * 60) : orig.sla) : "");
  const [trades, setTrades] = useState<string[]>(orig?.trades ?? []);
  const [kw, setKw] = useState((orig?.keywords ?? []).join(", "));
  const hours = unit === "min" ? Number(sla) / 60 : Number(sla);
  const dup = others.some((t) => lc(t.name) === lc(name.trim()));
  const problem = !name.trim()
    ? "Name the task type."
    : dup
      ? "Another task type has that name."
      : !(hours > 0) || hours > 2000
        ? "Enter an SLA above 0 (up to 2000 hours)."
        : "";
  const multi = data.org.trades.length > 1;
  return (
    <Modal onClose={onClose} width={560}>
      <div className="dialog-scroll" style={{ padding: 20, gap: 12 }}>
        <div className="dialog-title" style={{ fontSize: 26 }}>
          {orig ? "Edit task type" : "Add task type"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12 }}>
          <div className="field">
            <label htmlFor="tt-n">Name</label>
            <input id="tt-n" className="input" value={name} maxLength={60} placeholder="e.g. Doc review" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tt-s">SLA</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                id="tt-s"
                className="input"
                type="number"
                min={unit === "min" ? 5 : 0.25}
                step={unit === "min" ? 5 : 0.25}
                value={sla}
                onChange={(e) => setSla(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <select className="input" aria-label="SLA unit" value={unit} onChange={(e) => setUnit(e.target.value as "h" | "min")} style={{ width: 84 }}>
                <option value="h">hours</option>
                <option value="min">min</option>
              </select>
            </div>
          </div>
        </div>
        {multi && (
          <div className="field">
            <label>Trades (none ticked = every trade)</label>
            <div className="sched-members" style={{ maxHeight: 160 }}>
              {data.org.trades.map((t) => (
                <label key={t.id} className="sched-member">
                  <input
                    type="checkbox"
                    className="check"
                    checked={trades.includes(t.id)}
                    onChange={() => setTrades(trades.includes(t.id) ? trades.filter((x) => x !== t.id) : trades.concat(t.id))}
                  />
                  <span>{trPathOf(data.org, t.id)}</span>
                </label>
              ))}
            </div>
            <span className="small">Keywords only match tasks in these trades. Admins can still set the type on any task.</span>
          </div>
        )}
        <div className="field">
          <label htmlFor="tt-k">Keywords (optional, comma separated)</label>
          <input id="tt-k" className="input" value={kw} placeholder="e.g. doc review, document check" onChange={(e) => setKw(e.target.value)} />
          <span className="small">
            A new email or upload whose subject or title contains one of these gets this type. The first matching type in the list wins; an upload’s Task type column
            always wins.
          </span>
        </div>
        {problem && name && <span style={{ color: "var(--color-accent-800)", fontSize: 13 }}>{problem}</span>}
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            disabled={!!problem}
            onClick={() =>
              onSave({
                id: orig?.id ?? "TT" + Date.now().toString(36),
                name: name.trim(),
                sla: Math.round(hours * 100) / 100,
                trades,
                keywords: [...new Set(kw.split(",").map((k) => k.trim()).filter(Boolean))],
              })
            }
          >
            {orig ? "Save" : "Add task type"}
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}
