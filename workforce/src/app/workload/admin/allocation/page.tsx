"use client";

import Link from "next/link";
import { Blueprint, PageHead } from "@/components/ui";
import { MODES } from "@/lib/workload/constants";
import { ticketField } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import type { OrderRule, Settings } from "@/lib/workload/types";

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
          {s.mode === "self" && (
            <div className="field">
              <label htmlFor="multi">Members pick: tasks a member can pick</label>
              <select
                id="multi"
                className="input"
                value={s.multiPick ? "multi" : "one"}
                onChange={(e) => {
                  set({ multiPick: e.target.value === "multi" });
                  toast("Saved.");
                }}
              >
                <option value="one">One: Take starts the task right away</option>
                <option value="multi">Several: Pick adds tasks to their list, then they start one at a time</option>
              </select>
            </div>
          )}
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
            <span>Members resolve a ticket or set it to pending before starting the next. Tasks are only given to people allocated to the task’s system and trade.</span>
          </div>
          <div className="rule-text">
            <strong style={{ fontWeight: 500 }}>SLA and task types</strong>
            <span>
              The standard SLA, task types with their own SLA, and whether weekends and holidays count are set in{" "}
              <Link href="/workload/admin/sla">Admin › SLA &amp; task types</Link>.
            </span>
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
