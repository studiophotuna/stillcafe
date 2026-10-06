"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Blueprint, Icon } from "@/components/ui";
import { LAW, LEVELS } from "@/lib/calendar/constants";
import { leadersOf } from "@/lib/calendar/approvals";
import { RoleFilter, RoleLegend, RoleTag } from "@/components/calendar/Roles";
import { fmtY } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";
import { isNodeAdmin, primaryTeamOf } from "@/lib/calendar/org";
import type { CalPerson, Level } from "@/lib/calendar/types";

export default function MembersPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const { O } = c;
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Level | "all">("all");
  // Sign-in status per person (database only).
  const [logins, setLogins] = useState<Record<number, { mustChange: boolean }> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const loadLogins = useCallback(async () => {
    if (s.mode !== "db") return;
    try {
      const r = await fetch("/api/auth/logins", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { logins: { personId: number; mustChange: boolean }[] };
      setLogins(Object.fromEntries(j.logins.map((l) => [l.personId, { mustChange: l.mustChange }])));
    } catch {}
  }, [s.mode]);
  // Reload when people change (a new member gets a sign-in).
  useEffect(() => {
    loadLogins();
  }, [loadLogins, s.data.people]);
  const resetPw = async (pid: number, remove = false) => {
    setBusy(pid);
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId: pid, remove }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) s.toast(j.error || "That didn’t work. Try again.");
      else if (remove) s.toast("Sign-in removed.");
      else s.showIssued(j.issued);
      await loadLogins();
    } finally {
      setBusy(null);
    }
  };
  const mq = q.trim().toLowerCase();
  const shById = Object.fromEntries(s.data.shifts.map((x) => [x.id, x]));
  // Directors and managers allocated to the tower or department above the teams are listed too.
  const above = v.isAbove;
  const members = s.data.people
    .filter((p) => v.inView(p) && (!mq || p.name.toLowerCase().includes(mq)) && (role === "all" || p.level === role))
    .sort((a, b) => Number(above(b)) - Number(above(a)) || a.name.localeCompare(b.name));
  // Team admins manage the people in their teams; system admins manage everyone.
  // Several teams shown: edit a person from their own team (the filter switches to it).
  const teamOf = (p: CalPerson) => O.branchesOf(p).find((b) => v.scopeBranches.some((x) => x.id === b.id))?.id ?? v.bid;
  const openFor = (p: CalPerson, kind: "member" | "resign") => {
    if (v.multi) s.setSel({ branch: teamOf(p), span: "team", system: "all", trade: "all" });
    s.setDialog({ kind, pid: p.id });
  };
  const oneTeam = v.multi ? "Choose a team above first" : undefined;
  const canManage = (p: CalPerson) =>
    !!v.meP.sysAdmin || O.branchesOf(p).some((b) => isNodeAdmin(O, b.id, s.me)) || p.assign.some((a) => isNodeAdmin(O, a, s.me));
  // Selecting several members to update at once (only those I manage).
  const [sel, setSel] = useState<number[]>([]);
  const [bulk, setBulk] = useState(false);
  const selectable = members.filter(canManage);
  const picked = sel.filter((id) => selectable.some((p) => p.id === id));
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Members · {v.unitLabel}</h1>
          <span>Each person needs a department, tower and team. System and trade are optional. A person can have any number of allocations.</span>
        </div>
        <div className="row">
          <input className="input" type="search" aria-label="Find a member" placeholder="Find a member" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <RoleFilter value={role} onChange={setRole} />
          <button className="btn btn-secondary btn-36" disabled={v.multi} title={oneTeam} onClick={() => s.setDialog({ kind: "upload", mode: "members" })}>
            <Icon name="upload" size={16} />
            Upload
          </button>
          <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "member", pid: null })}>
            <Icon name="plus" size={16} />
            Add member
          </button>
        </div>
      </div>
      <RoleLegend />
      {picked.length > 0 && (
        <Blueprint as="section" className="panel" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
          <strong>{picked.length} selected</strong>
          <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 14px" }} onClick={() => setBulk(true)}>
            Update selected
          </Blueprint>
          <button className="btn btn-secondary btn-36" disabled={v.multi} title={oneTeam} onClick={() => s.setDialog({ kind: "schedule", pids: picked })}>
            Update their schedules
          </button>
          <button className="btn btn-ghost" onClick={() => setSel([])}>
            Clear
          </button>
        </Blueprint>
      )}
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: logins ? 1180 : 980 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  className="check"
                  aria-label="Select all members shown"
                  checked={selectable.length > 0 && selectable.every((p) => sel.includes(p.id))}
                  onChange={(e) => setSel(e.target.checked ? selectable.map((p) => p.id) : [])}
                />
              </th>
              <th>Name</th>
              <th>Role · default shift</th>
              <th>Allocations</th>
              <th>Annual leave</th>
              <th>Status</th>
              {logins && <th>Sign-in</th>}
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((p) => {
              const gone = !!p.resign && p.resign < s.today;
              const sh = shById[p.shift];
              const pool = c.poolOf(p);
              return (
                <tr key={p.id} className={"role-row lv-" + p.level} style={{ opacity: gone ? 0.6 : 1 }}>
                  <td>
                    {canManage(p) && (
                      <input
                        type="checkbox"
                        className="check"
                        aria-label={`Select ${p.name}`}
                        checked={sel.includes(p.id)}
                        onChange={() => setSel(sel.includes(p.id) ? sel.filter((x) => x !== p.id) : sel.concat(p.id))}
                      />
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span className="small" style={{ fontSize: 12 }}>{p.email}</span>
                    </div>
                  </td>
                  <td className="nowrap">
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <RoleTag level={p.level} />
                        {v.scopeBranches.some((b) => (b.admins ?? []).includes(p.id)) && (
                          <span className="tag tag-accent" style={{ padding: "0 6px", fontSize: 10.5 }}>
                            Admin
                          </span>
                        )}
                      </span>
                      <span className="small" style={{ fontSize: 12 }}>{sh ? `${sh.name} ${sh.start}–${sh.end}` : "—"}</span>
                      {p.approver && c.people.get(p.approver) && (
                        <span className="small" style={{ fontSize: 12 }}>Approver: {c.people.get(p.approver)!.name}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="tags">
                      {p.assign.map((a) => {
                        const b = O.up(a, "branch");
                        const sb = O.sub(a);
                        const n = O.by[a];
                        const primary = !!b && O.branchesOf(p).length > 1 && primaryTeamOf(O, p) === b.id;
                        return (
                          <span key={a} className={"tag " + (O.anc(a).includes(v.scopeId) ? "tag-accent" : "tag-neutral")}>
                            {b ? b.name + (sb ? " › " + sb.replace(/ · /g, " › ") : "") : n ? `${n.name} · whole ${n.type === "dept" ? "department" : "tower"}` : "—"}
                            {primary && <strong title="Counted in this team on the headcount report"> · primary</strong>}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="nowrap">
                    VL/SL {pool - c.usedOf(p)} of {pool} · EL {(p.elEnt ?? 5) - c.elUsedOf(p)} of {p.elEnt ?? 5}
                    {p.soloParent ? ` · SPL ${LAW.spl - c.splUsedOf(p)} of ${LAW.spl}` : ""}
                  </td>
                  <td>
                    <span className={"tag " + (gone ? "tag-neutral" : p.resign ? "tag-outline" : "tag-accent")}>
                      {gone ? "Resigned " + fmtY(p.resign!) : p.resign ? "Leaving " + fmtY(p.resign) : "Active"}
                    </span>
                  </td>
                  {logins && (
                    <td className="nowrap">
                      {!logins[p.id] ? (
                        <span className="tag tag-neutral">None</span>
                      ) : logins[p.id].mustChange ? (
                        <span className="tag tag-outline" title="Hasn’t signed in and set their own password yet">
                          Temporary password
                        </span>
                      ) : (
                        <span className="tag tag-accent">Active</span>
                      )}
                    </td>
                  )}
                  <td>
                    <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                      {!canManage(p) ? (
                        <span className="small" style={{ fontSize: 12, alignSelf: "center" }} title="Allocated above this team; a system admin manages them">
                          Managed by a system admin
                        </span>
                      ) : (
                        <>
                          <button className="btn btn-ghost" onClick={() => openFor(p, "member")}>
                            Edit
                          </button>
                          <button className="btn btn-ghost" onClick={() => openFor(p, "resign")}>
                            {p.resign ? "Edit resignation" : "Resignation"}
                          </button>
                          {logins && !gone && p.id !== s.me && (
                            <button className="btn btn-ghost" disabled={busy === p.id} onClick={() => resetPw(p.id)}>
                              {logins[p.id] ? "Reset password" : "Create sign-in"}
                            </button>
                          )}
                          {logins && gone && logins[p.id] && (
                            <button className="btn btn-ghost" disabled={busy === p.id} onClick={() => resetPw(p.id, true)}>
                              Remove sign-in
                            </button>
                          )}
                          {!above(p) && !v.multi && (
                            <button className="btn btn-ghost" style={{ color: "var(--color-neutral-700)" }} onClick={() => s.run({ type: "removeFromTeam", pid: p.id, bid: v.bid })}>
                              Remove
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {bulk && <BulkDialog pids={picked} onClose={() => setBulk(false)} onDone={() => setSel([])} />}
        {!members.length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>{role === "all" && !mq ? "No members here yet." : "No members match."}</div>}
      </Blueprint>
    </>
  );
}

const WEEK: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"]];

/** Update role, approver, default shift or WFH days for several members; "Keep" leaves a field as it is. */
function BulkDialog({ pids, onClose, onDone }: { pids: number[]; onClose: () => void; onDone: () => void }) {
  const s = useCalendar();
  const v = useCalView();
  const [level, setLevel] = useState<Level | "">("");
  const [approver, setApprover] = useState("keep");
  const [shift, setShift] = useState("");
  const [wfhOn, setWfhOn] = useState(false);
  const [wfh, setWfh] = useState<number[]>([1, 2]);
  const leaders = [...new Map(v.scopeBranches.flatMap((b) => leadersOf(s.cal, b.id)).map((p) => [p.id, p])).values()];
  const names = pids.map((id) => s.cal.people.get(id)?.name ?? "").filter(Boolean);
  const nothing = !level && approver === "keep" && !shift && !wfhOn;
  return (
    <Modal onClose={onClose} width={560}>
      <div className="dialog-scroll" style={{ padding: 20, gap: 12 }}>
        <div className="dialog-title" style={{ fontSize: 24 }}>
          Update {pids.length} member{pids.length === 1 ? "" : "s"}
        </div>
        <span className="small">
          {names.slice(0, 6).join(", ")}
          {names.length > 6 ? ` and ${names.length - 6} more` : ""}. Only the fields you change are updated.
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="bk-l">Role</label>
            <select id="bk-l" className="input" value={level} onChange={(e) => setLevel(e.target.value as Level | "")}>
              <option value="">Keep</option>
              {(Object.keys(LEVELS) as Level[]).map((k) => (
                <option key={k} value={k}>
                  {LEVELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bk-a">Approver (team leader)</label>
            <select id="bk-a" className="input" value={approver} onChange={(e) => setApprover(e.target.value)}>
              <option value="keep">Keep</option>
              <option value="0">Not assigned (team admins)</option>
              {leaders.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {LEVELS[x.level]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bk-s">Default shift</label>
            <select id="bk-s" className="input" value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="">Keep</option>
              {s.data.shifts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.start}–{x.end})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" className="check" checked={wfhOn} onChange={() => setWfhOn(!wfhOn)} />
              Change work from home days
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", minHeight: 36, alignItems: "center", opacity: wfhOn ? 1 : 0.5 }}>
              {WEEK.map(([d, l]) => (
                <label key={d} style={{ display: "flex", gap: 4, alignItems: "center", cursor: wfhOn ? "pointer" : "default" }}>
                  <input type="checkbox" className="check" disabled={!wfhOn} checked={wfh.includes(d)} onChange={() => setWfh(wfh.includes(d) ? wfh.filter((x) => x !== d) : wfh.concat(d).sort())} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <span className="small">A member can’t be their own approver; for them the approver stays as it was. Leave, allocations and resignations are changed one by one in Edit.</span>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            disabled={nothing}
            onClick={() => {
              s.run({
                type: "bulkMembers",
                pids,
                ...(level ? { level } : {}),
                ...(approver !== "keep" ? { approver: Number(approver) } : {}),
                ...(shift ? { shift } : {}),
                ...(wfhOn ? { wfhDays: wfh } : {}),
              });
              onDone();
              onClose();
            }}
          >
            Update {pids.length}
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}
