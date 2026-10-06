"use client";

import { useEffect, useMemo, useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { FiguresDialog, PeriodPicker, RemarkCell, byTower, num, pct, usePeriod } from "@/components/calendar/Trackers";
import { useCalendar } from "@/lib/calendar/store";
import { canTrack, otRow, otTotal, periodLabel, type OtRow } from "@/lib/calendar/trackers";
import type { OrgNode } from "@/lib/calendar/types";
import { useCalView } from "@/lib/calendar/useCalView";
import { useTrackerStats } from "@/lib/calendar/useTrackerStats";
import { downloadSheets } from "@/lib/workload/excel";

/**
 * OT tracker: per team and week (or month), headcount, PTO, working hours and approved
 * overtime by kind, with the share of working hours and the leads' remarks; tower totals and
 * the overall total. Overtime comes from Workload, or is entered for teams on other tools.
 */
export default function OtTrackerPage() {
  const s = useCalendar();
  const v = useCalView();
  const p = usePeriod();
  const stats = useTrackerStats(p.period);
  const [limit, setLimit] = useState(4);
  useEffect(() => {
    try {
      const x = Number(localStorage.getItem("wf-ot-limit"));
      if (x > 0) setLimit(x);
    } catch {}
  }, []);
  const [enter, setEnter] = useState<OrgNode | null>(null);
  const rows = useMemo(() => v.scopeBranches.map((b) => otRow(s.cal, b, p.period, stats.teams[b.id])), [v.scopeBranches, s.cal, p.period, stats.teams]);
  const groups = byTower(rows);
  const all = otTotal(rows);
  const hot = (n: number | null) => n !== null && limit > 0 && n >= limit;
  const cell = (n: number | null) => <td style={{ textAlign: "right", background: hot(n) ? "#fde2e1" : undefined, color: hot(n) ? "#b3261e" : undefined }}>{pct(n)}</td>;
  const nums = (x: Pick<OtRow, "hours" | "total" | "hc" | "pto" | "reg" | "rd" | "hol">) =>
    [x.hours, x.total, x.hc, x.pto, x.reg, x.rd, x.hol].map((n, i) => (
      <td key={i} style={{ textAlign: "right" }}>
        {num(n)}
      </td>
    ));

  const download = async () => {
    const head = ["Department", "Team", "Period", "% Overall OT", "% Overall OT (HOL excluded)", "Working hours", "Total overtime", "HC", "PTO", "REG OT", "RD OT", "HOL OT", "Source", "TL / Managers remarks"];
    const line = (tower: string, team: string, x: ReturnType<typeof otTotal> | OtRow, src = "", remark = "") => [
      tower,
      team,
      periodLabel(p.period),
      x.pct,
      x.pctNoHol,
      x.hours,
      x.total,
      x.hc,
      x.pto,
      x.reg,
      x.rd,
      x.hol,
      src,
      remark,
    ];
    await downloadSheets(`OT-tracker_${p.period}.xlsx`, [
      {
        name: "OT tracker",
        rows: [
          head,
          ...groups.flatMap((g) => [
            ...g.rows.map((r) => line(g.tower?.name ?? "", r.team.name, r, r.src === "manual" ? "Entered" : r.src === "workload" ? "Workload" : "", r.remark)),
            line(g.tower?.name ?? "", "Total overtime", otTotal(g.rows)),
          ]),
          line("Overall", "", all),
        ],
      },
    ]).catch(() => s.toast("The export couldn’t be created. Try again."));
  };

  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>OT tracker · {v.unitLabel}</h1>
          <span>
            Working hours = HC × working days × 8 − PTO × 8 (half-day leave counts 0.5). % Overall OT = total overtime ÷ working hours. Overtime is approved
            overtime from Workload, or entered for teams on other tools.
          </span>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <PeriodPicker p={p} />
          <label className="row small" style={{ gap: 6 }}>
            Highlight from
            <input
              className="input"
              type="number"
              min={0}
              step={0.5}
              value={limit}
              onChange={(e) => {
                const x = Math.max(0, Number(e.target.value) || 0);
                setLimit(x);
                try {
                  localStorage.setItem("wf-ot-limit", String(x));
                } catch {}
              }}
              style={{ width: 70 }}
            />
            %
          </label>
          <button className="btn btn-secondary btn-36" onClick={download}>
            <Icon name="download" size={16} />
            Download Excel
          </button>
        </div>
      </div>
      {stats.error && <Blueprint className="panel">{stats.error}</Blueprint>}
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 1250 }}>
          <thead>
            <tr>
              <th>Team</th>
              <th style={{ textAlign: "right" }}>% Overall OT</th>
              <th style={{ textAlign: "right" }}>% OT (HOL excl.)</th>
              <th style={{ textAlign: "right" }}>Working hours</th>
              <th style={{ textAlign: "right" }}>Total OT</th>
              <th style={{ textAlign: "right" }}>HC</th>
              <th style={{ textAlign: "right" }}>PTO</th>
              <th style={{ textAlign: "right" }}>REG OT</th>
              <th style={{ textAlign: "right" }}>RD OT</th>
              <th style={{ textAlign: "right" }}>HOL OT</th>
              <th>TL / Managers remarks</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const t = otTotal(g.rows);
              return [
                ...(groups.length > 1 || v.multi
                  ? [
                      <tr key={(g.tower?.id ?? "") + "-h"}>
                        <td colSpan={11} style={{ fontWeight: 700, background: "var(--color-neutral-100, #f1f3f6)" }}>
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
                          {r.src === "manual" ? "Overtime entered" : r.src === "workload" ? "From Workload" : stats.loading ? "Loading…" : "No Workload data"}
                          {mine && (
                            <>
                              {" · "}
                              <button className="hc-name" onClick={() => setEnter(r.team)}>
                                Enter overtime
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      {cell(r.pct)}
                      {cell(r.pctNoHol)}
                      {nums(r)}
                      <td>
                        <RemarkCell team={r.team.id} period={p.period} field="otRemark" value={r.remark} editable={mine} />
                      </td>
                    </tr>
                  );
                }),
                ...(g.rows.length > 1
                  ? [
                      <tr key={(g.tower?.id ?? "") + "-t"} style={{ fontWeight: 600 }}>
                        <td>Total · {g.tower?.name ?? ""}</td>
                        {cell(t.pct)}
                        {cell(t.pctNoHol)}
                        {nums(t)}
                        <td />
                      </tr>,
                    ]
                  : []),
              ];
            })}
            {rows.length > 1 && groups.length > 1 && (
              <tr style={{ fontWeight: 700 }}>
                <td>Overall</td>
                {cell(all.pct)}
                {cell(all.pctNoHol)}
                {nums(all)}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </Blueprint>
      {enter && <FiguresDialog team={enter} period={p.period} kind="ot" onClose={() => setEnter(null)} />}
    </>
  );
}
