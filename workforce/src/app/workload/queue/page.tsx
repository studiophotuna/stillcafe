"use client";

import { Fragment, useState } from "react";
import { TaskTable } from "@/components/TaskTable";
import { Blueprint } from "@/components/ui";
import { lc } from "@/lib/workload/constants";
import { DateRangePicker } from "@/components/DateRangePicker";
import { dayKey } from "@/lib/workload/clock";
import { dueBoard, type BoardCol, type BoardGroup } from "@/lib/workload/dueBoard";
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
  // Due / overdue board: open tickets in this unit; clicking a count shows just those.
  const board = dueBoard(data, data.tasks.filter((t) => t.status !== "done" && inUnit(t)), now);
  const [pick, setPick] = useState<{ ids: string[]; label: string } | null>(null);
  const active = sortTasks(
    data.tasks.filter(
      (t) =>
        t.status !== "done" &&
        inUnit(t) &&
        (!pick || pick.ids.includes(t.id)) &&
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
      {tab === "active" && (
        <DueBoard
          board={board}
          pick={pick?.label ?? ""}
          onPick={(ids, label) => {
            setPick(pick?.label === label ? null : { ids, label });
            setPa(null);
            setStf("open");
          }}
        />
      )}
      {pick && tab === "active" && (
        <div className="banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>
            Showing {pick.ids.length} ticket{pick.ids.length === 1 ? "" : "s"}: {pick.label}
          </span>
          <button className="btn btn-ghost" onClick={() => setPick(null)}>
            Show all
          </button>
        </div>
      )}
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

/** Days across, and for each system a Due row and an Overdue row; counts open the tickets. */
function DueBoard({ board, pick, onPick }: { board: { cols: BoardCol[]; groups: BoardGroup[] }; pick: string; onPick: (ids: string[], label: string) => void }) {
  const { cols, groups } = board;
  if (!groups.length) return null;
  const total = (k: "due" | "over") => cols.map((_, i) => groups.flatMap((g) => g[k][i]));
  const all: BoardGroup = { id: "all", name: "All systems", due: total("due"), over: total("over") };
  const cell = (ids: string[], label: string, over: boolean) =>
    ids.length ? (
      <button className={"qb-n" + (over ? " qb-over" : "") + (pick === label ? " on" : "")} onClick={() => onPick(ids, label)} title={`Show ${label}`}>
        {ids.length}
      </button>
    ) : (
      <span className="qb-zero">·</span>
    );
  const rows = (g: BoardGroup, bold = false) => (
    <>
      <tr className="qb-sys">
        <th colSpan={cols.length + 2}>{g.name}</th>
      </tr>
      {(["due", "over"] as const).map((k) => {
        const sum = g[k].flat();
        const lab = k === "due" ? "Due" : "Overdue";
        return (
          <tr key={k} className={k === "over" ? "qb-row-over" : undefined} style={bold ? { fontWeight: 600 } : undefined}>
            <td className="qb-lab">{lab}</td>
            {cols.map((c, i) => (
              <td key={c.key} className={"qb-c" + (c.today ? " qb-today" : "")}>
                {cell(g[k][i], `${g.name} · ${lab} · ${c.label === "Today" ? "today" : c.sub}`, k === "over")}
              </td>
            ))}
            <td className="qb-c qb-tot">{cell(sum, `${g.name} · ${lab} · all days`, k === "over")}</td>
          </tr>
        );
      })}
    </>
  );
  return (
    <Blueprint as="section" className="panel tight scroll-x" style={{ gap: 8 }}>
      <div className="chart-head">
        <h2 className="h2">Due and overdue by day</h2>
        <span className="small">Open tickets by due date · click a number to list them</span>
      </div>
      <table className="table qb">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c.key} className={"qb-c" + (c.today ? " qb-today" : "")}>
                <div>{c.label}</div>
                <div className="small">{c.sub}</div>
              </th>
            ))}
            <th className="qb-c qb-tot">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.id || "none"}>{rows(g)}</Fragment>
          ))}
          {groups.length > 1 && rows(all, true)}
        </tbody>
      </table>
    </Blueprint>
  );
}
