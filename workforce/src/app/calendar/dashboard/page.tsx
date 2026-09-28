"use client";

import { Chip } from "@/components/calendar/bits";
import { MonthNav } from "@/components/calendar/CalendarGrid";
import { BarList, ColumnChart, VIZ, VIZ_OTHER } from "@/components/Charts";
import { Blueprint } from "@/components/ui";
import { ANNUAL, BSTY, BUCKETS, CODES, OOO, PEND, TYPE_L } from "@/lib/calendar/constants";
import { addDays, dayOf, daysInMonth, fmt, fmtY, isWk, isoOf, rng2 } from "@/lib/calendar/dates";
import type { Cell } from "@/lib/calendar/engine";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";
import type { Code } from "@/lib/calendar/types";

export default function CalDashboardPage() {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const { O } = c;
  const { bid, unitId, unitLabel } = v;
  const mStart = isoOf(s.y, s.m, 1);
  const dates = Array.from({ length: daysInMonth(s.y, s.m) }, (_, i) => isoOf(s.y, s.m, i + 1));
  const act = s.data.people.filter((p) => v.inUnit(p) && c.alive(p, mStart));
  const wdays = dates.filter((d) => !isWk(d));
  const inMonth = s.today.slice(0, 7) === mStart.slice(0, 7);
  const ref = inMonth ? s.today : wdays.find((d) => !c.hols[d]) || wdays[0];
  const today = act.map((p) => ({ p, c: c.raw(p, ref, bid) }));
  const cnt = (f: (x: { c: Cell }) => boolean) => today.filter(f).length;
  const pendingN = s.data.requests.filter((q) => q.approvals[bid] === "pending" && act.some((p) => p.id === q.pid)).length;
  const kpis = [
    { k: "Headcount", v: act.length, m: unitLabel },
    { k: "In office", v: cnt((x) => x.c.code === "RTO"), m: fmt(ref) },
    { k: "Working from home", v: cnt((x) => x.c.code === "WFH"), m: fmt(ref) },
    { k: "Out", v: cnt((x) => OOO.includes(x.c.code as Code) && !x.c.pending), m: "Leave or business trip, " + fmt(ref) },
    { k: "Pending approvals", v: pendingN, m: O.by[bid].name },
  ];
  const grid = act.map((p) => ({ p, cells: wdays.map((d) => c.raw(p, d, bid)) }));
  let peak = 1;
  const bars = wdays.map((d, i) => {
    let r = 0, w = 0, l = 0, o = 0;
    for (const g of grid) {
      const x = g.cells[i];
      if (x.gone) continue;
      if (x.code === "RTO") r++;
      else if (x.code === "WFH") w++;
      else if (ANNUAL.includes(x.code as Code) && !x.pending) l++;
      else if (x.code) o++;
    }
    peak = Math.max(peak, r + w + l + o);
    return { d, r, w, l, o };
  });
  const rate = (cells: Cell[], code: Code) => {
    const tot = cells.filter((x) => !x.gone && x.code !== "HOL").length;
    return tot ? Math.round((cells.filter((x) => x.code === code && !x.pending).length / tot) * 100) : 0;
  };
  const u = O.by[unitId];
  const children = u.type === "branch" ? O.kids(unitId, "system").concat(O.kids(unitId, "trade")) : u.type === "system" ? O.kids(unitId, "trade") : [];
  const brk = children.map((n) => {
    const g = grid.filter((x) => O.inN(x.p, n.id));
    const all = g.flatMap((x) => x.cells);
    const leave = g.reduce((a, x) => a + x.cells.filter((y) => ANNUAL.includes(y.code as Code) && !y.pending).reduce((b, y) => b + (y.code === "HD" ? 0.5 : 1), 0), 0);
    return {
      id: n.id, name: n.name, type: TYPE_L[n.type], head: g.length, office: rate(all, "RTO") + "%", wfh: rate(all, "WFH") + "%", leave,
      out: today.filter((x) => O.inN(x.p, n.id) && OOO.includes(x.c.code as Code) && !x.c.pending).length,
    };
  });
  const horizon = addDays(ref, 13);
  const upcoming = s.data.requests
    .filter((q) => q.approvals[bid] && q.approvals[bid] !== "declined" && q.end >= ref && q.start <= horizon && act.some((p) => p.id === q.pid) && OOO.includes(q.type))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 12);
  const leaving = act.filter((p) => p.resign && p.resign >= mStart);
  const shToday = s.data.shifts
    .map((x) => ({ x, office: today.filter((t) => t.c.code === "RTO" && t.c.shift === x.id).length, wfh: today.filter((t) => t.c.code === "WFH" && t.c.shift === x.id).length }))
    .filter((r) => r.office + r.wfh > 0);
  const upHol = s.data.holidays
    .filter((x) => x.date >= ref && x.date <= addDays(ref, 90) && (x.scope === "all" || O.anc(unitId).includes(x.scope) || (O.by[x.scope] && O.anc(x.scope).includes(unitId))))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => {
      const duty = act.filter((p) => c.raw(p, x.date, bid).code === "HDY");
      return { id: x.id, name: x.name, date: `${fmt(x.date)} ${x.date.slice(0, 4)}`, n: duty.length, names: duty.map((p) => p.name).join(", ") || "No one on duty yet" };
    });
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Dashboard · {unitLabel}</h1>
          <span>Figures for “today” use {fmt(ref)}. Change the department, team, system or trade above to update everything below.</span>
        </div>
        <MonthNav size={24} minW={160} />
      </div>
      <div className="grid-kpi" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        {kpis.map((k) => (
          <Blueprint key={k.k} className="card kpi">
            <span className="card-kicker">{k.k}</span>
            <span className="big-kpi">{k.v}</span>
            <span className="card-meta" style={{ fontSize: 12.5 }}>{k.m}</span>
          </Blueprint>
        ))}
      </div>
      <Blueprint as="section" className="panel">
        <div className="chart-head">
          <h2 className="h2">Daily attendance · working days</h2>
          <span className="small">{unitLabel}</span>
        </div>
        <ColumnChart
          stacked
          label={`Daily attendance for ${unitLabel}`}
          labels={bars.map((b) => fmt(b.d))}
          ticks={bars.map((b) => String(dayOf(b.d)))}
          mark={bars.findIndex((b) => b.d === ref)}
          series={[
            { name: "In office", color: VIZ[0], values: bars.map((b) => b.r) },
            { name: "Work from home", color: VIZ[1], values: bars.map((b) => b.w) },
            { name: "On leave", color: VIZ[2], values: bars.map((b) => b.l) },
            { name: "Trip, rest day, holiday", color: VIZ_OTHER, values: bars.map((b) => b.o) },
          ]}
        />
        <details className="table-view">
          <summary>Show the numbers</summary>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr><th>Day</th><th>In office</th><th>Work from home</th><th>On leave</th><th>Trip, rest day, holiday</th></tr>
              </thead>
              <tbody>
                {bars.map((b) => (
                  <tr key={b.d}><td className="nowrap">{fmt(b.d)}</td><td>{b.r}</td><td>{b.w}</td><td>{b.l}</td><td>{b.o}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Blueprint>
      {brk.length > 0 && (
        <Blueprint as="section" className="panel">
          <div className="chart-head">
            <h2 className="h2">Office rate by {u.type === "branch" ? "system and trade" : "trade"}</h2>
            <span className="small">in-office share of working days this month</span>
          </div>
          <BarList rows={brk.map((r) => ({ key: r.id, label: r.name, value: Number.parseInt(r.office), note: `${r.head} people · WFH ${r.wfh}` }))} fmt={(n) => `${n}%`} max={100} />
        </Blueprint>
      )}
      <div className="grid-2">
        {brk.length > 0 && (
          <Blueprint as="section" className="panel tight scroll-x">
            <h2 className="h2">{u.type === "branch" ? "By system and trade" : "By trade"}</h2>
            <table className="table">
              <thead>
                <tr><th>Unit</th><th>People</th><th>Office rate</th><th>WFH rate</th><th>Leave days</th><th>Out today</th></tr>
              </thead>
              <tbody>
                {brk.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                        <span className="small" style={{ fontSize: 11.5 }}>{r.type}</span>
                      </div>
                    </td>
                    <td>{r.head}</td><td>{r.office}</td><td>{r.wfh}</td><td>{r.leave}</td><td>{r.out}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Blueprint>
        )}
        <Blueprint as="section" className="panel tight">
          <h2 className="h2">Out in the next two weeks</h2>
          {upcoming.map((q) => {
            const pend = q.approvals[bid] === "pending";
            return (
              <div key={q.id} className="list-row">
                <Chip s={pend ? PEND : CODES[q.type]}>{q.type}</Chip>
                <span style={{ fontWeight: 500, flex: 1, minWidth: 0 }}>{c.person(q.pid).name}</span>
                <span className="nowrap muted" style={{ fontSize: 13 }}>{rng2(q.start, q.end)}</span>
                <span className={"tag " + (pend ? "tag-outline" : "tag-accent")}>{pend ? "Pending" : "Approved"}</span>
              </div>
            );
          })}
          {!upcoming.length && <span className="muted">No leave booked in the next two weeks.</span>}
          {leaving.length > 0 && (
            <>
              <h3 style={{ margin: "10px 0 0", fontSize: 16 }}>Resignations</h3>
              {leaving.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5 }}>
                  <span>{p.name}</span>
                  <span className="muted">Last day {fmtY(p.resign!)}</span>
                </div>
              ))}
            </>
          )}
        </Blueprint>
      </div>
      <div className="grid-2">
        <Blueprint as="section" className="panel tight scroll-x">
          <h2 className="h2">Shift manning · {fmt(ref)}</h2>
          <table className="table">
            <thead>
              <tr><th>Shift</th><th>Hours</th><th>Group</th><th>In office</th><th>WFH</th></tr>
            </thead>
            <tbody>
              {shToday.map(({ x, office, wfh }) => (
                <tr key={x.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Chip s={BSTY[x.bucket]}>{x.id}</Chip>
                      {x.name}
                    </div>
                  </td>
                  <td className="nowrap">{x.start}–{x.end}</td>
                  <td>{BUCKETS[x.bucket]}</td>
                  <td>{office}</td>
                  <td>{wfh}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shToday.length && <span className="muted">No one is working on this day.</span>}
        </Blueprint>
        <Blueprint as="section" className="panel tight">
          <h2 className="h2">Holiday duty · next 90 days</h2>
          {upHol.map((h) => (
            <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontWeight: 500 }}>{h.name}</span>
                <span className="nowrap muted" style={{ fontSize: 13 }}>{h.date} · {h.n} on duty</span>
              </div>
              <span style={{ fontSize: 13, color: "var(--color-neutral-800)" }}>{h.names}</span>
            </div>
          ))}
          {!upHol.length && <span className="muted">No holidays in the next 90 days.</span>}
        </Blueprint>
      </div>
    </>
  );
}
