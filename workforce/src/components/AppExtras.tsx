"use client";

import { useCallback, useEffect, useState } from "react";
import { Blueprint } from "./ui";

type Link = { label: string; url: string };
const LS_LINKS = "wfm.quickLinks";
const LS_FILED = "wfm.bipo.filed";
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

/**
 * Quick links: a small tab at the top centre of the page that opens a bar of links —
 * shared ones set by an admin plus each person's own (saved to their account).
 */
export function QuickLinks() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [demo, setDemo] = useState(false);
  const [mine, setMine] = useState<Link[]>([]);
  const [shared, setShared] = useState<Link[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/me/links", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        if (j.demo) {
          setDemo(true);
          setMine(read<Link[]>(LS_LINKS, []));
        } else {
          setMine(j.mine ?? []);
          setShared(j.shared ?? []);
        }
      })
      .catch(() => {});
  }, []);

  const save = async (next: Link[]) => {
    setErr("");
    if (demo) {
      write(LS_LINKS, next);
      setMine(next);
      return true;
    }
    const r = await fetch("/api/me/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ links: next }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error || "Couldn’t save your links.");
      return false;
    }
    setMine(next);
    return true;
  };
  const add = async () => {
    const u = url.trim().match(/^https?:\/\//)
      ? url.trim()
      : "https://" + url.trim();
    if (!label.trim() || !/^https:\/\/\S+\.\S+/.test(u))
      return setErr("Enter a name and a web address.");
    if (await save(mine.concat({ label: label.trim().slice(0, 40), url: u }))) {
      setLabel("");
      setUrl("");
    }
  };
  const chip = (l: Link, i: number, own: boolean) => (
    <span key={(own ? "m" : "s") + i} className="ql-chip">
      <a href={l.url} target="_blank" rel="noopener noreferrer">
        {l.label}
      </a>
      {own && editing && (
        <button
          aria-label={`Remove ${l.label}`}
          onClick={() => save(mine.filter((_, j) => j !== i))}
        >
          ×
        </button>
      )}
    </span>
  );

  return (
    <div className="ql">
      <div className="ql-inner">
        {open && (
          <Blueprint className="ql-panel">
            <div className="ql-row">
              {shared.map((l, i) => chip(l, i, false))}
              {mine.map((l, i) => chip(l, i, true))}
              {!shared.length && !mine.length && (
                <span className="small">
                  No links yet. Add the ones you use often.
                </span>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Done" : "Edit my links"}
              </button>
            </div>
            {editing && (
              <div className="ql-row">
                <input
                  className="input"
                  aria-label="Link name"
                  placeholder="Name, e.g. BIPO"
                  value={label}
                  maxLength={40}
                  onChange={(e) => setLabel(e.target.value)}
                  style={{ width: 180 }}
                />
                <input
                  className="input"
                  aria-label="Link address"
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  style={{ width: 320 }}
                />
                <button className="btn btn-secondary btn-36" onClick={add}>
                  Add
                </button>
                {err && (
                  <span
                    style={{ color: "var(--color-accent-800)", fontSize: 13 }}
                  >
                    {err}
                  </span>
                )}
              </div>
            )}
          </Blueprint>
        )}
        <button
          className="ql-tab"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Quick links {open ? "▴" : "▾"}
        </button>
      </div>
    </div>
  );
}

interface Notices {
  holiday?: { pid: number; date: string; name: string; answer: string | null } | null;
  leave: { id: string; label: string; start: string; end: string }[];
  ot: { id: string; otMin: number; day: string }[];
  links: { leave: string; ot: string };
}
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const fmtMin = (m: number) =>
  m >= 60
    ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}`
    : `${m} min`;

/** After leave or overtime is approved: a pop-up reminding the member to file it in BIPO. */
export function BipoNotice() {
  const [n, setN] = useState<Notices | null>(null);
  const [later, setLater] = useState(false);
  const load = useCallback(() => {
    fetch("/api/me/notices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && !j.demo && setN(j))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const i = setInterval(load, 120_000);
    return () => clearInterval(i);
  }, [load]);
  if (!n || later) return null;
  const filed = new Set(read<string[]>(LS_FILED, []));
  const leave = n.leave.filter((x) => !filed.has(x.id));
  const ot = n.ot.filter((x) => !filed.has(x.id));
  if (!leave.length && !ot.length) return null;
  const done = () => {
    write(
      LS_FILED,
      [...filed, ...leave.map((x) => x.id), ...ot.map((x) => x.id)].slice(-300),
    );
    setN({ ...n });
  };
  return (
    <div
      className="away-pop"
      role="dialog"
      aria-modal="true"
      aria-label="File in BIPO"
    >
      <Blueprint
        className="away-card"
        style={{
          alignItems: "stretch",
          textAlign: "left",
          width: "min(520px, calc(100% - 32px))",
        }}
      >
        <div className="dialog-title" style={{ fontSize: 24 }}>
          Approved — please file it in BIPO
        </div>
        {leave.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {leave.map((x) => (
              <span key={x.id}>
                <strong>{x.label}</strong> · {fmtDay(x.start)}
                {x.end !== x.start ? ` – ${fmtDay(x.end)}` : ""}
              </span>
            ))}
            {n.links.leave ? (
              <a
                className="btn btn-secondary btn-40"
                href={n.links.leave}
                target="_blank"
                rel="noopener noreferrer"
                style={{ alignSelf: "flex-start" }}
              >
                Open BIPO — leave
              </a>
            ) : (
              <span className="small">
                Ask your admin for the BIPO leave link.
              </span>
            )}
          </div>
        )}
        {ot.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ot.map((x) => (
              <span key={x.id}>
                <strong>Overtime {fmtMin(x.otMin)}</strong> · {fmtDay(x.day)}
              </span>
            ))}
            {n.links.ot ? (
              <a
                className="btn btn-secondary btn-40"
                href={n.links.ot}
                target="_blank"
                rel="noopener noreferrer"
                style={{ alignSelf: "flex-start" }}
              >
                Open BIPO — overtime
              </a>
            ) : (
              <span className="small">
                Ask your admin for the BIPO overtime link.
              </span>
            )}
          </div>
        )}
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setLater(true)}>
            Remind me later
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            onClick={done}
          >
            I’ve filed {leave.length + ot.length > 1 ? "them" : "it"}
          </Blueprint>
        </div>
      </Blueprint>
    </div>
  );
}

/**
 * Today is a holiday for me and I haven't said whether I'm working: ask once —
 * Holiday duty (RTO or WFH) or Holiday. The reply goes on my Calendar schedule.
 */
export function HolidayPrompt() {
  const [h, setH] = useState<Notices["holiday"]>(null);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    fetch("/api/me/notices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && !j.demo && setH(j.holiday ?? null))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("wfm:reload", load);
    return () => window.removeEventListener("wfm:reload", load);
  }, [load]);
  if (!h || h.answer || later) return null;
  const answer = async (code: "RTO" | "WFH" | "HOL") => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/cal/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "holidayWork", pid: h.pid, date: h.date, code, actor: h.pid }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "That couldn’t be saved.");
      setH({ ...h, answer: code });
      window.dispatchEvent(new Event("wfm:reload"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That couldn’t be saved.");
    }
    setBusy(false);
  };
  const opts: ["RTO" | "WFH" | "HOL", string, string][] = [
    ["RTO", "Holiday duty · RTO", "I’m working today, in the office"],
    ["WFH", "Holiday duty · WFH", "I’m working today, from home"],
    ["HOL", "Holiday", "I’m not working today"],
  ];
  return (
    <div className="away-pop" role="dialog" aria-modal="true" aria-label="Holiday today">
      <Blueprint className="away-card" style={{ alignItems: "stretch", textAlign: "left", width: "min(460px, calc(100% - 32px))" }}>
        <span className="small" style={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent-700)" }}>
          Holiday today
        </span>
        <div className="dialog-title" style={{ fontSize: 24 }}>
          {h.name}
        </div>
        <span className="small">Are you working today? Your answer goes on your schedule, and Workload gives you tasks only if you’re on holiday duty.</span>
        <div style={{ display: "grid", gap: 8 }}>
          {opts.map(([k, l, sub]) => (
            <button key={k} className="btn btn-secondary" disabled={busy} style={{ justifyContent: "flex-start", minHeight: 52, flexDirection: "column", alignItems: "flex-start", gap: 0 }} onClick={() => answer(k)}>
              <span>{l}</span>
              <span className="small" style={{ fontWeight: 400 }}>{sub}</span>
            </button>
          ))}
        </div>
        {err && <span style={{ color: "var(--color-accent-800)", fontSize: 13 }}>{err}</span>}
        <button className="btn btn-ghost" style={{ alignSelf: "center" }} onClick={() => setLater(true)}>
          Ask me later
        </button>
      </Blueprint>
    </div>
  );
}
