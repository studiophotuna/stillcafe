"use client";

import { useCallback, useEffect, useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { LEVELS } from "@/lib/calendar/constants";
import { fmtY } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

export default function MembersPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const { O } = c;
  const [q, setQ] = useState("");
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
  const members = s.data.people
    .filter((p) => O.inN(p, v.unitId) && (!mq || p.name.toLowerCase().includes(mq)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Members · {v.unitLabel}</h1>
          <span>Each person needs a department, tower and team. System and trade are optional. A person can have any number of allocations.</span>
        </div>
        <div className="row">
          <input className="input" type="search" aria-label="Find a member" placeholder="Find a member" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "upload", mode: "members" })}>
            <Icon name="upload" size={16} />
            Upload
          </button>
          <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "member", pid: null })}>
            <Icon name="plus" size={16} />
            Add member
          </button>
        </div>
      </div>
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: logins ? 1180 : 980 }}>
          <thead>
            <tr>
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
                <tr key={p.id} style={{ opacity: gone ? 0.6 : 1 }}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span className="small" style={{ fontSize: 12 }}>{p.email}</span>
                    </div>
                  </td>
                  <td className="nowrap">
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {LEVELS[p.level]}
                        {(v.branch.admins ?? []).includes(p.id) && (
                          <span className="tag tag-accent" style={{ padding: "0 6px", fontSize: 10.5 }}>
                            Admin
                          </span>
                        )}
                      </span>
                      <span className="small" style={{ fontSize: 12 }}>{sh ? `${sh.name} ${sh.start}–${sh.end}` : "—"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="tags">
                      {p.assign.map((a) => {
                        const b = O.up(a, "branch");
                        const sb = O.sub(a);
                        return (
                          <span key={a} className={"tag " + (O.anc(a).includes(v.bid) ? "tag-accent" : "tag-neutral")}>
                            {(b ? b.name : "") + (sb ? " › " + sb.replace(/ · /g, " › ") : "")}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="nowrap">
                    VL/SL {pool - c.usedOf(p)} of {pool} · EL {(p.elEnt ?? 5) - c.elUsedOf(p)} of {p.elEnt ?? 5}
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
                      <button className="btn btn-ghost" onClick={() => s.setDialog({ kind: "member", pid: p.id })}>
                        Edit
                      </button>
                      <button className="btn btn-ghost" onClick={() => s.setDialog({ kind: "resign", pid: p.id })}>
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
                      <button className="btn btn-ghost" style={{ color: "var(--color-neutral-700)" }} onClick={() => s.run({ type: "removeFromTeam", pid: p.id, bid: v.bid })}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!members.length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>No members here yet.</div>}
      </Blueprint>
    </>
  );
}
