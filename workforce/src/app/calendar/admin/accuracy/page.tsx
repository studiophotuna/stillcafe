"use client";

import { useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Blueprint, Icon } from "@/components/ui";
import { PeriodPicker, usePeriod } from "@/components/calendar/Trackers";
import type { IssueForm } from "@/lib/calendar/actions";
import { fmt } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import { canTrack, periodLabel, periodRange } from "@/lib/calendar/trackers";
import type { KpiIssue } from "@/lib/calendar/types";
import { useCalView } from "@/lib/calendar/useCalView";
import { downloadSheets } from "@/lib/workload/excel";

/**
 * Accuracy log: issues on tickets (or work without a ticket) with their root cause and the
 * preventive and corrective actions. Leads and above log them for their teams; each one counts
 * as an error in the KPI tracker's accuracy for the week / month it happened.
 */
export default function AccuracyPage() {
  const s = useCalendar();
  const v = useCalView();
  const p = usePeriod();
  const [a, b] = periodRange(p.period);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<KpiIssue | "new" | null>(null);
  const [del, setDel] = useState<KpiIssue | null>(null);
  const teams = v.scopeBranches;
  const name = (id: number) => s.cal.people.get(id)?.name ?? "Former member";
  const ql = q.trim().toLowerCase();
  const list = (s.data.issues ?? [])
    .filter((i) => teams.some((t) => t.id === i.team) && i.date >= a && i.date <= b)
    .filter((i) => !ql || [i.ticket, i.desc, i.root, i.preventive, i.corrective, s.cal.O.by[i.team]?.name].join(" ").toLowerCase().includes(ql))
    .sort((x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id));
  const mayLog = teams.filter((t) => canTrack(s.cal, s.me, t.id));

  const download = async () => {
    await downloadSheets(`Accuracy-log_${p.period}.xlsx`, [
      {
        name: "Accuracy log",
        rows: [
          ["Date", "Team", "Ticket no.", "Issue description", "Root cause", "Preventive solution", "Corrective action", "Logged by", "Logged on"],
          ...list.map((i) => [i.date, s.cal.O.by[i.team]?.name ?? i.team, i.ticket ?? "", i.desc, i.root, i.preventive, i.corrective, name(i.by), i.at]),
        ],
      },
    ]).catch(() => s.toast("The export couldn’t be created. Try again."));
  };

  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Accuracy log · {v.unitLabel}</h1>
          <span>Each issue counts as one error in its team’s accuracy for the week and month it happened (KPI tracker). Leads and above log issues for their teams.</span>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <PeriodPicker p={p} />
          <input className="input" type="search" aria-label="Find an issue" placeholder="Find" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
          <button className="btn btn-secondary btn-36" onClick={download} disabled={!list.length}>
            <Icon name="download" size={16} />
            Download Excel
          </button>
          <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 14px" }} disabled={!mayLog.length} onClick={() => setEdit("new")}>
            <Icon name="plus" size={16} />
            Log an issue
          </Blueprint>
        </div>
      </div>
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 1200 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Team</th>
              <th>Ticket no.</th>
              <th>Issue description</th>
              <th>Root cause</th>
              <th>Preventive solution</th>
              <th>Corrective action</th>
              <th>Logged by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((i) => {
              const mine = canTrack(s.cal, s.me, i.team);
              return (
                <tr key={i.id}>
                  <td className="nowrap">{fmt(i.date)}</td>
                  <td>{s.cal.O.by[i.team]?.name ?? i.team}</td>
                  <td className="nowrap">{i.ticket || "—"}</td>
                  {[i.desc, i.root, i.preventive, i.corrective].map((x, k) => (
                    <td key={k} style={{ whiteSpace: "pre-wrap", minWidth: 160 }}>
                      {x || <span className="muted">—</span>}
                    </td>
                  ))}
                  <td className="nowrap small">{name(i.by)}</td>
                  <td className="nowrap" style={{ textAlign: "right" }}>
                    {mine && (
                      <>
                        <button className="btn btn-ghost" onClick={() => setEdit(i)}>
                          Edit
                        </button>
                        <button className="btn btn-ghost" style={{ color: "#b3261e" }} onClick={() => setDel(i)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={9} className="muted">
                  No issues logged for {periodLabel(p.period)}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Blueprint>
      {edit && <IssueDialog issue={edit === "new" ? null : edit} teams={mayLog} onClose={() => setEdit(null)} />}
      {del && (
        <Modal onClose={() => setDel(null)} pad>
          <div className="dialog-title" style={{ fontSize: 22 }}>
            Delete this issue?
          </div>
          <span>
            {fmt(del.date)} · {s.cal.O.by[del.team]?.name}: {del.desc.slice(0, 120)}
          </span>
          <div className="dialog-actions" style={{ gap: 10 }}>
            <button className="btn btn-secondary btn-40" onClick={() => setDel(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-40"
              onClick={() => {
                s.run({ type: "deleteIssue", id: del.id });
                setDel(null);
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function IssueDialog({ issue, teams, onClose }: { issue: KpiIssue | null; teams: { id: string; name: string }[]; onClose: () => void }) {
  const s = useCalendar();
  const [f, setF] = useState<IssueForm>(() =>
    issue
      ? { id: issue.id, team: issue.team, date: issue.date, ticket: issue.ticket ?? "", desc: issue.desc, root: issue.root, preventive: issue.preventive, corrective: issue.corrective }
      : { team: teams[0]?.id ?? "", date: s.today, ticket: "", desc: "", root: "", preventive: "", corrective: "" },
  );
  const up = (patch: Partial<IssueForm>) => setF((x) => ({ ...x, ...patch }));
  const area = (k: "desc" | "root" | "preventive" | "corrective", label: string, ph: string) => (
    <div className="field">
      <label htmlFor={"is-" + k}>{label}</label>
      <textarea id={"is-" + k} className="input" rows={2} maxLength={2000} value={f[k]} placeholder={ph} onChange={(e) => up({ [k]: e.target.value })} />
    </div>
  );
  return (
    <Modal onClose={onClose} width={620}>
      <div className="dialog-scroll" style={{ padding: 20, gap: 10 }}>
        <div className="dialog-title" style={{ fontSize: 22 }}>
          {issue ? "Edit issue" : "Log an issue"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,170px),1fr))", gap: 10 }}>
          <div className="field">
            <label htmlFor="is-team">Team</label>
            <select id="is-team" className="input" value={f.team} onChange={(e) => up({ team: e.target.value })}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {!teams.some((t) => t.id === f.team) && <option value={f.team}>{s.cal.O.by[f.team]?.name ?? f.team}</option>}
            </select>
          </div>
          <div className="field">
            <label htmlFor="is-date">Date</label>
            <input id="is-date" className="input" type="date" max={s.today} value={f.date} onChange={(e) => up({ date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="is-tk">Ticket no. (if applicable)</label>
            <input id="is-tk" className="input" maxLength={60} value={f.ticket ?? ""} onChange={(e) => up({ ticket: e.target.value })} />
          </div>
        </div>
        {area("desc", "Issue description", "What went wrong")}
        {area("root", "Root cause", "Why it happened")}
        {area("preventive", "Preventive solution", "What stops it happening again")}
        {area("corrective", "Corrective action", "What was done to fix it")}
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            disabled={!f.desc.trim() || !f.team || !f.date}
            onClick={() => {
              s.run({ type: "saveIssue", issue: f, actor: s.me });
              onClose();
            }}
          >
            {issue ? "Save" : "Log issue"}
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}
