"use client";

import { Chip } from "@/components/calendar/bits";
import { Blueprint, Icon } from "@/components/ui";
import { APPR_WORD, CODES } from "@/lib/calendar/constants";
import { fmt, rng2 } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

export default function ApprovalsPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const bid = v.bid;
  const bName = (k: string) => c.O.by[k]?.name ?? "Removed team";
  const pending = s.data.requests.filter((q) => q.approvals[bid] === "pending").sort((a, b) => a.start.localeCompare(b.start));
  return (
    <>
      <div className="page-head">
        <h1>Approvals · {v.branch.name}</h1>
        <span>
          {v.branch.mode === "auto"
            ? "This team approves requests automatically, so nothing will wait here. You can change this in Settings."
            : `Requests from ${v.branch.name} members wait here until you decide. Each team a person belongs to approves separately.`}
        </span>
      </div>
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Reason</th>
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
                    {others.length ? others.map((k) => `${bName(k)}: ${APPR_WORD[q.approvals[k]].toLowerCase()}`).join(", ") : "None"}
                  </td>
                  <td className="nowrap muted">{fmt(q.created)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-secondary btn-36" onClick={() => s.run({ type: "decide", rid: q.id, bid, st: "declined", actor: s.me })}>
                        <Icon name="x" size={16} />
                        Decline
                      </button>
                      <Blueprint as="button" className="btn btn-primary btn-36" onClick={() => s.run({ type: "decide", rid: q.id, bid, st: "approved", actor: s.me })}>
                        <Icon name="check" size={16} />
                        Approve
                      </Blueprint>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pending.length && <div style={{ padding: "28px 14px", color: "var(--color-neutral-700)" }}>Nothing waiting for approval in {v.branch.name}.</div>}
      </Blueprint>
    </>
  );
}
