"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Blueprint, Icon } from "@/components/ui";
import { rightsOf } from "@/lib/calendar/authz";
import { downloadHeadcount } from "@/lib/calendar/excel";
import { MONTHS, headcount, ym, type HcRow } from "@/lib/calendar/headcount";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

const n = (v: number | null) => (v === null ? "" : String(v));

/**
 * Headcount monitoring: Actual and Billed FTE per person and month, by tower and team,
 * from Calendar members (hire date, last day, allocations, role). Admins can override
 * Billed for any month; the download matches the monthly headcount file.
 */
export default function HeadcountPage() {
  const s = useCalendar();
  const v = useCalView();
  const [year, setYear] = useState(Number(s.today.slice(0, 4)));
  const towers = useMemo(() => {
    const r = rightsOf(s.cal, s.me);
    return headcount(s.cal, year, (id) => r.teamAdmin(id));
  }, [s.cal, year, s.me]);
  const [towerId, setTowerId] = useState("");
  const tower = towers.find((t) => t.id === towerId) ?? towers.find((t) => t.teams.some((x) => x.id === v.bid)) ?? towers[0];
  const [edit, setEdit] = useState<{ row: HcRow; team: string; teamName: string; m: number } | null>(null);
  const curM = s.today.startsWith(String(year)) ? Number(s.today.slice(5, 7)) - 1 : -1;
  const title = `${v.dept.name.split(" (")[0].toUpperCase()}`;

  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Headcount · {year}</h1>
          <span style={{ maxWidth: "90ch" }}>
            From Calendar members: counted from the month they were hired through the month of their last day, then 0. A person in two teams counts 0.5 in each.
            Team leads and above are billed 0 unless changed — click a Billed cell to change it.
          </span>
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-icon" aria-label="Previous year" onClick={() => setYear(year - 1)}>
            ‹
          </button>
          <strong>{year}</strong>
          <button className="btn btn-secondary btn-icon" aria-label="Next year" onClick={() => setYear(year + 1)}>
            ›
          </button>
          {towers.length > 1 && (
            <select aria-label="Tower" className="input" value={tower?.id ?? ""} onChange={(e) => setTowerId(e.target.value)} style={{ width: "auto" }}>
              {towers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="btn btn-secondary btn-36"
            disabled={!towers.length}
            onClick={async () => {
              try {
                await downloadHeadcount(towers, year, title);
                s.toast("Headcount downloaded.");
              } catch {
                s.toast("The file couldn’t be created. Try again.");
              }
            }}
          >
            <Icon name="download" size={16} />
            Download Excel (all towers)
          </button>
        </div>
      </div>
      {!tower ? (
        <Blueprint className="panel">No teams you administer.</Blueprint>
      ) : (
        <Blueprint className="scroll-x">
          <table className="table hc">
            <thead>
              <tr>
                <th rowSpan={2}>Cost centre</th>
                <th rowSpan={2}>Process</th>
                <th rowSpan={2}>Employee</th>
                <th rowSpan={2}>Sub process</th>
                <th rowSpan={2}>FTE</th>
                {MONTHS.map((m, i) => (
                  <th key={m} colSpan={2} className={i === curM ? "hc-cur" : undefined} style={{ textAlign: "center" }}>
                    {m.slice(0, 3)}
                  </th>
                ))}
              </tr>
              <tr>
                {MONTHS.map((m) => [
                  <th key={m + "a"} className="hc-n">
                    Act
                  </th>,
                  <th key={m + "b"} className="hc-n">
                    Bill
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {tower.teams.map((tm) => [
                ...tm.rows.map((row, i) => (
                  <tr key={tm.id + row.pid} className={row.lead ? "hc-lead" : undefined}>
                    {i === 0 && (
                      <>
                        <td rowSpan={tm.rows.length} className="hc-team">
                          {tm.costCentre || <span className="small">Set in Settings</span>}
                        </td>
                        <td rowSpan={tm.rows.length} className="hc-team">
                          {tm.name}
                        </td>
                      </>
                    )}
                    <td className="nowrap" style={{ fontWeight: row.lead ? 600 : 400 }}>
                      {row.name}
                    </td>
                    <td className="nowrap">{row.sub}</td>
                    <td className="hc-n">{row.fte}</td>
                    {row.months.map((c, m) => [
                      <td key={m + "a"} className={"hc-n" + (c.actual === null ? " hc-na" : c.actual === 0 ? " hc-zero" : "")}>
                        {n(c.actual)}
                      </td>,
                      <td key={m + "b"} className={"hc-n" + (c.billed === null ? " hc-na" : c.actual === 0 ? " hc-zero" : "") + (c.override ? " hc-ovr" : "")}>
                        {c.actual ? (
                          <button className="hc-cell" title="Change billed" onClick={() => setEdit({ row, team: tm.id, teamName: tm.name, m })}>
                            {n(c.billed)}
                          </button>
                        ) : (
                          n(c.billed)
                        )}
                      </td>,
                    ])}
                  </tr>
                )),
                ...(tm.rows.length
                  ? []
                  : [
                      <tr key={tm.id + "empty"}>
                        <td className="hc-team">{tm.costCentre}</td>
                        <td className="hc-team">{tm.name}</td>
                        <td colSpan={27} className="small">
                          No members.
                        </td>
                      </tr>,
                    ]),
                ...(["without", "withTl"] as const).map((k) => (
                  <tr key={tm.id + k} className="hc-total">
                    <td colSpan={5} style={{ textAlign: "right" }}>
                      Total {tm.name} {k === "without" ? "without TL" : "with TL"}
                    </td>
                    {tm[k].map((x, m) => [
                      <td key={m + "a"} className="hc-n">
                        {x.actual}
                      </td>,
                      <td key={m + "b"} className="hc-n">
                        {x.billed}
                      </td>,
                    ])}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </Blueprint>
      )}
      {edit && <BilledDialog year={year} edit={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function BilledDialog({ year, edit, onClose }: { year: number; edit: { row: HcRow; team: string; teamName: string; m: number }; onClose: () => void }) {
  const s = useCalendar();
  const cell = edit.row.months[edit.m];
  const [val, setVal] = useState(cell.override ? String(cell.billed) : "default");
  const [on, setOn] = useState(true);
  const months = (on ? MONTHS.map((_, i) => i).filter((i) => i >= edit.m) : [edit.m]).map((i) => ym(year, i));
  return (
    <Modal onClose={onClose} width={460}>
      <div className="dialog-scroll" style={{ padding: 20 }}>
        <div className="dialog-title" style={{ fontSize: 24 }}>
          Billed · {edit.row.name}
        </div>
        <span className="small">
          {edit.teamName} · {MONTHS[edit.m]} {year} · FTE {edit.row.fte}
        </span>
        <div className="field">
          <label htmlFor="hc-val">Billed</label>
          <select id="hc-val" className="input" value={val} onChange={(e) => setVal(e.target.value)}>
            <option value="default">Default ({edit.row.lead ? 0 : edit.row.fte})</option>
            {[0, 0.25, 0.5, 0.75, 1].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" className="check" checked={on} onChange={() => setOn(!on)} />
          Also for the following months of {year}
        </label>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            onClick={() => {
              s.run({ type: "setBilled", pid: edit.row.pid, bid: edit.team, months, value: val === "default" ? null : Number(val) });
              onClose();
            }}
          >
            Save
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}
