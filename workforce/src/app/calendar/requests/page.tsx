"use client";

import { Chip } from "@/components/calendar/bits";
import { Blueprint } from "@/components/ui";
import { APPR_TAG, APPR_WORD, CODES } from "@/lib/calendar/constants";
import { fmt, rng2 } from "@/lib/calendar/dates";
import { anyPending } from "@/lib/calendar/engine";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

export default function MyRequestsPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const meP = v.meP;
  const mine = c.reqsOf(s.me).slice().sort((a, b) => b.start.localeCompare(a.start));
  const used = c.usedOf(meP);
  const remaining = c.poolOf(meP) - used;
  const elLeft = (meP.elEnt ?? 5) - c.elUsedOf(meP);
  const pend = mine.filter(anyPending);
  const pendDays = pend.reduce((a, q) => a + c.reqDays(q), 0);
  const year = Number(s.today.slice(0, 4));
  const balances = [
    { k: "Vacation + sick leave left", v: remaining, m: `of ${c.poolOf(meP)} (${meP.entitle} for ${year} + ${meP.carry || 0} carried over from ${year - 1})` },
    { k: "Emergency leave left", v: elLeft, m: `of ${meP.elEnt ?? 5} for ${year} · separate from VL and SL` },
    { k: `Carries into ${year + 1}`, v: Math.max(0, Math.min(5, remaining)), m: "Unused VL/SL, up to 5 days" },
    { k: "Awaiting approval", v: pendDays, m: `${pend.length} request(s) pending` },
  ];
  const bName = (k: string) => c.O.by[k]?.name ?? "Removed team";
  return (
    <>
      <div className="page-head">
        <h1>My requests</h1>
        <span>Balances cover January to December {year}. Each team you belong to approves your requests separately.</span>
      </div>
      <div className="grid-kpi" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {balances.map((b) => (
          <Blueprint key={b.k} className="card kpi">
            <span className="card-kicker">{b.k}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span className="big-kpi">{b.v}</span>
              <span className="muted">days</span>
            </div>
            <span className="card-meta" style={{ fontSize: 12.5 }}>{b.m}</span>
          </Blueprint>
        ))}
      </div>
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Status by team</th>
              <th>Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mine.map((q) => (
              <tr key={q.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Chip s={CODES[q.type]}>{q.type}</Chip>
                    {CODES[q.type].label + (q.half ? (q.half === "PM" ? " · PM" : " · AM") : "")}
                  </div>
                </td>
                <td className="nowrap">{rng2(q.start, q.end)}</td>
                <td>{c.reqDays(q)}</td>
                <td style={{ color: "var(--color-neutral-800)" }}>{q.reason || "—"}</td>
                <td>
                  <div className="tags">
                    {Object.keys(q.approvals).map((k) => (
                      <span key={k} className={"tag " + APPR_TAG[q.approvals[k]]}>
                        {bName(k)} · {APPR_WORD[q.approvals[k]]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="nowrap muted">{fmt(q.created)}</td>
                <td>
                  {q.start >= s.today && (
                    <button className="btn btn-ghost" onClick={() => s.run({ type: "cancelRequest", rid: q.id, via: "self" })}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!mine.length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>You haven’t made any requests yet.</div>}
      </Blueprint>
    </>
  );
}
