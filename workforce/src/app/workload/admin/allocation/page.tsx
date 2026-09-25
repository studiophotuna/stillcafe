"use client";

import { Blueprint, PageHead } from "@/components/ui";
import { MODES, PR } from "@/lib/workload/constants";
import { ticketField } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import type { OrderRule, Priority, Settings } from "@/lib/workload/types";

export default function AllocationPage() {
  const { data, run, toast } = useWorkload();
  const s = data.settings;
  const set = (patch: Partial<Settings>) => run({ type: "setSettings", patch });

  return (
    <>
      <PageHead title={`Allocation · ${data.org.team.name}`} sub="How tasks reach people in this team. Changes save immediately." />
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
            <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 14 }}>
              <input
                type="checkbox"
                className="check"
                checked={s.slaWeekends !== false}
                onChange={() => set({ slaWeekends: s.slaWeekends === false })}
              />
              Count weekends in the due time
            </label>
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
              {s.slaWeekends === false
                ? "Saturdays and Sundays are skipped: a task received Friday afternoon with a 24-hour SLA is due Monday afternoon, and overdue time doesn’t grow over the weekend."
                : "Due time runs through weekends. Untick to skip Saturdays and Sundays."}
            </span>
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
      <Blueprint as="section" className="panel">
        <h2 className="h2">Reminders and ticket number</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, alignItems: "end" }}>
          <div className="field">
            <label htmlFor="stale">Remind about tasks waiting this many days (0 = off)</label>
            <input
              id="stale"
              className="input"
              type="number"
              min={0}
              max={60}
              defaultValue={s.staleDays ?? 2}
              onBlur={(e) => {
                const v = Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0)));
                e.target.value = String(v);
                set({ staleDays: v });
              }}
            />
            <span className="small" style={{ fontSize: 12 }}>
              A pop-up lists open tasks received that long ago (admins: the team’s; members: their own), and overtime waiting that long for approvers. Once a day.
            </span>
          </div>
          <div className="field">
            <label htmlFor="tfield">Ticket number field</label>
            <select id="tfield" className="input" value={ticketField(data)?.key ?? ""} onChange={(e) => set({ ticketField: e.target.value })}>
              <option value="">None</option>
              {data.fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <span className="small" style={{ fontSize: 12 }}>Shown as the first column in Queue and Task history, and searchable.</span>
          </div>
        </div>
      </Blueprint>
    </>
  );
}
