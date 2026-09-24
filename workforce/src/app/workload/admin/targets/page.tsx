"use client";

import { Blueprint, PageHead } from "@/components/ui";
import { M, dur } from "@/lib/workload/clock";
import { PEOPLE, TEAM, TRADES, trPath } from "@/lib/workload/constants";
import { useWorkload } from "@/lib/workload/store";
import type { Settings, WorkingTime } from "@/lib/workload/types";

/** Number input that commits on blur, so typing isn't interrupted by clamping. */
function NumInput({ id, value, onCommit, step, min, width, placeholder }: {
  id?: string;
  value: number | string;
  onCommit: (raw: string) => void;
  step?: number;
  min?: number;
  width?: number;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      key={String(value)}
      className="input"
      type="number"
      step={step}
      min={min}
      placeholder={placeholder}
      defaultValue={value}
      onBlur={(e) => e.target.value !== String(value) && onCommit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      style={width ? { width } : undefined}
    />
  );
}

export default function TargetsPage() {
  const { data, run } = useWorkload();
  const s = data.settings;
  const w = s.work;
  const set = (patch: Partial<Settings>) => run({ type: "setSettings", patch });
  const setW = (k: keyof WorkingTime, v: number) => set({ work: { ...w, [k]: v } });
  const other = Math.round(w.shift * 60 - w.b1 - w.b2 - w.prod * 60);

  return (
    <>
      <PageHead
        title={`Targets · ${TEAM.name}`}
        style={{ maxWidth: "85ch" }}
        sub="Working time sets the productive hours used for utilization. Targets set how many tasks a member should finish in a full day; productivity compares tasks done with the target, pro-rated for the part of the shift that has passed."
      />
      <Blueprint as="section" className="panel">
        <h2 className="h2">Working time per member</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, alignItems: "end" }}>
          <div className="field">
            <label htmlFor="w-shift">Shift (hours)</label>
            <NumInput id="w-shift" step={0.5} value={w.shift} onCommit={(v) => setW("shift", Math.max(1, Number(v) || 9))} />
          </div>
          <div className="field">
            <label htmlFor="w-b1">1st break (minutes)</label>
            <NumInput id="w-b1" value={w.b1} onCommit={(v) => setW("b1", Math.max(0, Number(v) || 0))} />
          </div>
          <div className="field">
            <label htmlFor="w-b2">2nd break (minutes)</label>
            <NumInput id="w-b2" value={w.b2} onCommit={(v) => setW("b2", Math.max(0, Number(v) || 0))} />
          </div>
          <div className="field">
            <label htmlFor="w-prod">Productive work (hours)</label>
            <NumInput id="w-prod" step={0.1} value={w.prod} onCommit={(v) => setW("prod", Math.max(0, Number(v) || 0))} />
          </div>
          <div className="stat-box">
            <span>Ad hoc, meetings, other</span>
            <span style={{ color: other >= 0 ? "var(--color-text)" : "var(--color-accent-800)" }}>
              {other >= 0 ? dur(other * M) : "Over by " + dur(-other * M)}
            </span>
          </div>
        </div>
      </Blueprint>
      <div className="grid-2">
        <Blueprint as="section" className="panel tight">
          <h2 className="h2">Target per trade</h2>
          <table className="table">
            <thead>
              <tr>
                <th>System › Trade</th>
                <th>Members</th>
                <th>Tasks per day</th>
              </tr>
            </thead>
            <tbody>
              {TRADES.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{trPath(t.id)}</td>
                  <td>{PEOPLE.filter((p) => p.trades[0] === t.id).length}</td>
                  <td>
                    <NumInput
                      min={0}
                      width={100}
                      value={s.targets[t.id] ?? 0}
                      onCommit={(v) => set({ targets: { ...s.targets, [t.id]: Math.max(0, Number(v) || 0) } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Blueprint>
        <Blueprint as="section" className="panel tight">
          <h2 className="h2">Member overrides</h2>
          <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>Leave blank to use the trade target, e.g. for new joiners on a lower target.</span>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trade (target)</th>
                  <th>Own target</th>
                </tr>
              </thead>
              <tbody>
                {PEOPLE.filter((p) => p.trades.length)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td style={{ color: "var(--color-neutral-800)" }}>
                        {trPath(p.trades[0])} ({s.targets[p.trades[0]] ?? 0})
                      </td>
                      <td>
                        <NumInput
                          min={0}
                          width={100}
                          placeholder="—"
                          value={s.memberTargets[p.id] ?? ""}
                          onCommit={(v) => set({ memberTargets: { ...s.memberTargets, [p.id]: v } })}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Blueprint>
      </div>
    </>
  );
}
