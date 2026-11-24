"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Seg } from "@/components/calendar/bits";
import { Blueprint } from "@/components/ui";
import type { KpiPatch } from "@/lib/calendar/actions";
import { useCalendar } from "@/lib/calendar/store";
import { isWeek, kpiKey, periodLabel, recentMonths, recentWeeks } from "@/lib/calendar/trackers";
import type { KpiEntry, OrgNode } from "@/lib/calendar/types";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/** Week or month for the trackers (remembered on this device); defaults to the current week. */
export function usePeriod() {
  const s = useCalendar();
  const weeks = recentWeeks(s.today, 26);
  const months = recentMonths(s.today, 12);
  const [period, setPeriod] = useState(weeks[0]);
  useEffect(() => {
    const v = read("wf-tracker-period");
    if (v && (weeks.includes(v) || months.includes(v))) setPeriod(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (v: string) => {
    setPeriod(v);
    write("wf-tracker-period", v);
  };
  return { period, setPeriod: set, weeks, months };
}

export function PeriodPicker({ p }: { p: ReturnType<typeof usePeriod> }) {
  const week = isWeek(p.period);
  const list = week ? p.weeks : p.months;
  return (
    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <Seg
        name="tr-kind"
        value={week ? "week" : "month"}
        options={[
          ["week", "Week"],
          ["month", "Month"],
        ]}
        onChange={(k) => p.setPeriod(k === "week" ? p.weeks[0] : p.months[0])}
      />
      <select className="input" aria-label={week ? "Week" : "Month"} value={p.period} onChange={(e) => p.setPeriod(e.target.value)} style={{ width: "auto", maxWidth: "100%" }}>
        {list.map((x) => (
          <option key={x} value={x}>
            {periodLabel(x)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A remark for a team and period: editable by its leads and above (saved when leaving the box). */
export function RemarkCell({ team, period, field, value, editable }: { team: string; period: string; field: "remark" | "otRemark"; value: string; editable: boolean }) {
  const s = useCalendar();
  if (!editable) return <span style={{ whiteSpace: "pre-wrap" }}>{value || <span className="muted">—</span>}</span>;
  return (
    <textarea
      key={value}
      className="input"
      aria-label="Remarks"
      rows={value.length > 80 ? 3 : 1}
      maxLength={1000}
      defaultValue={value}
      placeholder="Add remarks"
      style={{ minWidth: 240, resize: "vertical", padding: "6px 8px", minHeight: 34 }}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== value) s.run({ type: "setKpi", team, period, patch: { [field]: v || null }, actor: s.me });
      }}
    />
  );
}

type Fig = "util" | "prod" | "time" | "acc" | "reg" | "rd" | "hol";
const LABEL: Record<Fig, string> = {
  util: "Utilization %",
  prod: "Productivity %",
  time: "Timeliness %",
  acc: "Accuracy %",
  reg: "REG OT (hours)",
  rd: "RD OT (hours)",
  hol: "HOL OT (hours)",
};

/** Enter a team's KPIs or overtime for a period (used instead of Workload's figures; blank = Workload's). */
export function FiguresDialog({ team, period, kind, onClose }: { team: OrgNode; period: string; kind: "ot" | "kpi"; onClose: () => void }) {
  const s = useCalendar();
  const e: KpiEntry = s.data.kpi?.[kpiKey(team.id, period)] ?? {};
  const keys: Fig[] = kind === "ot" ? ["reg", "rd", "hol"] : ["util", "prod", "time", "acc"];
  const [v, setV] = useState<Record<Fig, string>>(() => Object.fromEntries(keys.map((k) => [k, e[k] === undefined ? "" : String(e[k])])) as Record<Fig, string>);
  const save = () => {
    const patch: KpiPatch = {};
    for (const k of keys) patch[k] = v[k].trim() === "" ? null : Number(v[k]);
    s.run({ type: "setKpi", team: team.id, period, patch, actor: s.me });
    onClose();
  };
  return (
    <Modal onClose={onClose} width={520}>
      <div className="dialog-scroll" style={{ padding: 20, gap: 12 }}>
        <div className="dialog-title" style={{ fontSize: 22 }}>
          {kind === "ot" ? "Overtime" : "KPIs"} · {team.name}
        </div>
        <span className="small">
          {periodLabel(period)}. For teams whose figures come from other tools. Blank uses Workload’s figures (when the team uses Workload).
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
          {keys.map((k) => (
            <div className="field" key={k}>
              <label htmlFor={"fg-" + k}>{LABEL[k]}</label>
              <input id={"fg-" + k} className="input" type="number" min={0} step="0.1" value={v[k]} onChange={(x) => setV((y) => ({ ...y, [k]: x.target.value }))} />
            </div>
          ))}
        </div>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint as="button" className="btn btn-primary btn-40" style={{ padding: "0 18px" }} onClick={save}>
            Save
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}

/** Rows grouped by tower, in tower then team name order. */
export function byTower<R extends { team: OrgNode; tower: OrgNode | null }>(rows: R[]) {
  const groups = new Map<string, { tower: OrgNode | null; rows: R[] }>();
  for (const r of rows) {
    const k = r.tower?.id ?? "";
    if (!groups.has(k)) groups.set(k, { tower: r.tower, rows: [] });
    groups.get(k)!.rows.push(r);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.team.name.localeCompare(b.team.name)) }))
    .sort((a, b) => (a.tower?.name ?? "").localeCompare(b.tower?.name ?? ""));
}

export const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
export const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
