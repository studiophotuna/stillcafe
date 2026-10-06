"use client";

import { useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Blueprint, Icon, PageHead } from "@/components/ui";
import { dur, fmtT } from "@/lib/workload/clock";
import { fieldOptions } from "@/lib/workload/constants";
import { cxCheck, cxField, cxLevels, cxQuestions, cxText, cxTotal, personOf, ticketOf } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import type { Complexity, CxLevel, Task } from "@/lib/workload/types";

const DEFAULT_LEVELS: CxLevel[] = [
  { id: "simple", name: "Simple", aht: 30 },
  { id: "medium", name: "Medium", aht: 60 },
  { id: "complex", name: "Complex", aht: 120 },
];

/**
 * Complexity: members tag each ticket's contracts by level at Mark done (e.g. 1 Simple,
 * 2 Complex). Each level has its own daily target (counted before task type and member
 * targets) and an average handling time; tickets whose worked time is far from what the
 * tagging implies are listed here for an admin to confirm or correct.
 */
export default function ComplexityPage() {
  const { data, run, setDialog, me } = useWorkload();
  const s = data.settings;
  const cx: Complexity = s.complexity ?? { on: false, levels: [], tol: 50 };
  const set = (patch: Partial<Complexity>) => run({ type: "setSettings", patch: { complexity: { ...cx, ...patch } } });
  const setLevel = (id: string, patch: Partial<CxLevel>) => set({ levels: cx.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const [showChecked, setShowChecked] = useState(false);
  const [fix, setFix] = useState<Task | null>(null);
  const [edit, setEdit] = useState<Task | null>(null);
  const qs = cxQuestions(data);
  const checked = data.tasks
    .filter((t) => t.cxReview)
    .sort((a, b) => b.cxReview!.at - a.cxReview!.at)
    .slice(0, 50);
  const on = cx.on && cxLevels(s).length > 0;
  const numFields = data.fields.filter((f) => f.type === "number");
  const num = (v: string, max: number) => {
    const n = Number(v);
    return v.trim() === "" || !(n > 0) ? undefined : Math.min(max, Math.round(n * 10) / 10);
  };
  const name = (pid: number | null) => (pid === null ? "—" : (personOf(data, pid)?.name ?? "—"));
  const row = (t: Task) => {
    const chk = cxCheck(data, t);
    return (
      <tr key={t.id}>
        <td className="nowrap">
          <button className="hc-name" onClick={() => setDialog({ kind: "task", id: t.id })}>
            {t.id}
          </button>
          {ticketOf(data, t) ? <span className="small"> · {ticketOf(data, t)}</span> : null}
        </td>
        <td className="nowrap">{name(t.assignee)}</td>
        <td className="nowrap">{t.doneAt ? fmtT(t.doneAt) : "—"}</td>
        <td>{cxText(s, t.cx)}</td>
        <td className="nowrap">
          {chk ? (
            <>
              {dur(chk.actMs)} <span className="muted">of {dur(chk.expMs)} expected</span>
            </>
          ) : (
            "—"
          )}
        </td>
        <td>
          {t.cxReview ? (
            <span className="small">
              {t.cxReview.verdict === "ok" ? "Confirmed" : `Corrected from ${cxText(s, t.cxReview.was)}`} by {name(t.cxReview.by)}
              {t.cxReview.note ? ` · ${t.cxReview.note}` : ""}
            </span>
          ) : chk?.flag === "slow" ? (
            <span className="tag tag-outline">Took longer · maybe tagged too simple</span>
          ) : chk?.flag === "fast" ? (
            <span className="tag tag-amber">Very fast · {chk.pct}% productivity · check tagging and details</span>
          ) : null}
        </td>
        <td className="nowrap" style={{ textAlign: "right" }}>
          {!t.cxReview && (
            <button className="btn btn-ghost" onClick={() => run({ type: "reviewCx", id: t.id, by: me.id })}>
              Looks right
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setFix(t)}>
            Correct
          </button>
          <button className="btn btn-ghost" onClick={() => setEdit(t)}>
            Edit ticket
          </button>
        </td>
      </tr>
    );
  };

  return (
    <>
      <PageHead
        title={`Complexity · ${data.org.team.name}`}
        sub="Members tag the contracts in each ticket by complexity when they resolve it, e.g. 1 Simple and 2 Complex. Each level has its own daily target, used before task type and member targets, and an average handling time used to question tagging that doesn’t match the time worked."
      />
      <div className="grid-2">
        <Blueprint as="section" className="panel" style={{ gap: 12 }}>
          <label className="check-row">
            <input
              type="checkbox"
              className="check"
              checked={cx.on}
              onChange={() =>
                set({
                  on: !cx.on,
                  levels: cx.levels.length ? cx.levels : DEFAULT_LEVELS,
                  tol: cx.tol ?? 50,
                  field: cx.field ?? numFields.find((f) => f.key === s.prodBasis)?.key ?? numFields.find((f) => /contract/i.test(f.key + f.label))?.key,
                })
              }
            />
            <span>
              <strong>Tag contracts by complexity</strong>
              <span className="small">
                {cx.on ? "Resolve ticket asks for the number of contracts per level." : "Off: tickets count as usual (task type or member target)."}
              </span>
            </span>
          </label>
          <div className="field">
            <label htmlFor="cx-field">Total contracts go into</label>
            <select id="cx-field" className="input" value={cxField(data)?.key ?? ""} onChange={(e) => set({ field: e.target.value })}>
              <option value="">No field</option>
              {numFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <span className="small">Filled in from the counts at Resolve ticket, so members don’t enter it twice.</span>
          </div>
          <div className="field">
            <label htmlFor="cx-tol">Question the tagging when the time worked is longer than expected by more than</label>
            <div className="row" style={{ gap: 6 }}>
              <input
                id="cx-tol"
                key={cx.tol}
                className="input"
                type="number"
                min={10}
                max={300}
                step={5}
                defaultValue={cx.tol ?? 50}
                style={{ width: 100 }}
                onBlur={(e) => {
                  const v = Math.min(300, Math.max(10, Math.round(Number(e.target.value) || 50)));
                  e.target.value = String(v);
                  if (v !== (cx.tol ?? 50)) set({ tol: v });
                }}
              />
              <span>%</span>
            </div>
            <span className="small">
              From the expected time (contracts × average handling time). At {cx.tol ?? 50}%: 3 Simple at 30 min = 1 h 30 min expected, questioned when it took more than{" "}
              {dur(90 * 60000 * (1 + (cx.tol ?? 50) / 100))}.
            </span>
          </div>
          <div className="field">
            <label htmlFor="cx-fast">Flag over-productive tickets: productivity (expected ÷ time worked) at or above</label>
            <div className="row" style={{ gap: 6 }}>
              <input
                id="cx-fast"
                key={cx.fast ?? 200}
                className="input"
                type="number"
                min={0}
                max={1000}
                step={10}
                defaultValue={cx.fast ?? 200}
                style={{ width: 100 }}
                onBlur={(e) => {
                  const v = Math.min(1000, Math.max(0, Math.round(Number(e.target.value) || 0)));
                  e.target.value = String(v);
                  if (v !== (cx.fast ?? 200)) set({ fast: v });
                }}
              />
              <span>%</span>
            </div>
            <span className="small">
              {(cx.fast ?? 200) > 0
                ? `At ${cx.fast ?? 200}%: 1 h 30 min expected is flagged when done in ${dur((90 * 60000 * 100) / (cx.fast ?? 200))} or less. 0 = off.`
                : "Off. Enter a % to flag tickets done much faster than expected."}
            </span>
          </div>
        </Blueprint>
        <Blueprint as="section" className="panel" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h2">Levels</h2>
            <button
              className="btn btn-secondary btn-36"
              onClick={() => set({ levels: cx.levels.concat({ id: "cx" + Date.now().toString(36), name: `Level ${cx.levels.length + 1}` }) })}
            >
              <Icon name="plus" size={16} />
              Add level
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Target / day</th>
                <th>Avg handling time (min)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cx.levels.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      className="input"
                      aria-label="Level name"
                      key={l.name}
                      defaultValue={l.name}
                      maxLength={40}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== l.name) setLevel(l.id, { name: v });
                        else e.target.value = l.name;
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      aria-label={`${l.name} target per day`}
                      type="number"
                      min={0}
                      step={0.5}
                      key={"t" + l.target}
                      defaultValue={l.target ?? ""}
                      placeholder="Usual target"
                      onBlur={(e) => num(e.target.value, 1000) !== l.target && setLevel(l.id, { target: num(e.target.value, 1000) })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      aria-label={`${l.name} average handling time`}
                      type="number"
                      min={0}
                      step={5}
                      key={"a" + l.aht}
                      defaultValue={l.aht ?? ""}
                      placeholder="Not checked"
                      onBlur={(e) => num(e.target.value, 1440) !== l.aht && setLevel(l.id, { aht: num(e.target.value, 1440) })}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost" disabled={cx.levels.length <= 1} onClick={() => set({ levels: cx.levels.filter((x) => x.id !== l.id) })}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="small">
            Target: contracts of this level one person finishes in a day; each counts 1 ÷ this toward productivity (e.g. 12 Simple, 8 Medium, 4 Complex a day). Blank: the
            task type or member target. Avg handling time blank: tickets with this level aren’t questioned.
          </span>
        </Blueprint>
      </div>

      <Blueprint as="section" className="panel" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2 className="h2">Questions · {qs.length}</h2>
            <span className="small">
              Done tickets that took much longer (excluding breaks and time pending) than their complexity suggests, or were done far quicker (over-productive).
              Confirm the tagging, correct it, or edit the ticket’s details; productivity follows the correction.
            </span>
          </div>
          <label className="row small" style={{ gap: 6, cursor: "pointer" }}>
            <input type="checkbox" className="check" checked={showChecked} onChange={() => setShowChecked(!showChecked)} />
            Show checked
          </label>
        </div>
        {!on ? (
          <div className="banner">Complexity is off. Switch it on above to start tagging.</div>
        ) : qs.length || (showChecked && checked.length) ? (
          <div className="boxed-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Member</th>
                  <th>Done</th>
                  <th>Tagged</th>
                  <th>Time worked</th>
                  <th>Why</th>
                  <th />
                </tr>
              </thead>
              <tbody>{(showChecked ? qs.concat(checked) : qs).map(row)}</tbody>
            </table>
          </div>
        ) : (
          <div className="banner">
            No questions. No tagged ticket took more than {cx.tol ?? 50}% longer than expected{(cx.fast ?? 200) > 0 ? ` or reached ${cx.fast ?? 200}% productivity` : ""}.
          </div>
        )}
      </Blueprint>
      {fix && <FixDialog t={fix} onClose={() => setFix(null)} />}
      {edit && <EditDoneDialog t={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function FixDialog({ t, onClose }: { t: Task; onClose: () => void }) {
  const { data, run, me } = useWorkload();
  const levels = cxLevels(data.settings);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(levels.map((l) => [l.id, t.cx?.[l.id] ? String(t.cx[l.id]) : ""])));
  const [note, setNote] = useState("");
  const counts = Object.fromEntries(levels.map((l) => [l.id, Math.max(0, Math.round(Number(vals[l.id]) || 0))]));
  const chk = cxCheck(data, t);
  return (
    <Modal onClose={onClose} width={520}>
      <div className="dialog-scroll" style={{ padding: 20, gap: 12 }}>
        <div className="dialog-title" style={{ fontSize: 24 }}>
          Complexity · {t.id}
        </div>
        <span className="small">
          Tagged {cxText(data.settings, t.cx)}
          {chk ? ` · ${dur(chk.actMs)} worked, ${dur(chk.expMs)} expected` : ""}
        </span>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(levels.length, 4)}, 1fr)`, gap: 10 }}>
          {levels.map((l) => (
            <div className="field" key={l.id}>
              <label htmlFor={"fx-" + l.id}>{l.name}</label>
              <input id={"fx-" + l.id} className="input" type="number" min={0} step={1} value={vals[l.id]} placeholder="0" onChange={(e) => setVals((x) => ({ ...x, [l.id]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="fx-n">Note (optional)</label>
          <input id="fx-n" className="input" maxLength={300} value={note} placeholder="e.g. 2 of the contracts were complex" onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            disabled={!cxTotal(counts)}
            onClick={() => {
              run({ type: "reviewCx", id: t.id, cx: counts, note, by: me.id });
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

/** Admin: correct a resolved ticket's details (the contracts field follows the complexity counts). */
function EditDoneDialog({ t, onClose }: { t: Task; onClose: () => void }) {
  const { data, run, me } = useWorkload();
  const cf = t.cx && cxTotal(t.cx) > 0 ? cxField(data) : undefined;
  const fields = data.fields.filter((f) => f.key !== cf?.key);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, String(t.fields[f.key] ?? "")])));
  return (
    <Modal onClose={onClose} width={560}>
      <div className="dialog-scroll" style={{ padding: 20, gap: 12 }}>
        <div className="dialog-title" style={{ fontSize: 24 }}>
          Edit ticket · {t.id}
        </div>
        <span className="small">{t.title}. Changes are recorded in the ticket’s history.</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={"ed-" + f.key}>{f.label}</label>
              {f.type === "select" && fieldOptions(f).length ? (
                <select id={"ed-" + f.key} className="input" value={vals[f.key]} onChange={(e) => setVals((x) => ({ ...x, [f.key]: e.target.value }))}>
                  <option value="">—</option>
                  {fieldOptions(f).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={"ed-" + f.key}
                  className="input"
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={vals[f.key]}
                  onChange={(e) => setVals((x) => ({ ...x, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        {cf && <span className="small">{cf.label} follows the complexity counts; use Correct to change them.</span>}
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            onClick={() => {
              run({ type: "editDone", id: t.id, vals, by: me.id });
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
