"use client";

import { useMemo, useState } from "react";
import { DateRangePicker, useStoredRange } from "@/components/DateRangePicker";
import { Blueprint, Icon, PageHead } from "@/components/ui";
import { dayKey } from "@/lib/workload/clock";
import { PR, ST, trPathOf } from "@/lib/workload/constants";
import { cxCheck, cxLevels, cxOver, cxText, cxTotal, due, holdPeriods, personOf, slaOf, taskWorkMs, ticketField, ticketOf } from "@/lib/workload/engine";
import { downloadSheets } from "@/lib/workload/excel";
import { rangeLabel, rangeMs, todayRange } from "@/lib/workload/period";
import { useWorkload } from "@/lib/workload/store";
import { useTasksIn } from "@/lib/workload/useTasksIn";
import type { Task } from "@/lib/workload/types";
import { useUnit } from "@/lib/workload/useUnit";
import { typeNameOf } from "@/lib/workload/view";

type DateBy = "received" | "done";
type StatusF = "all" | "open" | "done";

/**
 * Data pull-out: every ticket of the team (or the system / trade chosen at the top) for a
 * period, one row each with all its details and fields, to download as an Excel datasheet.
 */
export default function DataPage() {
  const { now, toast } = useWorkload();
  const { inUnit, unitLabel } = useUnit();
  const [rg, setRg] = useStoredRange("data", todayRange(now));
  const r = rg ?? todayRange(now);
  const [from, to] = rangeMs(r);
  // Every task finished since the start of the period (older dates are fetched once).
  const { data } = useTasksIn(from, now + 60_000);
  const [by, setBy] = useState<DateBy>("received");
  const [st, setSt] = useState<StatusF>("all");
  const tf = ticketField(data);
  const s = data.settings;

  const list = useMemo(
    () =>
      data.tasks
        .filter((t) => inUnit(t) && (st === "all" || (st === "done") === (t.status === "done")))
        .filter((t) => {
          const at = by === "done" ? t.doneAt : t.received;
          return at !== null && at >= from && at < to;
        })
        .sort((a, b) => a.received - b.received),
    [data.tasks, inUnit, st, by, from, to],
  );

  // Local date and time as text (yyyy-mm-dd hh:mm), so it sorts and reads the same in Excel.
  const at = (ms: number | null) => {
    if (!ms) return "";
    const x = new Date(ms);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())} ${p2(x.getHours())}:${p2(x.getMinutes())}`;
  };
    const min = (ms: number) => Math.round(ms / 60000);
  const pendMs = (t: Task) => holdPeriods(t, now).reduce((a, p) => a + ((p.to ?? now) - p.from), 0);
  const extra = data.fields.filter((f) => f !== tf);

  const levels = cxLevels(s);
  const name0 = (id: number | null | undefined) => (id === null || id === undefined ? "" : (personOf(data, id)?.name ?? `#${id}`));

  const download = () =>
    build().catch((e) => {
      console.error(e);
      toast("The export couldn’t be created. Try again.");
    });
  const build = async () => {
    const head = [
      "Task ID",
      ...(tf ? [tf.label] : []),
      "Title",
      "System › Trade",
      "Task type",
      "Priority",
      "Status",
      "Source",
      "Assigned to",
      "Received",
      "Started",
      "Finished",
      "SLA (h)",
      "Due",
      "On time",
      "Waiting before start (min)",
      "Turnaround (min)",
      "Worked (min)",
      "Pending (min)",
      "Times pending",
      "Pending now",
      "Delay remarks",
      "Overtime",
      "Overtime (min)",
      // Complexity: contracts per level, the total and what the checks found.
      ...levels.map((l) => `Complexity: ${l.name}`),
      "Total contracts",
      "Complexity",
      "Expected time (min)",
      "Handling time check",
      "% of a day's target",
      "Over-productive",
      "Complexity review",
      "Reviewed by",
      "Reviewed on",
      "Review note",
      "Tagged before review",
      "Requested to take by",
      "E-mail from",
      "E-mail CC",
      "E-mail subject",
      "Attachments",
      "E-mail body",
      ...extra.map((f) => f.label),
    ];
    const rows = list.map((t) => {
      const d = due(t, data);
      const chk = cxCheck(data, t);
      const over = cxOver(data, t);
      const holds = holdPeriods(t, now);
      return [
        t.id,
        ...(tf ? [ticketOf(data, t)] : []),
        t.title,
        trPathOf(data.org, t.trade),
        typeNameOf(data, t) || "Standard",
        PR[t.pr][0],
        ST[t.status][0],
        t.source === "outlook" ? "Outlook" : "Upload",
        name0(t.assignee),
        at(t.received),
        at(t.startedAt),
        at(t.doneAt),
        slaOf(t, s),
        at(d),
        t.status === "done" ? (t.doneAt! <= d ? "Yes" : "No") : now > d ? "Overdue" : "",
        t.startedAt ? min(t.startedAt - t.received) : "",
        t.doneAt ? min(t.doneAt - t.received) : "",
        min(taskWorkMs(data, t, now)),
        min(pendMs(t)),
        holds.length,
        t.status === "on_hold" ? t.hold || "Yes" : "",
        t.delay ?? "",
        t.ot ? "Yes" : "",
        t.otMin ?? "",
        ...levels.map((l) => t.cx?.[l.id] ?? ""),
        t.cx ? cxTotal(t.cx) : "",
        t.cx ? cxText(s, t.cx) : "",
        chk ? min(chk.expMs) : "",
        chk ? (chk.flag === "slow" ? "Took longer than expected" : "OK") : "",
        over ? over.pct : "",
        over?.flag ? "Yes" : "",
        t.cxReview ? (t.cxReview.verdict === "ok" ? "Confirmed" : "Corrected") : "",
        name0(t.cxReview?.by),
        at(t.cxReview?.at ?? null),
        t.cxReview?.note ?? "",
        t.cxReview?.was ? cxText(s, t.cxReview.was) : "",
        name0(t.claim?.by),
        t.email?.from ?? "",
        t.email?.cc ?? "",
        t.email?.subject ?? "",
        (t.email?.attachments ?? []).join("; "),
        (t.email?.body ?? "").slice(0, 32000),
        ...extra.map((f) => (t.fields[f.key] ?? "") as string | number),
      ];
    });
    // One row per pending period and per history entry, keyed by task ID.
    const pending = list.flatMap((t) =>
      holdPeriods(t, now).map((p) => [t.id, ...(tf ? [ticketOf(data, t)] : []), at(p.from), p.to ? at(p.to) : "Still pending", min((p.to ?? now) - p.from), p.reason]),
    );
    const history = list.flatMap((t) => t.history.map((h) => [t.id, ...(tf ? [ticketOf(data, t)] : []), at(h.at), h.text]));
    const key = ["Task ID", ...(tf ? [tf.label] : [])];
    const name = `Workload-data_${unitLabel}_${rangeLabel(r, now)}`.replace(/[^A-Za-z0-9_]+/g, "-");
    await downloadSheets(`${name}.xlsx`, [
      { name: "Tickets", rows: [head, ...rows] },
      { name: "Pending periods", rows: [[...key, "From", "To", "Minutes", "Reason"], ...pending] },
      { name: "Ticket history", rows: [[...key, "When", "What happened"], ...history] },
    ]);
  };

  return (
    <>
      <PageHead
        title={`Data pull-out · ${unitLabel}`}
        sub={
          <>
            Every ticket in the period with all its details, as an Excel file. Below is a preview.
            <details className="howto">
              <summary>What’s in the file?</summary>
              One row per ticket: times, SLA, time waiting, worked and pending, overtime, the complexity breakdown per level with its checks and review, the e-mail and
              every task field. Two more sheets list each pending period and each ticket’s history. Choose a system or trade at the top to narrow it down.
            </details>
          </>
        }
      />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <DateRangePicker value={r} onChange={setRg} today={dayKey(now)} id="data" />
          <div className="field">
            <label htmlFor="data-by">Dates are</label>
            <select id="data-by" className="input" value={by} onChange={(e) => setBy(e.target.value as DateBy)}>
              <option value="received">When received</option>
              <option value="done">When finished</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="data-st">Tickets</label>
            <select id="data-st" className="input" value={st} onChange={(e) => setSt(e.target.value as StatusF)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary btn-36" onClick={download} disabled={!list.length}>
          <Icon name="download" size={16} />
          Download Excel ({list.length})
        </button>
      </div>
      <Blueprint className="scroll-x" tabIndex={0}>
        <table className="table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Task ID</th>
              {tf && <th>{tf.label}</th>}
              <th>Title</th>
              <th>System › Trade</th>
              <th>Status</th>
              <th>Assigned to</th>
              <th>Received</th>
              <th>Finished</th>
              <th style={{ textAlign: "right" }}>Worked (min)</th>
              {levels.length > 0 && <th>Complexity</th>}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 10).map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{t.id}</td>
                {tf && <td className="nowrap">{ticketOf(data, t)}</td>}
                <td>{t.title}</td>
                <td className="nowrap">{trPathOf(data.org, t.trade)}</td>
                <td className="nowrap">{ST[t.status][0]}</td>
                <td className="nowrap">{personOf(data, t.assignee)?.name ?? "—"}</td>
                <td className="nowrap small">{at(t.received)}</td>
                <td className="nowrap small">{at(t.doneAt) || "—"}</td>
                <td style={{ textAlign: "right" }}>{min(taskWorkMs(data, t, now))}</td>
                {levels.length > 0 && <td className="nowrap">{t.cx ? cxText(s, t.cx) : "—"}</td>}
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={10} className="muted">
                  No tickets for {rangeLabel(r, now)}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {list.length > 10 && <div className="small" style={{ padding: "10px 14px" }}>Showing the first 10 of {list.length}. The download has them all.</div>}
      </Blueprint>
    </>
  );
}
