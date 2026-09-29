"use client";

import { useEffect, useState } from "react";
import { fieldOptions, trPathOf } from "@/lib/workload/constants";
import { nowMs } from "@/lib/workload/clock";
import { fmtMin, missingRequired, otAvailMin, OT_KIND, type AssistOffer, slaText, otProcesses, suggestOtSplit, asksOtSplit, typesFor, cxLevels, cxTotal, cxField } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import type { Priority, Task, OtPart } from "@/lib/workload/types";
import { assignOptions, taskDetail } from "@/lib/workload/view";
import { Blueprint, Icon } from "./ui";

export function Modal({ onClose, width, pad, children }: { onClose: () => void; width?: number; pad?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <Blueprint
        className="dialog solid"
        role="dialog"
        aria-modal="true"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ width: width ? `min(${width}px, 100%)` : undefined, padding: pad ? 20 : 0, gap: pad ? 12 : undefined }}
      >
        {children}
      </Blueprint>
    </div>
  );
}

export function EmailBox({ email, received }: { email: NonNullable<Task["email"]>; received?: string }) {
  return (
    <div className="email">
      <div className="email-head">
        <span>From</span>
        <span>{email.from}</span>
        <span>Cc</span>
        <span>{email.cc}</span>
        {received && (
          <>
            <span>Received</span>
            <span>{received}</span>
          </>
        )}
      </div>
      <strong>{email.subject}</strong>
      <p>{email.body}</p>
      <div className="tags">
        {email.attachments.map((a) => (
          <span key={a} className="tag tag-neutral">
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

function TaskDialog({ id }: { id: string }) {
  const { data, now, run, me, isAdmin, setDialog } = useWorkload();
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return null;
  const v = taskDetail(data, t, now);
  const close = () => setDialog(null);
  const canAdmin = isAdmin && t.status !== "done";
  const canResume = t.assignee === me.id && t.status === "on_hold";
  const busy = data.tasks.some((x) => x.assignee === me.id && x.status === "in_progress");
  return (
    <Modal onClose={close} width={820}>
      <div className="dialog-scroll">
        <div className="task-meta">
          <span className={"tag " + v.stCls}>{v.status}</span>
          <span className={"tag " + v.prCls}>{v.priority}</span>
          <span>
            {t.id} · {v.path} · {v.sourceLabel}
          </span>
        </div>
        <div className="dialog-title" style={{ fontSize: 26, lineHeight: 1.15 }}>
          {t.title}
        </div>
        <span style={{ fontSize: 13.5, color: v.dueColor }}>
          {v.dueText} · received {v.receivedText}
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 18 }}>
          <div className="kv">
            {v.fieldRows.map((f) => (
              <Frag key={f.label} a={f.label} b={f.value} />
            ))}
          </div>
          {t.email && <EmailBox email={t.email} />}
        </div>
        {canAdmin && (
          <div className="admin-box">
            <div className="field">
              <label htmlFor="dt-trade">System › Trade</label>
              <select id="dt-trade" className="input" value={t.trade} onChange={(e) => run({ type: "setTrade", id, trade: e.target.value })}>
                <option value="" disabled>
                  Needs trade
                </option>
                {data.org.trades.map((o) => (
                  <option key={o.id} value={o.id}>
                    {trPathOf(data.org, o.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dt-pr">Priority</label>
              <select id="dt-pr" className="input" value={t.pr} onChange={(e) => run({ type: "setPriority", id, pr: e.target.value as Priority })}>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            {(data.settings.taskTypes?.length || t.ttype) && t.status !== "done" ? (
              <div className="field">
                <label htmlFor="dt-tt">Task type (sets the SLA)</label>
                <select id="dt-tt" className="input" value={t.ttype ?? ""} onChange={(e) => run({ type: "setTaskType", id, ttype: e.target.value })}>
                  <option value="">Standard request · SLA by priority</option>
                  {(data.settings.taskTypes ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {slaText(o.sla)}
                    </option>
                  ))}
                  {t.ttype && !(data.settings.taskTypes ?? []).some((o) => o.id === t.ttype) && (
                    <option value={t.ttype} disabled>
                      Deleted type
                    </option>
                  )}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="dt-rec">Received (team time)</label>
              <input
                id="dt-rec"
                key={t.received}
                className="input"
                type="datetime-local"
                defaultValue={new Date(t.received + 8 * 3600_000).toISOString().slice(0, 16)}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const ms = Date.parse(v + ":00Z") - 8 * 3600_000;
                  if (ms !== t.received) run({ type: "setReceived", id, received: ms });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </div>
            <div className="field">
              <label htmlFor="dt-as">Assign to</label>
              <select
                id="dt-as"
                className="input"
                value={t.assignee === null ? "" : String(t.assignee)}
                onChange={(e) => {
                  const val = e.target.value;
                  run({ type: "assign", id, pid: val === "" ? null : Number(val) });
                }}
              >
                <option value="">Unassigned (in queue)</option>
                {assignOptions(data, t).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="history">
          <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>History</span>
          {v.history.map((h, i) => (
            <span key={i}>
              <span className="muted">{h.at}</span> · {h.text}
            </span>
          ))}
        </div>
        <div className="dialog-actions" style={{ gap: 10 }}>
          {canResume && (
            <button
              className="btn btn-secondary btn-40"
              disabled={busy}
              onClick={() => {
                run({ type: "resume", id, pid: me.id });
                close();
              }}
            >
              Resume
            </button>
          )}
          <button className="btn btn-secondary btn-40" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

const Frag = ({ a, b }: { a: string; b: string }) => (
  <>
    <span>{a}</span>
    <span>{b}</span>
  </>
);

function HoldDialog({ id }: { id: string }) {
  const { run, setDialog } = useWorkload();
  const [reason, setReason] = useState("");
  const close = () => setDialog(null);
  return (
    <Modal onClose={close} pad>
      <div className="dialog-title" style={{ fontSize: 26 }}>
        Pending
      </div>
      <div className="field">
        <label htmlFor="hold-reason">What are you waiting for?</label>
        <textarea
          id="hold-reason"
          className="input"
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Waiting for rate sheet from the carrier"
          style={{ minHeight: 80 }}
        />
      </div>
      <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>
        The ticket stays yours. You can start another ticket while this one is pending.
      </span>
      <div className="dialog-actions" style={{ gap: 10 }}>
        <button className="btn btn-secondary btn-40" onClick={close}>
          Cancel
        </button>
        <Blueprint
          as="button"
          className="btn btn-primary btn-40"
          style={{ padding: "0 18px" }}
          disabled={!reason.trim()}
          onClick={() => {
            run({ type: "hold", id, reason });
            close();
          }}
        >
          Set to pending
        </Blueprint>
      </div>
    </Modal>
  );
}

function DoneDialog({ id }: { id: string }) {
  const { data, run, me, setDialog } = useWorkload();
  const t = data.tasks.find((x) => x.id === id);
  const [vals, setVals] = useState<Task["fields"]>(() => ({ ...(t?.fields ?? {}) }));
  // Complexity: contracts per level; with a number field as the productivity basis, that field is their total.
  const levels = cxLevels(data.settings);
  const [cx, setCx] = useState<Record<string, string>>(() => Object.fromEntries(levels.map((l) => [l.id, t?.cx?.[l.id] ? String(t.cx[l.id]) : ""])));
  if (!t) return null;
  const close = () => setDialog(null);
  const counts = Object.fromEntries(levels.map((l) => [l.id, Math.max(0, Math.round(Number(cx[l.id]) || 0))]));
  const total = cxTotal(counts);
  const bf = levels.length > 0 ? cxField(data) : undefined;
  const fromCx = !!bf;
  const eff = fromCx ? { ...vals, [bf!.key]: total || "" } : vals;
  const miss = missingRequired(data.fields, eff).concat(levels.length && !total ? ["contracts by complexity"] : []);
  return (
    <Modal onClose={close} width={520}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <div className="dialog-title" style={{ fontSize: 26 }}>
          Resolve ticket
        </div>
        <span className="muted">
          {t.id} · {t.title}
        </span>
        {levels.length > 0 && (
          <div className="ot-split">
            <strong>Contracts by complexity *</strong>
            <span className="small">How many contracts of each complexity this ticket had, e.g. 1 Simple and 2 Complex. Each counts toward its own target.</span>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(levels.length, 4)}, 1fr)`, gap: 10 }}>
              {levels.map((l) => (
                <div className="field" key={l.id}>
                  <label htmlFor={"cx-" + l.id}>{l.name}</label>
                  <input
                    id={"cx-" + l.id}
                    className="input"
                    type="number"
                    min={0}
                    step={1}
                    value={cx[l.id] ?? ""}
                    placeholder="0"
                    onChange={(e) => setCx((x) => ({ ...x, [l.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <span className="small">
              {total} contract{total === 1 ? "" : "s"}
              {fromCx ? ` · ${bf!.label} is set to this total` : ""}
            </span>
          </div>
        )}
        {data.fields.map((f) => {
          if (fromCx && f.key === bf!.key) return null;
          const fid = "done-" + f.key;
          const val = String(vals[f.key] ?? "");
          const set = (v: string) => setVals((x) => ({ ...x, [f.key]: v }));
          return (
            <div className="field" key={f.key}>
              <label htmlFor={fid}>{f.label + (f.required ? " *" : "")}</label>
              {f.type === "select" ? (
                <select id={fid} className="input" value={val} onChange={(e) => set(e.target.value)}>
                  <option value="">Choose</option>
                  {fieldOptions(f).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={fid}
                  className="input"
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                />
              )}
            </div>
          );
        })}
        <span style={{ fontSize: 12.5, color: "var(--color-accent-800)" }}>
          {miss.length ? "Required to close this task — fill in: " + miss.join(", ") : ""}
        </span>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            disabled={miss.length > 0}
            onClick={() => {
              close();
              run({ type: "complete", id, vals: eff, pid: me.id, ...(levels.length ? { cx: counts } : {}) });
            }}
          >
            Resolve ticket
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}

/** Start work found nothing in the member's trades: offer the same system first, then the team. */
function AssistDialog({ offer }: { offer: AssistOffer }) {
  const { run, me, setDialog } = useWorkload();
  const close = () => setDialog(null);
  const sys = offer.systemNames.join(" / ");
  return (
    <Modal onClose={close} width={500}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <div className="dialog-title" style={{ fontSize: 26 }}>
          Your trades are clear
        </div>
        <span>Nothing is waiting in your trades right now. Will you help with other trades’ volume?</span>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
          {offer.system > 0 && (
            <li>
              {offer.system} waiting in other trades of {sys || "your system"} (you’d get these first)
            </li>
          )}
          {offer.team > 0 && <li>{offer.team} waiting elsewhere in the team</li>}
        </ul>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Not now
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            onClick={() => {
              close();
              run({ type: "startWork", pid: me.id, assist: true });
            }}
          >
            Yes, help out
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}

/**
 * End work: ends the day. Only when the member ends after their shift does it ask for
 * overtime (at most the time past the shift); an admin or lead then approves it.
 */
function EndWorkDialog() {
  const { data, run, me, setDialog } = useWorkload();
  const [nowAt] = useState(() => nowMs());
  // Holiday duty / rest day: all time worked today; otherwise the time past the shift.
  const past = otAvailMin(data, me, nowAt);
  const [h, setH] = useState(() => String(Math.floor(past / 60)));
  const [m, setM] = useState(() => String(past % 60));
  const close = () => setDialog(null);
  const otMin = past ? Math.max(0, (Number(h) || 0) * 60 + (Number(m) || 0)) : 0;
  const tooMuch = otMin > past;
  // Breakdown by process (and task type) when there's more than one to choose from: the
  // member's processes plus any other trade they worked tasks in after the shift.
  const procs = otProcesses(data, me, past, nowAt);
  const askSplit = otMin > 0 && asksOtSplit(data.settings, procs);
  type Line = { trade: string; ttype: string; h: string; m: string };
  const toLines = (ps: OtPart[]): Line[] => ps.map((x) => ({ trade: x.trade, ttype: x.ttype ?? "", h: String(Math.floor(x.min / 60)), m: String(x.min % 60) }));
  const [lines, setLines] = useState<Line[]>(() => toLines(suggestOtSplit(data, me, past, nowAt)));
  const lineMin = (l: Line) => Math.max(0, (Number(l.h) || 0) * 60 + (Number(l.m) || 0));
  // One line follows the total; with several, the member makes them add up.
  const shown = lines.length === 1 ? [{ ...lines[0], h: String(Math.floor(otMin / 60)), m: String(otMin % 60) }] : lines;
  const splitSum = shown.reduce((a, l) => a + lineMin(l), 0);
  const splitBad = askSplit && (splitSum !== otMin || shown.some((l) => !l.trade || !lineMin(l)));
  const setLine = (i: number, patch: Partial<Line>) => setLines(shown.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Modal onClose={close} width={500}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <div className="dialog-title" style={{ fontSize: 26 }}>
          End work for today
        </div>
        {past > 0 ? (
          <div className="banner" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <strong>
              {me.otDay
                ? `${OT_KIND[me.otDay]}: all ${fmtMin(past)} you worked today counts as overtime.`
                : `You’re ${fmtMin(past)} past your shift (${me.shift}).`}
            </strong>
            <span style={{ fontSize: 13.5 }}>
              {me.otDay
                ? `Today is ${me.otDay === "holiday" ? "a holiday you’re on duty" : "a rest day"}, so it goes to an admin or lead for approval as ${OT_KIND[me.otDay].toLowerCase()}. Adjust it if needed.`
                : "How much overtime did you work? It goes to an admin or lead for approval. Enter 0 if none."}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input aria-label="Overtime hours" className="input" type="number" min={0} value={h} onChange={(e) => setH(e.target.value)} style={{ width: 80 }} />
              <span>h</span>
              <input aria-label="Overtime minutes" className="input" type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} style={{ width: 80 }} />
              <span>min</span>
            </div>
            {tooMuch && <span style={{ fontSize: 12.5, color: "var(--color-accent-800)" }}>That’s more than the {fmtMin(past)} {me.otDay ? "you worked today" : "since your shift ended"}.</span>}
          </div>
        ) : null}
        {past > 0 && askSplit ? (
          <div className="ot-split">
            <strong>Which process was the overtime for?</strong>
            <span className="small">Filled in from the tasks you worked after your shift, including other trades you helped with. Split it if you worked on more than one.</span>
            {shown.map((l, i) => (
              <div key={i} className="ot-line">
                <select
                  aria-label="Process"
                  className="input"
                  value={l.trade}
                  onChange={(e) => setLine(i, { trade: e.target.value, ttype: typesFor(data.settings, e.target.value).some((t) => t.id === l.ttype) ? l.ttype : "" })}
                >
                  <option value="">Choose a process</option>
                  {procs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                {typesFor(data.settings, l.trade).length > 0 && (
                  <select aria-label="Task type" className="input" value={l.ttype} onChange={(e) => setLine(i, { ttype: e.target.value })}>
                    <option value="">Any task type</option>
                    {typesFor(data.settings, l.trade).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <input aria-label="Hours" className="input" type="number" min={0} value={l.h} disabled={shown.length === 1} onChange={(e) => setLine(i, { h: e.target.value })} />
                <span>h</span>
                <input aria-label="Minutes" className="input" type="number" min={0} max={59} value={l.m} disabled={shown.length === 1} onChange={(e) => setLine(i, { m: e.target.value })} />
                <span>min</span>
                {shown.length > 1 && (
                  <button className="btn btn-ghost" aria-label="Remove line" onClick={() => setLines(shown.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button
                className="btn btn-secondary btn-36"
                onClick={() => setLines(shown.concat({ trade: procs.find((o) => !shown.some((l) => l.trade === o.id))?.id ?? "", ttype: "", h: "0", m: "0" }))}
              >
                {procs.length > 1 ? "Split across another process" : "Split across task types"}
              </button>
              <span className="small" style={{ color: splitBad ? "var(--color-accent-800)" : undefined }}>
                {fmtMin(splitSum)} of {fmtMin(otMin)} assigned
              </span>
            </div>
          </div>
        ) : null}
        {past > 0 ? null : (
          <span>Your day will be marked as ended. You can undo this from My work if you pressed it by mistake.</span>
        )}
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            disabled={tooMuch || splitBad}
            onClick={() => {
              close();
              run({
                type: "endWork",
                otMin,
                pid: me.id,
                split: askSplit ? shown.map((l) => ({ trade: l.trade, ...(l.ttype ? { ttype: l.ttype } : {}), min: lineMin(l) })) : null,
              });
            }}
          >
            {otMin ? "End work and send overtime" : "End work"}
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const { dialog } = useWorkload();
  if (!dialog) return null;
  if (dialog.kind === "endWork") return <EndWorkDialog />;
  if (dialog.kind === "assist") return <AssistDialog offer={dialog.offer} />;
  if (dialog.kind === "task") return <TaskDialog key={dialog.id} id={dialog.id} />;
  if (dialog.kind === "hold") return <HoldDialog key={dialog.id} id={dialog.id} />;
  return <DoneDialog key={dialog.id} id={dialog.id} />;
}

export function Toasts() {
  const { toasts } = useWorkload();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <Blueprint key={t.id} className="toast">
          <Icon name="check" stroke="var(--color-accent-700)" />
          <span>{t.text}</span>
        </Blueprint>
      ))}
    </div>
  );
}
