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
import { approveHits, capHits, hitText, type CapHit } from "@/lib/calendar/leaveCap";
import { Modal } from "@/components/Dialogs";

export default function ApprovalsPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  // Teams shown (one, or all teams in the tower / department you can see) and, per request,
  // the team that decides it (the member's main team).
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
  // One approval per request: only the member's main team lists it.
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
  // Leave limit per day: approving past it asks first.
  const [warn, setWarn] = useState<{ list: { q: LeaveRequest; hits: CapHit[] }[]; go: () => void } | null>(null);
  const approveWith = (qs: LeaveRequest[], go: () => void) => {
    const list = approveHits(c, qs);
    if (list.length) setWarn({ list, go });
    else go();
  };
  const decideSel = (st: "approved" | "declined") => {
    if (!picked.length) return;
    // One call per deciding team.
    const go = () => {
      for (const b of [...new Set(picked.map(tb))]) s.run({ type: "decideMany", rids: picked.filter((q) => tb(q) === b).map((q) => q.id), bid: b, st, actor: s.me });
      setSel(new Set());
    };
    if (st === "approved") approveWith(picked, go);
    else go();
  };
  return (
    <>
      <div className="page-head">
        <h1>Approvals · {v.multi ? v.unitLabel : v.branch.name}</h1>
        <span>
          {!v.multi && v.branch.mode === "auto"
            ? "This team approves requests automatically, so nothing will wait here. You can change this in Settings."
            : `Requests from ${v.multi ? "these teams’" : v.branch.name} members wait here until their approver or another leader decides. People in several teams are approved once, by their main team.`}
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
      {/* Shown once requests are ticked: approve or decline them together. */}
      {tab === "waiting" && picked.length > 0 && (
        <div className="bulk-bar">
          <span>{picked.length} selected</span>
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
                    <td className="nowrap">
                  {c.reqDays(q)}
                  {!!q.lwop && <span className="tag tag-amber" title="Filed with no balance left: these days are leave without pay" style={{ marginLeft: 6 }}>LWOP {q.lwop}</span>}
                </td>
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
              <th>Reason</th>
              <th>Approver</th>
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
                      {others.length > 0 && (
                        <span className="small" style={{ fontSize: 12 }}>
                          Also {others.map((k) => `${bName(k)}: ${APPR_WORD[q.approvals[k]].toLowerCase()}`).join(", ")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="nowrap" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Chip s={CODES[q.type]}>{q.type}</Chip>
                      {CODES[q.type].label + (q.half ? (q.half === "PM" ? " · PM" : " · AM") : "")}
                    </div>
                  </td>
                  <td className="nowrap">
                    {rng2(q.start, q.end)}
                    <div className="small">
                      {c.reqDays(q)} day{c.reqDays(q) === 1 ? "" : "s"}
                      {!!q.lwop && <span className="tag tag-amber" title="Filed with no balance left: these days are leave without pay" style={{ marginLeft: 6 }}>LWOP {q.lwop}</span>}
                    </div>
                    {(() => {
                      const h = capHits(c, q.pid, q.start, q.end, q.type);
                      return h.length ? (
                        <div>
                          <span className="tag tag-amber" title={[...new Set(h.map(hitText))].join("\n")}>
                            Leave limit reached · {new Set(h.map((x) => x.date)).size} day{new Set(h.map((x) => x.date)).size === 1 ? "" : "s"}
                          </span>
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td style={{ color: "var(--color-neutral-800)" }}>{q.reason || "—"}</td>
                  <td className="small" style={{ fontSize: 13 }}>
                    {assigned(q.pid) !== undefined ? (
                      <strong style={{ color: assigned(q.pid) === s.me ? "var(--color-accent-800)" : undefined }}>
                        {assigned(q.pid) === s.me ? "You" : nameOf(assigned(q.pid)!)}
                      </strong>
                    ) : admins.length ? (
                      <span className="nowrap" title={admins.map(nameOf).join(", ")}>
                        {admins.length === 1 ? nameOf(admins[0]) : `Team admins (${admins.length})`}
                      </span>
                    ) : (
                      "System admins"
                    )}
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
                      <Blueprint as="button" className="btn btn-primary btn-36" onClick={() => approveWith([q], () => s.run({ type: "decide", rid: q.id, bid, st: "approved", actor: s.me }))}>
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
        {warn && (
          <Modal onClose={() => setWarn(null)} width={560} pad>
            <div className="dialog-title" style={{ fontSize: 22 }}>
              Leave limit reached
            </div>
            <span>Approving {warn.list.length === 1 ? "this request" : "these requests"} puts more people on leave than the team allows on:</span>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {warn.list.map(({ q, hits }) => (
                <li key={q.id}>
                  <strong>{nameOf(q.pid)}</strong> ({rng2(q.start, q.end)}): {[...new Set(hits.map(hitText))].slice(0, 3).join(" · ")}
                  {hits.length > 3 ? ` · and ${hits.length - 3} more` : ""}
                </li>
              ))}
            </ul>
            <div className="dialog-actions" style={{ gap: 10 }}>
              <button className="btn btn-secondary btn-40" onClick={() => setWarn(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-40"
                onClick={() => {
                  warn.go();
                  setWarn(null);
                }}
              >
                Approve anyway
              </button>
            </div>
          </Modal>
        )}
        {!pending.length && <div style={{ padding: "28px 14px", color: "var(--color-neutral-700)" }}>Nothing waiting for approval in {v.multi ? v.unitLabel : v.branch.name}{who === "all" ? "" : " for this approver"}{ql ? " matching your search" : ""}.</div>}
      </Blueprint>
      )}
    </>
  );
}
