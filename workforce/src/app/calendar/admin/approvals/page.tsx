"use client";

import { useState } from "react";
import { Chip } from "@/components/calendar/bits";
import { Blueprint, Icon } from "@/components/ui";
import { APPR_TAG, APPR_WORD, CODES } from "@/lib/calendar/constants";
import { approverOf, canDecide, decidingTeam, leadersOf, waitsOn } from "@/lib/calendar/approvals";
import type { LeaveRequest } from "@/lib/calendar/types";
import { approversOf } from "@/lib/calendar/org";
import { fmt, rng2 } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

export default function ApprovalsPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  // Teams shown (one, or all teams in the tower / department you can see) and, per request,
  // the team that decides it (the first in the member's profile).
  const scope = v.scopeBranches.map((b) => b.id);
  const tb = (q: LeaveRequest) => {
    const d = decidingTeam(c, q);
    return d && scope.includes(d) ? d : (Object.keys(q.approvals).find((k) => scope.includes(k)) ?? v.bid);
  };
  const bName = (k: string) => c.O.by[k]?.name ?? "Removed team";
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const nameOf = (id: number) => c.people.get(id)?.name ?? "—";
  // Each request's approver: the member's assigned approver (a team leader), else the
  // team's admins. Every leader of the team still sees them all and can decide.
  const adminsOf = (b: string) => approversOf(c.O, b);
  const allAdmins = [...new Set(scope.flatMap(adminsOf))];
  const assigned = (pid: number) => approverOf(c, pid)?.id;
  // One approval per request: only the team first in the member's profile lists it.
  const waiting = s.data.requests.filter((q) => scope.some((b) => waitsOn(c, q, b))).sort((a, b) => a.start.localeCompare(b.start));
  const [q0, setQ] = useState("");
  const ql = q0.trim().toLowerCase();
  // Search: name, type, reason or request ID.
  const hit = (q: (typeof waiting)[number]) =>
    !ql || [nameOf(q.pid), q.type, CODES[q.type].label, q.reason, q.id].join(" ").toLowerCase().includes(ql);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const mineWaiting = waiting.some((q) => assigned(q.pid) === s.me);
  const [who, setWho] = useState(mineWaiting ? String(s.me) : "all");
  // Decided by this team, most recent first; approved automatically has no approver.
  const decidedAll = s.data.requests
    .filter((q) => scope.some((b) => q.approvals[b] === "approved" || q.approvals[b] === "declined"))
    .sort((a, b) => b.start.localeCompare(a.start));
  const deciders = [...new Set(decidedAll.map((q) => q.decided?.[tb(q)]?.by).filter((x): x is number => x !== undefined))];
  const whoOpts = [...new Set([...scope.flatMap((b) => leadersOf(c, b).map((p) => p.id)), ...allAdmins, ...deciders, ...waiting.map((q) => assigned(q.pid)).filter((x): x is number => x !== undefined)])]
    .filter((id) => id !== s.me)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const pick = Number(who);
  // Filter by the approver a request is assigned to (unassigned ones count for the team's admins).
  const isFor = (q: LeaveRequest, id: number) => (assigned(q.pid) ?? (adminsOf(tb(q)).includes(id) ? id : undefined)) === id;
  const pending = waiting.filter((q) => (who === "all" || isFor(q, pick)) && hit(q));
  const decided = decidedAll.filter((q) => (who === "all" || (who === "auto" ? !q.decided?.[tb(q)] : q.decided?.[tb(q)]?.by === pick)) && hit(q)).slice(0, 200);
  // Bulk decide: the selected requests still shown that I can decide.
  const canPick = pending.filter((q) => canDecide(c, s.me, q, tb(q)));
  const picked = canPick.filter((q) => sel.has(q.id));
  const allOn = canPick.length > 0 && picked.length === canPick.length;
  const toggle = (id: string) =>
    setSel((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const decideSel = (st: "approved" | "declined") => {
    if (!picked.length) return;
    // One call per deciding team.
    for (const b of [...new Set(picked.map(tb))]) s.run({ type: "decideMany", rids: picked.filter((q) => tb(q) === b).map((q) => q.id), bid: b, st, actor: s.me });
    setSel(new Set());
  };
  return (
    <>
      <div className="page-head">
        <h1>Approvals · {v.multi ? v.unitLabel : v.branch.name}</h1>
        <span>
          {!v.multi && v.branch.mode === "auto"
            ? "This team approves requests automatically, so nothing will wait here. You can change this in Settings."
            : `Requests from ${v.multi ? "these teams’" : v.branch.name} members wait here until their approver or another leader decides. Team leads and above don’t need approval. Members in several teams are approved once, by the first team in their profile.`}
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
        <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label htmlFor="ap-q">Search</label>
          <input id="ap-q" className="input" type="search" placeholder="Name, type, reason or ID" value={q0} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
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
      </div>
      {tab === "waiting" && canPick.length > 0 && (
        <div className="bulk-bar">
          <span>{picked.length ? `${picked.length} selected` : "Select requests to approve or decline several at once."}</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-36" disabled={!picked.length} onClick={() => decideSel("declined")}>
              <Icon name="x" size={16} />
              Decline selected
            </button>
            <Blueprint as="button" className="btn btn-primary btn-36" disabled={!picked.length} onClick={() => decideSel("approved")}>
              <Icon name="check" size={16} />
              Approve selected
            </Blueprint>
          </div>
        </div>
      )}
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
                const dd = q.decided?.[tb(q)];
                const st = q.approvals[tb(q)];
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
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  className="check"
                  aria-label="Select all"
                  checked={allOn}
                  disabled={!canPick.length}
                  onChange={() => setSel(allOn ? new Set() : new Set(canPick.map((q) => q.id)))}
                />
              </th>
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
              const bid = tb(q);
              const admins = adminsOf(bid);
              const others = Object.keys(q.approvals).filter((k) => k !== bid);
              return (
                <tr key={q.id}>
                  <td>
                    {canDecide(c, s.me, q, bid) && (
                      <input type="checkbox" className="check" aria-label={`Select ${p.name}`} checked={sel.has(q.id)} onChange={() => toggle(q.id)} />
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className="nowrap" style={{ fontWeight: 500 }}>{p.name}</span>
                      <span className="small" style={{ fontSize: 12 }}>
                        {[v.multi ? bName(bid) : "", p.assign.filter((a) => c.O.anc(a).includes(bid)).map((a) => c.O.sub(a)).filter(Boolean).join(", ")].filter(Boolean).join(" · ") || bName(bid)}
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
                      <span title={admins.map(nameOf).join(", ")}>
                        {admins.slice(0, 2).map(nameOf).join(", ")}
                        {admins.length > 2 ? ` +${admins.length - 2} more` : ""} <span className="muted">(team admins)</span>
                      </span>
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
        {!pending.length && <div style={{ padding: "28px 14px", color: "var(--color-neutral-700)" }}>Nothing waiting for approval in {v.multi ? v.unitLabel : v.branch.name}{who === "all" ? "" : " for this approver"}{ql ? " matching your search" : ""}.</div>}
      </Blueprint>
      )}
    </>
  );
}
