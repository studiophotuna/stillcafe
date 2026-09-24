"use client";

import { useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { HTYPE } from "@/lib/calendar/constants";
import { DOW, dowOf, fmtY, isWk } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";

export default function HolidaysPage() {
  const s = useCalendar();
  const [year, setYear] = useState(s.y);
  const { O } = s.cal;
  const scopeName = (id: string) => (id === "all" ? "Everyone" : O.by[id]?.name ?? "Removed");
  const rows = s.data.holidays.filter((h) => h.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Holidays</h1>
          <span>Holidays show as HOL on the calendar and don’t count as working days in leave requests. Apply one to everyone, a department or a single team.</span>
        </div>
        <div className="month-nav">
          <button className="btn btn-secondary btn-icon" onClick={() => setYear(year - 1)} aria-label="Previous year">
            <Icon name="left" />
          </button>
          <h2 style={{ fontSize: 24, minWidth: 64 }}>{year}</h2>
          <button className="btn btn-secondary btn-icon" onClick={() => setYear(year + 1)} aria-label="Next year">
            <Icon name="right" />
          </button>
          <Blueprint as="button" className="btn btn-primary btn-36" onClick={() => s.setDialog({ kind: "hol", id: null })}>
            <Icon name="plus" size={16} />
            Add holiday
          </Blueprint>
        </div>
      </div>
      <Blueprint className="scroll-x">
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr><th>Date</th><th>Name</th><th>Type</th><th>Applies to</th><th style={{ textAlign: "right" }}>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="nowrap">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 500 }}>{DOW[dowOf(h.date)]} {fmtY(h.date)}</span>
                    <span className="small" style={{ fontSize: 11.5 }}>{isWk(h.date) ? "Falls on a weekend" : ""}</span>
                  </div>
                </td>
                <td>{h.name}</td>
                <td style={{ color: "var(--color-neutral-800)" }}>{HTYPE[h.type]}</td>
                <td><span className="tag tag-neutral">{scopeName(h.scope)}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={() => s.setDialog({ kind: "hol", id: h.id })}>Edit</button>
                    <button className="btn btn-ghost" style={{ color: "var(--color-neutral-700)" }} onClick={() => s.run({ type: "deleteHoliday", id: h.id })}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>No holidays added for {year} yet.</div>}
      </Blueprint>
    </>
  );
}
