"use client";

import { Chip } from "@/components/calendar/bits";
import { Blueprint, Icon } from "@/components/ui";
import { BSTY, BUCKETS } from "@/lib/calendar/constants";
import { useCalendar } from "@/lib/calendar/store";

export default function ShiftsPage() {
  const s = useCalendar();
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Shifts</h1>
          <span style={{ maxWidth: "80ch" }}>
            Each person has a default shift. Upload the monthly roster from Calendar › Upload schedule (Shift tab) to change shifts per day. The group decides whether a shift counts as Morning, Midshift or GY in manning counts.
          </span>
        </div>
        <Blueprint as="button" className="btn btn-primary btn-36" onClick={() => s.setDialog({ kind: "shift", orig: null })}>
          <Icon name="plus" size={16} />
          Add shift
        </Blueprint>
      </div>
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 680 }}>
          <thead>
            <tr><th>Code</th><th>Name</th><th>Hours</th><th>Manning group</th><th>People (default)</th><th style={{ textAlign: "right" }}>Actions</th></tr>
          </thead>
          <tbody>
            {s.data.shifts.map((x) => (
              <tr key={x.id}>
                <td><Chip s={BSTY[x.bucket]}>{x.id}</Chip></td>
                <td style={{ fontWeight: 500 }}>{x.name}</td>
                <td>{x.start}–{x.end}</td>
                <td>{BUCKETS[x.bucket]}</td>
                <td>{s.data.people.filter((p) => p.shift === x.id && !(p.resign && p.resign < s.today)).length}</td>
                <td>
                  <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={() => s.setDialog({ kind: "shift", orig: x.id })}>Edit</button>
                    <button className="btn btn-ghost" style={{ color: "var(--color-neutral-700)" }} disabled={s.data.shifts.length < 2} onClick={() => s.run({ type: "deleteShift", id: x.id })}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Blueprint>
    </>
  );
}
