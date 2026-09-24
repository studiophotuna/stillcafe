"use client";

import { Blueprint, PageHead } from "@/components/ui";
import { MODES, PR, TEAM } from "@/lib/workload/constants";
import { useWorkload } from "@/lib/workload/store";
import type { OrderRule, Priority, Settings } from "@/lib/workload/types";

export default function AllocationPage() {
  const { data, run, toast } = useWorkload();
  const s = data.settings;
  const set = (patch: Partial<Settings>) => run({ type: "setSettings", patch });

  return (
    <>
      <PageHead title={`Allocation · ${TEAM.name}`} sub="How tasks reach people in this team. Changes save immediately." />
      <div className="grid-2">
        <Blueprint as="section" className="panel" style={{ gap: 10 }}>
          <h2 className="h2">Allocation method</h2>
          <div role="radiogroup" aria-label="Allocation method" style={{ display: "contents" }}>
            {MODES.map(([k, label, desc]) => (
              <button
                key={k}
                role="radio"
                aria-checked={s.mode === k}
                className="mode-card"
                onClick={() => {
                  set({ mode: k });
                  toast(`Allocation set to ${label}.`);
                }}
              >
                <span className="mode-radio">
                  <span />
                </span>
                <span className="mode-text">
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Blueprint>
        <Blueprint as="section" className="panel" style={{ gap: 14 }}>
          <h2 className="h2">Rules</h2>
          <div className="field">
            <label htmlFor="feed">After a task is done</label>
            <select
              id="feed"
              className="input"
              value={s.autoFeed ? "auto" : "click"}
              onChange={(e) => {
                set({ autoFeed: e.target.value === "auto" });
                toast("Saved.");
              }}
            >
              <option value="auto">Give the next task automatically</option>
              <option value="click">Member clicks Start work again</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="order">Task order</label>
            <select id="order" className="input" value={s.order} onChange={(e) => set({ order: e.target.value as OrderRule })}>
              <option value="priority">Priority first, then due time, then oldest</option>
              <option value="received">Oldest received first</option>
            </select>
          </div>
          <label className="rule">
            <input type="checkbox" className="check" checked={s.skipUnavail} onChange={() => set({ skipUnavail: !s.skipUnavail })} />
            <span className="rule-text">
              <strong>Skip people who are unavailable</strong>
              <span>Uses the Calendar: people on leave, on a rest day or outside their shift don’t receive tasks.</span>
            </span>
          </label>
          <div className="rule-text">
            <strong style={{ fontWeight: 500 }}>One task in progress at a time</strong>
            <span>Members finish or put a task on hold before starting the next. Tasks are only given to people allocated to the task’s system and trade.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Timeliness SLA by priority, in hours from received</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {(["high", "normal", "low"] as Priority[]).map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={"sla-" + k}>{PR[k][0]}</label>
                  <input
                    id={"sla-" + k}
                    className="input"
                    type="number"
                    min={1}
                    defaultValue={s.sla[k]}
                    onBlur={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      e.target.value = String(v);
                      set({ sla: { ...s.sla, [k]: v } });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </Blueprint>
      </div>
    </>
  );
}
