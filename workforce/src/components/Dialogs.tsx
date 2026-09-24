"use client";

import { useEffect, useState } from "react";
import { TRADES, fieldOptions, trPath } from "@/lib/workload/constants";
import { missingRequired } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";
import type { Priority, Task } from "@/lib/workload/types";
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
                <option value="">Needs trade</option>
                {TRADES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {trPath(o.id)}
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
        Put on hold
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
        The task stays yours. You can start another task while this one is on hold.
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
          Put on hold
        </Blueprint>
      </div>
    </Modal>
  );
}

function DoneDialog({ id }: { id: string }) {
  const { data, run, me, setDialog } = useWorkload();
  const t = data.tasks.find((x) => x.id === id);
  const [vals, setVals] = useState<Task["fields"]>(() => ({ ...(t?.fields ?? {}) }));
  const [ot, setOt] = useState(false);
  if (!t) return null;
  const close = () => setDialog(null);
  const miss = missingRequired(data.fields, vals);
  return (
    <Modal onClose={close} width={520}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <div className="dialog-title" style={{ fontSize: 26 }}>
          Mark done
        </div>
        <span className="muted">
          {t.id} · {t.title}
        </span>
        {data.fields.map((f) => {
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
        <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" className="check" checked={ot} onChange={() => setOt(!ot)} />
          Worked on overtime
        </label>
        <span style={{ fontSize: 12.5, color: "var(--color-accent-800)" }}>{miss.length ? "Fill in: " + miss.join(", ") : ""}</span>
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
              run({ type: "complete", id, vals, ot, pid: me.id });
            }}
          >
            Mark done
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const { dialog } = useWorkload();
  if (!dialog) return null;
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
