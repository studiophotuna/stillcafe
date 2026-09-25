"use client";

import { useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { ANNUAL, BSTY, CODES, CODE_KEYS, LEVELS, PEND, WORKING, type Chip as ChipStyle } from "@/lib/calendar/constants";
import { DOW, MONL, dayOf, daysInMonth, dowOf, fmt, fmtY, isWk, isoOf } from "@/lib/calendar/dates";
import type { Cell } from "@/lib/calendar/engine";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";
import type { CalPerson, Code } from "@/lib/calendar/types";
import { Chip, Seg } from "./bits";

const WK_BG = "color-mix(in srgb, var(--color-text) 5%, transparent)";
const HATCH = "repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--color-text) 9%, transparent) 5px 6px)";

export function MonthNav({ size = 30, minW = 190 }: { size?: number; minW?: number }) {
  const s = useCalendar();
  const prev = () => (s.m === 0 ? s.setMonth(s.y - 1, 11) : s.setMonth(s.y, s.m - 1));
  const next = () => (s.m === 11 ? s.setMonth(s.y + 1, 0) : s.setMonth(s.y, s.m + 1));
  return (
    <div className="month-nav">
      <button className="btn btn-secondary btn-icon" onClick={prev} title="Previous month" aria-label="Previous month">
        <Icon name="left" />
      </button>
      <h2 style={{ fontSize: size, minWidth: minW }}>
        {MONL[s.m]} {s.y}
      </h2>
      <button className="btn btn-secondary btn-icon" onClick={next} title="Next month" aria-label="Next month">
        <Icon name="right" />
      </button>
    </div>
  );
}

/** Month grid: people × days. `mgmt` = leadership across the department, combined status. */
export function CalendarGrid({ mgmt }: { mgmt?: boolean }) {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const { O } = c;
  const [scopeOverride, setScope] = useState<"all" | "me" | null>(null);
  const [cellMode, setCellMode] = useState<"status" | "shift">("status");
  const [q, setQ] = useState("");
  // Hidden by default; each viewer's choice is remembered in this browser.
  const [countsOpen, setCountsOpenState] = useState(() => {
    try {
      return localStorage.getItem("wfm.counts") === "open";
    } catch {
      return false;
    }
  });
  const setCountsOpen = (o: boolean) => {
    setCountsOpenState(o);
    try {
      localStorage.setItem("wfm.counts", o ? "open" : "closed");
    } catch {}
  };
  const scope = scopeOverride ?? v.branch.defaultScope ?? "all";
  const shiftMode = cellMode === "shift";
  const shById = Object.fromEntries(s.data.shifts.map((x) => [x.id, x]));
  const n = daysInMonth(s.y, s.m);
  const mStart = isoOf(s.y, s.m, 1);
  const dates = Array.from({ length: n }, (_, i) => isoOf(s.y, s.m, i + 1));
  const ql = q.trim().toLowerCase();
  const byName = (a: CalPerson, b: CalPerson) => a.name.localeCompare(b.name);
  const bid = v.bid;

  type Row = { header: string } | { p: CalPerson; cells: Cell[] };
  let active: CalPerson[];
  let shown: CalPerson[];
  const rows: Row[] = [];
  const rawMap = new Map<number, Cell[]>();
  if (mgmt) {
    // A tower shows its leaders plus those allocated to the whole department.
    const inScope = (p: CalPerson) => O.inN(p, v.dept.id) && (v.mTower === "all" || O.inN(p, v.mTower) || p.assign.includes(v.dept.id));
    active = s.data.people.filter((p) => inScope(p) && p.level !== "member" && c.alive(p, mStart));
    shown = active.filter((p) => !ql || p.name.toLowerCase().includes(ql));
    (["director", "manager", "lead"] as const).forEach((lv) => {
      const g = shown.filter((p) => p.level === lv).sort(byName);
      if (!g.length) return;
      rows.push({ header: `${LEVELS[lv]}s · ${g.length}` });
      g.forEach((p) => rows.push({ p, cells: dates.map((d) => c.raw(p, d, null)) }));
    });
  } else {
    active = s.data.people.filter((p) => O.inN(p, v.unitId) && c.alive(p, mStart)).sort(byName);
    active.forEach((p) => rawMap.set(p.id, dates.map((d) => c.raw(p, d, bid))));
    shown = scope === "me" ? active.filter((p) => p.id === s.me) : active;
    if (ql) shown = shown.filter((p) => p.name.toLowerCase().includes(ql));
    shown.forEach((p) => rows.push({ p, cells: rawMap.get(p.id)! }));
  }

  /** Today's shift as a short badge (e.g. "D"), with the full wording as a tooltip; null on rest days. */
  const todayOf = (p: CalPerson): { tag: string; title: string } | null => {
    const cell = c.raw(p, s.today, mgmt ? null : bid);
    if (cell.gone || !cell.code) return null;
    if (WORKING.includes(cell.code as Code)) {
      const id = c.shiftFor(p, s.today);
      const sh = shById[id];
      return { tag: id, title: `Today: ${sh ? `${sh.name} ${sh.start}–${sh.end}` : "working"} · ${CODES[cell.code as Code]?.label ?? cell.code}` };
    }
    return { tag: cell.code, title: `Today: ${CODES[cell.code as Code]?.label ?? cell.code}${cell.pending ? " (pending)" : ""}` };
  };

  const subOf = (p: CalPerson) => {
    if (p.resign) return `Last day ${fmtY(p.resign)}`;
    if (mgmt)
      // Teams, or the tower / department for leaders allocated above team level.
      return [...new Set(p.assign.map((a) => (O.up(a, "branch") ?? O.by[a])?.name).filter(Boolean))].join(", ");
    const inHere = p.assign.filter((a) => O.anc(a).includes(bid)).map((a) => O.sub(a)).filter(Boolean);
    const other = O.branchesOf(p).filter((b) => b.id !== bid).map((b) => b.name);
    return [inHere.join(", "), other.length ? "Also in " + other.join(", ") : ""].filter(Boolean).join(" · ");
  };

  const cellStyle = (cell: Cell): ChipStyle & { label: string } => {
    const sh = cell.shift ? shById[cell.shift] : null;
    const sm = shiftMode && sh && (cell.code === "RTO" || cell.code === "WFH");
    if (sm) return { ...BSTY[sh.bucket], label: sh.id };
    if (!cell.code) return { bg: "transparent", fg: "inherit", bd: "1px solid transparent", label: "" };
    return { ...(cell.pending ? PEND : CODES[cell.code]), label: cell.code };
  };

  // Daily counts
  const count = (fn: (c: Cell) => boolean) => dates.map((_, i) => active.filter((p) => fn(rawMap.get(p.id)![i])).length);
  const inBucket = (b: string) => (x: Cell) =>
    WORKING.includes(x.code as Code) && !x.pending && !!x.shift && shById[x.shift]?.bucket === b;
  const hasHdy = !mgmt && active.some((p) => rawMap.get(p.id)!.some((x) => x.code === "HDY"));
  const countRows: [string, number[], string][] = mgmt
    ? []
    : [
        ["In office", count((x) => x.code === "RTO"), "var(--color-neutral-800)"],
        ["Work from home", count((x) => x.code === "WFH"), "var(--color-neutral-800)"],
        ["On leave", count((x) => ANNUAL.includes(x.code as Code) && !x.pending), "var(--color-accent-700)"],
        ["Morning shift", count(inBucket("morning")), "var(--color-neutral-800)"],
        ["Midshift", count(inBucket("mid")), "var(--color-neutral-800)"],
        ["GY shift", count(inBucket("gy")), "var(--color-neutral-800)"],
        ...(hasHdy ? [["Holiday duty", count((x) => x.code === "HDY"), "var(--color-accent-700)"] as [string, number[], string]] : []),
      ];

  const legend: (ChipStyle & { code: string; label: string })[] = shiftMode
    ? s.data.shifts
        .map((x) => ({ code: x.id, label: `${x.name} ${x.start}–${x.end}`, ...BSTY[x.bucket] }))
        .concat((["VL", "SL", "EL", "HD", "HDY", "HOL"] as Code[]).map((k) => ({ code: k, ...CODES[k] })))
    : CODE_KEYS.map((k): ChipStyle & { code: string; label: string } => ({ code: k, ...CODES[k] })).concat([
        { code: "VL", label: "Pending approval", ...PEND },
        { code: "", label: "Resigned", bg: HATCH, fg: "inherit", bd: "1px solid var(--color-divider)" },
      ]);

  const onCell = (p: CalPerson, d: string, cell: Cell) => {
    if (cell.gone) return;
    if (!mgmt && v.isAdmin) s.setDialog({ kind: "cell", pid: p.id, date: d });
    else if (p.id === s.me) s.setDialog(cell.code === "HOL" || cell.code === "HDY" ? { kind: "holWork", date: d } : { kind: "request", date: d });
  };

  return (
    <>
      {mgmt && (
        <div className="page-head">
          <h1>Management calendar · {v.mTower === "all" ? v.deptShort : O.by[v.mTower].name}</h1>
          <span>
            Directors, managers and team leads {v.mTower === "all" ? `across every tower of ${v.deptShort}` : `in ${O.by[v.mTower].name}`}. Status reflects all of a
            person’s teams.
          </span>
        </div>
      )}
      {!mgmt && <HolidayToday />}
      <div className="page-head-row" style={{ alignItems: "center" }}>
        <div className="month-nav">
          <MonthNav />
          <button
            className="btn btn-secondary btn-36"
            onClick={() => {
              const [y, m] = s.today.split("-").map(Number);
              s.setMonth(y, m - 1);
            }}
          >
            Today
          </button>
        </div>
        <div className="row">
          {!mgmt && (
            <Seg name="scope" value={scope} options={[["all", `Everyone (${active.length})`], ["me", "Just me"]]} onChange={setScope} />
          )}
          <Seg name="cellmode" value={cellMode} options={[["status", "Status"], ["shift", "Shift"]]} onChange={setCellMode} />
          {!mgmt && v.isAdmin && (
            <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "upload", mode: "schedule" })}>
              <Icon name="upload" size={16} />
              Upload schedule
            </button>
          )}
          <div style={{ position: "relative", width: 220 }}>
            <span style={{ position: "absolute", left: 10, top: 10, color: "var(--color-neutral-600)", display: "grid" }}>
              <Icon name="search" size={16} />
            </span>
            <input className="input" type="search" aria-label="Find a name" placeholder="Find a name" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
        </div>
      </div>
      <div className="legend">
        {legend.map((l, i) => (
          <div key={i}>
            <Chip s={l}>{l.code}</Chip>
            {l.label}
          </div>
        ))}
      </div>
      <Blueprint style={{ minWidth: 0 }}>
        <div className="grid-wrap">
          <div className="grid-inner" role="grid" aria-label={`${mgmt ? "Management" : v.unitLabel} calendar, ${MONL[s.m]} ${s.y}`}>
            <div className="grid-head" role="row">
              <div className="grid-namecol" role="columnheader">
                Name · {shown.length}
              </div>
              {dates.map((d) => {
                const isToday = d === s.today;
                return (
                  <div key={d} className="grid-day" role="columnheader" title={c.hols[d] || fmt(d)} style={{ background: isWk(d) ? WK_BG : "transparent" }}>
                    <span style={{ color: isWk(d) ? "var(--color-neutral-600)" : "var(--color-neutral-700)" }}>{DOW[dowOf(d)]}</span>
                    <span
                      style={{
                        background: isToday ? "var(--color-accent)" : "transparent",
                        color: isToday ? "var(--color-bg)" : isWk(d) ? "var(--color-neutral-600)" : "var(--color-text)",
                      }}
                    >
                      {dayOf(d)}
                    </span>
                  </div>
                );
              })}
            </div>
            {rows.map((r, i) =>
              "header" in r ? (
                <div key={"h" + i} className="grid-group">
                  <div>{r.header}</div>
                </div>
              ) : (
                <div key={r.p.id} className="grid-row" role="row">
                  <div className="grid-name" role="rowheader">
                    <div>
                      <span>{r.p.name}</span>
                      {(() => {
                        const t = todayOf(r.p);
                        return t ? (
                          <span className="grid-today" title={t.title} aria-label={t.title}>
                            {t.tag}
                          </span>
                        ) : null;
                      })()}
                      {r.p.level !== "member" && <span className="tag tag-neutral">{LEVELS[r.p.level]}</span>}
                      {r.p.id === s.me && <span className="tag tag-accent">You</span>}
                    </div>
                    {subOf(r.p) && <span style={{ color: r.p.resign ? "var(--color-accent-700)" : "var(--color-neutral-700)" }}>{subOf(r.p)}</span>}
                  </div>
                  {r.cells.map((cell, j) => {
                    const d = dates[j];
                    const st = cellStyle(cell);
                    const sh = cell.shift ? shById[cell.shift] : null;
                    const lab = cell.gone
                      ? "No longer with the team"
                      : cell.code
                        ? CODES[cell.code].label + (cell.pending ? " – pending approval" : "") + (cell.note ? " – " + cell.note : "")
                        : "Weekend";
                    const title = `${r.p.name} · ${fmt(d)} · ${lab}` + (sh && WORKING.includes(cell.code as Code) ? ` · ${sh.name} ${sh.start}–${sh.end}` : "");
                    const canClick = ((!mgmt && v.isAdmin) || r.p.id === s.me) && !cell.gone;
                    return (
                      <div
                        key={d}
                        className="grid-cell"
                        role="gridcell"
                        style={{
                          background: cell.gone ? HATCH : cell.wk ? WK_BG : "transparent",
                          boxShadow: d === s.today ? "inset 1px 0 0 var(--color-accent), inset -1px 0 0 var(--color-accent)" : "none",
                        }}
                      >
                        <button
                          onClick={() => onCell(r.p, d, cell)}
                          title={title}
                          aria-label={title}
                          tabIndex={canClick ? 0 : -1}
                          style={{ background: st.bg, color: st.fg, border: st.bd, cursor: canClick ? "pointer" : "default" }}
                        >
                          {st.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ),
            )}
            {!rows.length && (
              <div style={{ padding: "32px 14px", color: "var(--color-neutral-700)" }}>{ql ? `No one matches “${q}”.` : mgmt ? "No directors, managers or team leads here yet." : "No one is allocated here yet."}</div>
            )}
            {!mgmt && (
              <div className="grid-counts">
                <div style={{ display: "flex" }}>
                  <button className="grid-counts-toggle" onClick={() => setCountsOpen(!countsOpen)} aria-expanded={countsOpen}>
                    <span style={{ display: "grid", transform: countsOpen ? "none" : "rotate(-90deg)" }}>
                      <Icon name="down" size={14} />
                    </span>
                    {countsOpen ? "Hide daily counts" : `Show daily counts (${countRows.length})`}
                  </button>
                </div>
                {countsOpen &&
                  countRows.map(([label, vals, fg]) => (
                    <div key={label} style={{ display: "flex" }}>
                      <div className="grid-count-label">{label}</div>
                      {vals.map((nn, j) => (
                        <div key={j} className="grid-count" style={{ color: fg, background: isWk(dates[j]) ? WK_BG : "transparent" }}>
                          {nn || ""}
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </Blueprint>
      <p style={{ margin: 0, fontSize: 13, color: "var(--color-neutral-700)" }}>
        {mgmt
          ? "Click a day in your own row to request leave. Admins change schedules from the Calendar."
          : v.isAdmin
            ? "Click any day to change someone’s schedule or record leave. Use “Request leave” for your own time off."
            : "Click a day in your own row to request leave or a schedule change for that date. On a holiday (HOL), click it to say you’re working."}
      </p>
    </>
  );
}

/** Today is a holiday for me: say so, and let me update my status if I'm working. */
function HolidayToday() {
  const s = useCalendar();
  const p = s.cal.people.get(s.me);
  const h = p && s.cal.holFor(p, s.today);
  if (!p || !h || isWk(s.today) || (p.resign && s.today > p.resign)) return null;
  const o0 = s.data.overrides[p.id + "|" + s.today];
  const o = o0 === "HOL" ? undefined : o0;
  return (
    <div className="banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <span>
        <strong>Today is {h.name}.</strong>{" "}
        {o ? `You’re on holiday duty (${o === "WFH" ? "from home" : "in office"}).` : "Working anyway? Update your status."}
      </span>
      <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "holWork", date: s.today })}>
        {o ? "Change" : "I’m working today"}
      </button>
    </div>
  );
}
