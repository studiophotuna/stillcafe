"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { FiguresDialog, PeriodPicker, RemarkCell, byTower, pct, usePeriod } from "@/components/calendar/Trackers";
import { useCalendar } from "@/lib/calendar/store";
import { canTrack, kpiRow, periodLabel } from "@/lib/calendar/trackers";
import type { OrgNode } from "@/lib/calendar/types";
import { useCalView } from "@/lib/calendar/useCalView";
import { useTrackerStats } from "@/lib/calendar/useTrackerStats";
import { downloadSheets } from "@/lib/workload/excel";

/**
 * KPI tracker: utilization, productivity, timeliness and accuracy per team for a week or
 * month, with the leads' remarks. Workload teams get their figures from Workload (accuracy
 * from the issues logged against tickets resolved); other teams enter theirs.
 */
export default function KpiTrackerPage() {
  const s = useCalendar();
  const v = useCalView();
  const p = usePeriod();
  const stats = useTrackerStats(p.period);
  const [enter, setEnter] = useState<OrgNode | null>(null);
  const rows = useMemo(() => v.scopeBranches.map((b) => kpiRow(s.cal, b, p.period, stats.teams[b.id])), [v.scopeBranches, s.cal, p.period, stats.teams]);
  const groups = byTower(rows);
  const cell = (n: number | null) => <td style={{ textAlign: "right" }}>{pct(n)}</td>;

  const download = async () => {
    await downloadSheets(`KPI-tracker_${p.period}.xlsx`, [
      {
        name: "KPI tracker",
        rows: [
          ["Department", "Team", "Period", "Utilization %", "Productivity %", "Timeliness %", "Accuracy %", "Issues", "Tickets resolved", "Source", "Remarks"],
          ...groups.flatMap((g) =>
            g.rows.map((r) => [
              g.tower?.name ?? "",
              r.team.name,
              periodLabel(p.period),
              r.util,
              r.prod,
              r.time,
              r.acc,
              r.issues,
              r.done,
              r.src === "manual" ? "Entered" : r.src === "workload" ? "Workload" : "",
              r.remark,
            ]),
          ),
        ],
      },
    ]).catch(() => s.toast("The export couldn’t be created. Try again."));
  };

  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>KPI tracker · {v.unitLabel}</h1>
          <span>
            Utilization, productivity and timeliness as on the Workload dashboard. Accuracy = 1 − issues logged ÷ tickets resolved (see{" "}
            <Link href="/calendar/admin/accuracy">Accuracy log</Link>). Teams on other tools enter their KPIs.
          </span>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <PeriodPicker p={p} />
          <button className="btn btn-secondary btn-36" onClick={download}>
            <Icon name="download" size={16} />
            Download Excel
          </button>
        </div>
      </div>
      {stats.error && <Blueprint className="panel">{stats.error}</Blueprint>}
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              <th>Team</th>
              <th style={{ textAlign: "right" }}>Utilization</th>
              <th style={{ textAlign: "right" }}>Productivity</th>
              <th style={{ textAlign: "right" }}>Timeliness</th>
              <th style={{ textAlign: "right" }}>Accuracy</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              ...(groups.length > 1 || v.multi
                ? [
                    <tr key={(g.tower?.id ?? "") + "-h"}>
                      <td colSpan={6} style={{ fontWeight: 700, background: "var(--color-neutral-100, #f1f3f6)" }}>
                        {g.tower?.name ?? "No tower"}
                      </td>
                    </tr>,
                  ]
                : []),
              ...g.rows.map((r) => {
                const mine = canTrack(s.cal, s.me, r.team.id);
                return (
                  <tr key={r.team.id}>
                    <td>
                      <strong style={{ fontWeight: 500 }}>{r.team.name}</strong>
                      <div className="small">
                        {r.src === "manual" ? "KPIs entered" : r.src === "workload" ? "From Workload" : stats.loading ? "Loading…" : "No Workload data"}
                        {mine && (
                          <>
                            {" · "}
                            <button className="hc-name" onClick={() => setEnter(r.team)}>
                              Enter KPIs
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    {cell(r.util)}
                    {cell(r.prod)}
                    {cell(r.time)}
                    <td style={{ textAlign: "right" }}>
                      {pct(r.acc)}
                      {r.issues > 0 && (
                        <div className="small">
                          <Link href="/calendar/admin/accuracy">
                            {r.issues} issue{r.issues === 1 ? "" : "s"}
                          </Link>
                          {r.done ? ` of ${r.done} resolved` : ""}
                        </div>
                      )}
                    </td>
                    <td>
                      <RemarkCell team={r.team.id} period={p.period} field="remark" value={r.remark} editable={mine} />
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </Blueprint>
      {enter && <FiguresDialog team={enter} period={p.period} kind="kpi" onClose={() => setEnter(null)} />}
    </>
  );
}
