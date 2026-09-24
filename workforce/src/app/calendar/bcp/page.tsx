"use client";

import { useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { BCP_CLS, BCP_KEYS, BCP_ST, RD_CLS, RD_L, READY_F } from "@/lib/calendar/constants";
import { fmtY } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";
import type { BcpStatus, CalPerson } from "@/lib/calendar/types";

export default function BcpPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const { O } = c;
  const [evSel, setEvSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<BcpStatus | "all">("all");
  const byName = (a: CalPerson, b: CalPerson) => a.name.localeCompare(b.name);
  const evs = s.data.bcpEvents.filter((e) => O.by[e.scope] && O.anc(e.scope).includes(v.dept.id));
  const ev = evs.find((e) => e.id === evSel) || evs[0];
  const inScope = (p: CalPerson) => !!ev && O.inN(p, ev.scope) && !(p.resign && p.resign < ev.start);
  const ci = ev ? s.data.checkins[ev.id] || {} : {};
  const stOf = (p: CalPerson): BcpStatus => ci[p.id]?.status || "none";
  const scoped = s.data.people.filter(inScope).sort(byName);
  const canSee = v.isLeader || v.anyAdmin;
  const canEditP = (p: CalPerson) => O.branchesOf(p).some((b) => (b.admins ?? []).includes(s.me));
  const myIn = !!ev && ev.status === "active" && inScope(v.meP);
  const myCi = ci[s.me];
  const rdOf = (p: CalPerson) => {
    const r = s.data.bcpReady[p.id];
    if (!r) return "none" as const;
    const n = READY_F.filter(([k]) => r[k]).length;
    return n === READY_F.length ? ("ready" as const) : n >= 3 ? ("partial" as const) : ("not" as const);
  };
  const deptPeople = s.data.people.filter((p) => O.inN(p, v.dept.id) && !(p.resign && p.resign < s.today)).sort(byName);
  const myR = s.data.bcpReady[s.me] || {};
  const bcpPeople = scoped.filter((p) => filter === "all" || stOf(p) === filter);
  const brk = O.desc(v.dept.id, "branch")
    .map((t) => {
      const g = scoped.filter((p) => O.inN(p, t.id));
      return { id: t.id, tower: O.up(t.id, "tower")?.name ?? "", name: t.name, total: g.length, vals: BCP_KEYS.map((k) => g.filter((p) => stOf(p) === k).length) };
    })
    .filter((r) => r.total > 0);
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>BCP monitoring · {v.deptShort}</h1>
          <span style={{ maxWidth: "80ch" }}>During an event, everyone in scope checks in with their status. Readiness records show who is set up to work from home before anything happens.</span>
        </div>
        <div className="row">
          {v.anyAdmin && ev?.status === "active" && (
            <button className="btn btn-secondary btn-36" onClick={() => s.run({ type: "closeEvent", id: ev.id })}>
              Close event
            </button>
          )}
          {v.anyAdmin && (
            <Blueprint as="button" className="btn btn-primary btn-36" onClick={() => s.setDialog({ kind: "event" })}>
              <Icon name="plus" size={16} />
              Start BCP event
            </Blueprint>
          )}
        </div>
      </div>
      {ev ? (
        <>
          <Blueprint as="section" className="panel" style={{ padding: "16px 18px", flexDirection: "row", flexWrap: "wrap", gap: "12px 20px", alignItems: "center" }}>
            <div className="field" style={{ minWidth: 260 }}>
              <label htmlFor="bcp-ev">Event</label>
              <select id="bcp-ev" className="input" value={ev.id} onChange={(e) => setEvSel(e.target.value)}>
                {evs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name + (e.status === "active" ? " (active)" : "")}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={"tag " + (ev.status === "active" ? "tag-accent" : "tag-neutral")}>{ev.status === "active" ? "Active" : "Closed"}</span>
                <span className="small" style={{ fontSize: 13 }}>
                  {(ev.status === "active"
                    ? "Active since " + fmtY(ev.start)
                    : "Closed · " + (!ev.end || ev.start === ev.end ? fmtY(ev.start) : `${fmtY(ev.start)} – ${fmtY(ev.end)}`)) + " · Scope: " + O.by[ev.scope].name}
                </span>
              </div>
              {ev.note && <span style={{ fontSize: 14 }}>{ev.note}</span>}
            </div>
            {myIn && (
              <div className="row">
                <span className="small" style={{ fontSize: 13 }}>Your status</span>
                <span className={"tag " + (myCi ? BCP_CLS[myCi.status] : "tag-outline")}>{myCi ? BCP_ST[myCi.status] : "Not checked in yet"}</span>
                <span className="small" style={{ fontSize: 12 }}>{myCi?.at}</span>
                <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "checkin", pid: s.me, evId: ev.id })}>
                  Update my status
                </button>
              </div>
            )}
          </Blueprint>
          {canSee && (
            <>
              <div className="grid-kpi dense">
                {[{ k: "FTE in scope", v: scoped.length }, ...BCP_KEYS.map((k) => ({ k: BCP_ST[k], v: scoped.filter((p) => stOf(p) === k).length }))].map((k) => (
                  <Blueprint key={k.k} className="card kpi">
                    <span className="card-kicker">{k.k}</span>
                    <span className="kpi-value" style={{ fontSize: 40 }}>{k.v}</span>
                  </Blueprint>
                ))}
              </div>
              <Blueprint as="section" className="panel tight scroll-x">
                <h2 className="h2">By tower and team (FTE)</h2>
                <table className="table" style={{ minWidth: 880 }}>
                  <thead>
                    <tr>
                      <th>Tower</th>
                      <th>Team</th>
                      <th>In scope</th>
                      {BCP_KEYS.map((k) => <th key={k}>{BCP_ST[k]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {brk.map((r) => (
                      <tr key={r.id}>
                        <td style={{ color: "var(--color-neutral-800)" }}>{r.tower}</td>
                        <td style={{ fontWeight: 500 }}>{r.name}</td>
                        <td>{r.total}</td>
                        {r.vals.map((x, i) => <td key={i}>{x}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Blueprint>
              <Blueprint as="section" className="panel scroll-x" style={{ gap: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
                  <h2 className="h2">People</h2>
                  <div className="field">
                    <label htmlFor="bcp-f">Show</label>
                    <select id="bcp-f" className="input" value={filter} onChange={(e) => setFilter(e.target.value as BcpStatus | "all")} style={{ width: "auto", minWidth: 220 }}>
                      <option value="all">Everyone</option>
                      {BCP_KEYS.map((k) => <option key={k} value={k}>{BCP_ST[k]}</option>)}
                    </select>
                  </div>
                </div>
                <table className="table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr><th>Name</th><th>Team</th><th>Status</th><th>Note</th><th>Checked in</th><th /></tr>
                  </thead>
                  <tbody>
                    {bcpPeople.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td style={{ color: "var(--color-neutral-800)" }}>{O.branchesOf(p).map((b) => b.name).join(", ")}</td>
                        <td><span className={"tag " + BCP_CLS[stOf(p)]}>{BCP_ST[stOf(p)]}</span></td>
                        <td style={{ fontSize: 13 }}>{ci[p.id]?.note ?? ""}</td>
                        <td className="nowrap muted" style={{ fontSize: 13 }}>{ci[p.id]?.at ?? "—"}</td>
                        <td>
                          {ev.status === "active" && canEditP(p) && (
                            <button className="btn btn-ghost" onClick={() => s.setDialog({ kind: "checkin", pid: p.id, evId: ev.id })}>
                              Update
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!bcpPeople.length && <span className="muted">No one with this status.</span>}
              </Blueprint>
            </>
          )}
        </>
      ) : (
        <div className="muted">No BCP events yet.</div>
      )}
      <div className="grid-2">
        <Blueprint as="section" className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h2 className="h2">My BCP readiness</h2>
            <span className={"tag " + RD_CLS[rdOf(v.meP)]}>{RD_L[rdOf(v.meP)]}</span>
          </div>
          {READY_F.map(([k, l]) => (
            <label key={k} style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", minHeight: 32 }}>
              <input type="checkbox" className="check" style={{ width: 20, height: 20 }} checked={!!myR[k]} onChange={() => s.run({ type: "toggleReady", pid: s.me, key: k })} />
              <span>{l}</span>
            </label>
          ))}
          <span className="small">{myR.updated ? "Last confirmed " + fmtY(myR.updated) : "Not confirmed yet"} · changes save as you tick</span>
        </Blueprint>
        {canSee && (
          <Blueprint as="section" className="panel">
            <h2 className="h2">Readiness · {v.deptShort}</h2>
            <div className="stat-grid four">
              {(["ready", "partial", "not", "none"] as const).map((k) => (
                <div key={k}>
                  <span>{RD_L[k]}</span>
                  <span>{deptPeople.filter((p) => rdOf(p) === k).length}</span>
                </div>
              ))}
            </div>
          </Blueprint>
        )}
      </div>
      {canSee && (
        <Blueprint className="scroll-x">
          <table className="table" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Readiness</th>
                {READY_F.map(([k, l]) => <th key={k}>{l.split(" (")[0]}</th>)}
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {deptPeople.map((p) => {
                const r = s.data.bcpReady[p.id];
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td style={{ color: "var(--color-neutral-800)" }}>{O.branchesOf(p).map((b) => b.name).join(", ")}</td>
                    <td><span className={"tag " + RD_CLS[rdOf(p)]}>{RD_L[rdOf(p)]}</span></td>
                    {READY_F.map(([k]) => <td key={k}>{r ? (r[k] ? "Yes" : "No") : "—"}</td>)}
                    <td className="nowrap muted">{r?.updated ? fmtY(r.updated) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Blueprint>
      )}
    </>
  );
}
