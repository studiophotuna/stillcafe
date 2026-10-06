"use client";

import { useState } from "react";
import { Chip } from "@/components/calendar/bits";
import { Blueprint, Icon } from "@/components/ui";
import { APPR_TAG, APPR_WORD, CODES } from "@/lib/calendar/constants";
import { approverOf, canDecide, leadersOf } from "@/lib/calendar/approvals";
import { approversOf } from "@/lib/calendar/org";
import { fmt, rng2 } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

export default function ApprovalsPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const bid = v.bid;
  const bName = (k: string) => c.O.by[k]?.name ?? "Removed team";
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const nameOf = (id: number) => c.people.get(id)?.name ?? "—";
  // Each request's approver: the member's assigned approver (a team leader), else the
  // team's admins. Every leader of the team still sees them all and can decide.
  const admins = approversOf(c.O, bid);
  const assigned = (pid: number) => approverOf(c, pid)?.id;
  const waiting = s.data.requests.filter((q) => q.approvals[bid] === "pending").sort((a, b) => a.start.localeCompare(b.start));
  const mineWaiting = waiting.some((q) => assigned(q.pid) === s.me);
  const [who, setWho] = useState(mineWaiting ? String(s.me) : "all");
  // Decided by this team, most recent first; approved automatically has no approver.
  const decidedAll = s.data.requests
    .filter((q) => q.approvals[bid] === "approved" || q.approvals[bid] === "declined")
    .sort((a, b) => b.start.localeCompare(a.start));
  const deciders = [...new Set(decidedAll.map((q) => q.decided?.[bid]?.by).filter((x): x is number => x !== undefined))];
  const whoOpts = [...new Set([...leadersOf(c, bid).map((p) => p.id), ...admins, ...deciders, ...waiting.map((q) => assigned(q.pid)).filter((x): x is number => x !== undefined)])]
    .filter((id) => id !== s.me)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const pick = Number(who);
  // Filter by the approver a request is assigned to (unassigned ones count for the team's admins).
  const isFor = (pid: number, id: number) => (assigned(pid) ?? (admins.includes(id) ? id : undefined)) === id;
  const pending = waiting.filter((q) => who === "all" || isFor(q.pid, pick));
  const decided = decidedAll.filter((q) => who === "all" || (who === "auto" ? !q.decided?.[bid] : q.decided?.[bid]?.by === pick)).slice(0, 200);
  return (
    <>
      <div className="page-head">
        <h1>Approvals · {v.branch.name}</h1>
        <span>
          {v.branch.mode === "auto"
            ? "This team approves requests automatically, so nothing will wait here. You can change this in Settings."
            : `Requests from ${v.branch.name} members wait here until their approver or another leader decides. Team leads and above don’t need approval. Each team a person belongs to approves separately.`}
        </span>
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "waiting"} onClick={() => setTab("waiting")}>
            Waiting · {waiting.length}
          </button>
          <button role="tab" aria-selected={tab === "decided"} onClick={() => setTab("decided")}>
            Decided
          </button>
        </div>
        <div className="field">
          <label htmlFor="ap-who">Approver</label>
          <select id="ap-who" className="input" value={who} onChange={(e) => setWho(e.target.value)} style={{ width: "auto", minWidth: 200 }}>
            <option value="all">All approvers</option>
            <option value={String(s.me)}>Assigned to me</option>
            {whoOpts.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
            {tab === "decided" && <option value="auto">Approved automatically</option>}
          </select>
        </div>
      </div>
      {tab === "decided" ? (
        <Blueprint className="scroll-x">
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Decision</th>
                <th>Approver</th>
                <th>Decided</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((q) => {
                const p = c.person(q.pid);
                const dd = q.decided?.[bid];
                const st = q.approvals[bid];
                return (
                  <tr key={q.id}>
                    <td className="nowrap" style={{ fontWeight: 500 }}>{p?.name ?? "—"}</td>
                    <td>
                      <div className="nowrap" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Chip s={CODES[q.type]}>{q.type}</Chip>
                        {CODES[q.type].label}
                      </div>
                    </td>
                    <td className="nowrap">{rng2(q.start, q.end)}</td>
                    <td>{c.reqDays(q)}</td>
                    <td>
                      <span className={"tag " + APPR_TAG[st]}>{APPR_WORD[st]}</span>
                    </td>
                    <td className="nowrap">{dd ? nameOf(dd.by) : <span className="muted">Automatic</span>}</td>
                    <td className="nowrap muted">{dd?.at ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!decided.length && <div style={{ padding: "28px 14px", color: "var(--color-neutral-700)" }}>No decided requests{who === "all" ? "" : " for this approver"}.</div>}
        </Blueprint>
      ) : (
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Approver</th>
              <th>Other teams</th>
              <th>Submitted</th>
              <th style={{ textAlign: "right" }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((q) => {
              const p = c.person(q.pid);
              const others = Object.keys(q.approvals).filter((k) => k !== bid);
              return (
                <tr key={q.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className="nowrap" style={{ fontWeight: 500 }}>{p.name}</span>
                      <span className="small" style={{ fontSize: 12 }}>
                        {p.assign.filter((a) => c.O.anc(a).includes(bid)).map((a) => c.O.sub(a)).filter(Boolean).join(", ") || v.branch.name}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="nowrap" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Chip s={CODES[q.type]}>{q.type}</Chip>
                      {CODES[q.type].label + (q.half ? (q.half === "PM" ? " · PM" : " · AM") : "")}
                    </div>
                  </td>
                  <td className="nowrap">{rng2(q.start, q.end)}</td>
                  <td>{c.reqDays(q)}</td>
                  <td style={{ color: "var(--color-neutral-800)" }}>{q.reason || "—"}</td>
                  <td className="small" style={{ fontSize: 13 }}>
                    {assigned(q.pid) !== undefined ? (
                      <strong style={{ color: assigned(q.pid) === s.me ? "var(--color-accent-800)" : undefined }}>
                        {assigned(q.pid) === s.me ? "You" : nameOf(assigned(q.pid)!)}
                      </strong>
                    ) : admins.length ? (
                      <span>{admins.map(nameOf).join(", ")} <span className="muted">(team admins)</span></span>
                    ) : (
                      "System admins"
                    )}
                  </td>
                  <td className="small" style={{ fontSize: 13 }}>
                    {others.length ? others.map((k) => `${bName(k)}: ${APPR_WORD[q.approvals[k]].toLowerCase()}`).join(", ") : "None"}
                  </td>
                  <td className="nowrap muted">{fmt(q.created)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      {!canDecide(c, s.me, q, bid) ? (
                        <span className="small">{q.pid === s.me ? "Your request · someone else approves it" : "View only"}</span>
                      ) : (
                      <>
                      <button className="btn btn-secondary btn-36" onClick={() => s.run({ type: "decide", rid: q.id, bid, st: "declined", actor: s.me })}>
                        <Icon name="x" size={16} />
                        Decline
                      </button>
                      <Blueprint as="button" className="btn btn-primary btn-36" onClick={() => s.run({ type: "decide", rid: q.id, bid, st: "approved", actor: s.me })}>
                        <Icon name="check" size={16} />
                        Approve
                      </Blueprint>
                      </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pending.length && <div style={{ padding: "28px 14px", color: "var(--color-neutral-700)" }}>Nothing waiting for approval in {v.branch.name}{who === "all" ? "" : " for this approver"}.</div>}
      </Blueprint>
      )}
    </>
  );
}
