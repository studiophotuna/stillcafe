"use client";

import { CoverPanel } from "@/components/calendar/CoverPanel";
import { Chip } from "@/components/calendar/bits";
import { Blueprint } from "@/components/ui";
import { APPR_TAG, APPR_WORD, CARRY_MAX, CODES, LAW } from "@/lib/calendar/constants";
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
  const year = c.year;
  const hired = meP.hire?.slice(0, 4) === String(year);
  const carry = c.carryOf(meP);
  // The balances people check most; the rest are listed under "Other leave".
  const balances = [
    {
      k: "Vacation + sick leave left",
      v: remaining,
      m:
        `of ${c.poolOf(meP)} for ${year}` +
        (carry ? ` (incl. ${carry} carried over)` : "") +
        (hired && meP.entitleFirst === undefined ? " · pro-rated from your hire date" : ""),
    },
    { k: "Emergency leave left", v: elLeft, m: `of ${meP.elEnt ?? 5} for ${year}` },
    ...(pend.length ? [{ k: "Waiting for approval", v: pendDays, m: `${pend.length} request${pend.length === 1 ? "" : "s"}` }] : []),
  ];
  const other = [
    `${c.carryNext(meP)} unused VL/SL days carry into ${year + 1} (up to ${CARRY_MAX})`,
    ...(meP.soloParent ? [`Solo parent leave: ${LAW.spl - c.splUsedOf(meP)} of ${LAW.spl} working days left`] : []),
    ...(meP.sex !== "M" ? [`Maternity leave: ${meP.soloParent ? LAW.mlSolo : LAW.ml} calendar days per delivery (${LAW.mlMiscarriage} for a miscarriage)`] : []),
    ...(meP.sex !== "F" ? [`Paternity leave: ${LAW.pl} working days per delivery, first 4 deliveries`] : []),
  ];
  const bName = (k: string) => c.O.by[k]?.name ?? "Removed team";
  return (
    <>
      <div className="page-head">
        <h1>My requests</h1>
        <span>
          Your leave left this year and the requests you sent.
          {v.myBranches.length > 1 ? " Your main team approves your requests for all your teams." : ""}
        </span>
      </div>
      <CoverPanel />
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
      <details className="howto small">
        <summary>Other leave</summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {other.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </details>
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
              <th><span className="sr-only">Actions</span></th>
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
                <td className="nowrap">
                  {c.reqDays(q)}
                  {!!q.lwop && <span className="tag tag-amber" title="Filed with no balance left: these days are leave without pay" style={{ marginLeft: 6 }}>LWOP {q.lwop}</span>}
                </td>
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
