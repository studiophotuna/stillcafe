"use client";

import { useEffect, useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { TYPE_L } from "@/lib/calendar/constants";
import { useCalendar } from "@/lib/calendar/store";
import { isNodeAdmin } from "@/lib/calendar/org";
import { useCalView } from "@/lib/calendar/useCalView";
import { Seg } from "@/components/calendar/bits";
import type { NodeType, OrgNode } from "@/lib/calendar/types";

const LS_SHUT = "wfm.orgMinimized";
type Level = NodeType | "all" | "custom";
const hiddenWord = (ks: OrgNode[]) => (new Set(ks.map((k) => k.type)).size === 1 ? TYPE_L[ks[0].type].toLowerCase() : "item");

export default function OrganizationPage() {
  const s = useCalendar();
  const v = useCalView();
  const { O } = s.cal;
  const countIn = (id: string) => s.data.people.filter((p) => O.inN(p, id) && !(p.resign && p.resign < s.today)).length;
  // Minimized rows (their children hidden), remembered in this browser.
  const [shut, setShut] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setShut(new Set(JSON.parse(localStorage.getItem(LS_SHUT) || "[]")));
    } catch {}
  }, []);
  const save = (x: Set<string>) => {
    setShut(x);
    try {
      localStorage.setItem(LS_SHUT, JSON.stringify([...x]));
    } catch {}
  };
  const kidsOf = (n: OrgNode) =>
    n.type === "dept" ? O.kids(n.id, "tower") : n.type === "tower" ? O.kids(n.id, "branch") : n.type === "branch" ? O.kids(n.id, "system").concat(O.kids(n.id, "trade")) : n.type === "system" ? O.kids(n.id, "trade") : [];
  const toggle = (id: string) => {
    const x = new Set(shut);
    if (x.has(id)) x.delete(id);
    else x.add(id);
    save(x);
  };
  // "Show down to": minimize every row of that level (levels above stay open).
  const showTo = (t: Level) => save(new Set(t === "all" ? [] : s.data.nodes.filter((n) => n.type === t).map((n) => n.id)));
  const ORDER: NodeType[] = ["dept", "tower", "branch", "system"];
  const level: Level =
    ORDER.find((t) => {
      const ns = s.data.nodes.filter((n) => n.type === t && kidsOf(n).length);
      const above = s.data.nodes.filter((n) => ORDER.indexOf(n.type) < ORDER.indexOf(t) && kidsOf(n).length);
      return ns.length > 0 && ns.every((n) => shut.has(n.id)) && above.every((n) => !shut.has(n.id));
    }) ?? (shut.size ? "custom" : "all");
  const rows: { n: OrgNode; depth: number }[] = [];
  const push = (n: OrgNode, depth: number) => {
    rows.push({ n, depth });
    if (shut.has(n.id)) return;
    if (n.type === "dept") O.kids(n.id, "tower").forEach((b) => push(b, depth + 1));
    if (n.type === "tower") O.kids(n.id, "branch").forEach((b) => push(b, depth + 1));
    if (n.type === "branch") {
      O.kids(n.id, "system").forEach((x) => push(x, depth + 1));
      O.kids(n.id, "trade").forEach((x) => push(x, depth + 1));
    }
    if (n.type === "system") O.kids(n.id, "trade").forEach((x) => push(x, depth + 1));
  };
  s.data.nodes.filter((n) => n.type === "dept").forEach((d) => push(d, 0));
  const addsFor = (t: NodeType): [string, NodeType][] =>
    t === "dept" ? [["Tower", "tower"]] : t === "tower" ? [["Team", "branch"]] : t === "branch" ? [["System", "system"], ["Trade", "trade"]] : t === "system" ? [["Trade", "trade"]] : [];
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1>Organization</h1>
          <span>
            Department › Tower › Team › System › Trade. Admins of a department or tower (e.g. its director or manager) are admins of every team under
            it — set them with Admins.
          </span>
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "orgImport" })}>
            <Icon name="upload" size={16} />
            Import from Excel
          </button>
          <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "node", mode: "add", ntype: "dept", parent: null })}>
            <Icon name="plus" size={16} />
            Add department
          </button>
        </div>
      </div>
      <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span className="small">Show down to</span>
        <Seg<Level>
          name="org-level"
          value={level}
          options={[["dept", "Departments"], ["tower", "Towers"], ["branch", "Teams"], ["system", "Systems"], ["all", "All"]]}
          onChange={showTo}
        />
      </div>
      <Blueprint>
        {rows.map(({ n, depth }) => {
          const kids = kidsOf(n).length;
          const hasMe = (n.type === "dept" || n.type === "tower" || n.type === "branch") && v.myBranches.every((b) => O.anc(b.id).includes(n.id));
          let meta = countIn(n.id) + " people";
          if (n.type === "dept") meta = `${O.kids(n.id, "tower").length} towers · ${meta}`;
          if (n.type === "tower") meta = `${O.kids(n.id, "branch").length} teams · ${meta}`;
          if (n.type === "dept" || n.type === "tower")
            meta += ` · admin: ${(n.admins ?? []).map((i) => s.cal.people.get(i)?.name).filter(Boolean).join(", ") || "none"}`;
          if (n.type === "branch")
            meta += ` · ${n.mode === "auto" ? "automatic approval" : "admin approval"} · admin: ${(n.admins ?? []).map((i) => s.cal.people.get(i)?.name).join(", ") || "none"}`;
          return (
            <div key={n.id} className="org-row" style={{ paddingLeft: 14 + depth * 32 }}>
              {kids ? (
                <button
                  className="org-tog"
                  aria-expanded={!shut.has(n.id)}
                  aria-label={(shut.has(n.id) ? "Expand " : "Minimize ") + n.name}
                  title={shut.has(n.id) ? `Show ${kids} under ${n.name}` : "Minimize"}
                  onClick={() => toggle(n.id)}
                >
                  ›
                </button>
              ) : (
                <span className="org-tog" aria-hidden="true" />
              )}
              <span className={"tag " + (n.type === "dept" || n.type === "tower" ? "tag-accent" : n.type === "branch" ? "tag-outline" : "tag-neutral")} style={{ minWidth: 64, justifyContent: "center" }}>
                {TYPE_L[n.type]}
              </span>
              <span style={{ fontWeight: depth < 2 ? 600 : 500, fontSize: depth === 0 ? 16 : 14 }}>{n.name}</span>
              <span className="small" style={{ marginRight: "auto" }}>
                {meta}
                {shut.has(n.id) && ` · ${kids} ${hiddenWord(kidsOf(n))}${kids === 1 ? "" : "s"} hidden`}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {addsFor(n.type).map(([l, t]) => (
                  <button key={t} className="btn btn-ghost" onClick={() => s.setDialog({ kind: "node", mode: "add", ntype: t, parent: n.id })}>
                    <Icon name="plus" size={14} />
                    {l}
                  </button>
                ))}
                {(n.type === "dept" || n.type === "tower") && (v.meP.sysAdmin || isNodeAdmin(O, n.id, s.me)) && (
                  <button className="btn btn-ghost" onClick={() => s.setDialog({ kind: "nodeAdmins", id: n.id })}>
                    Admins
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => s.setDialog({ kind: "node", mode: "rename", id: n.id, ntype: n.type })}>
                  Rename
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: "var(--color-neutral-700)" }}
                  disabled={hasMe}
                  title={hasMe ? `You can’t delete a ${TYPE_L[n.type].toLowerCase()} that holds your only allocation` : "Delete"}
                  onClick={() => s.setDialog({ kind: "del", id: n.id })}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </Blueprint>
      {v.meP.sysAdmin && <AppLinksPanel />}
    </>
  );
}

/** System admins: BIPO links (shown after leave / overtime approval) and links everyone sees in Quick links. */
function AppLinksPanel() {
  const s = useCalendar();
  const l = s.data.links ?? {};
  const [leave, setLeave] = useState(l.bipoLeave ?? "");
  const [ot, setOt] = useState(l.bipoOt ?? "");
  const [quick, setQuick] = useState<{ label: string; url: string }[]>(l.quick ?? []);
  // Payroll cut-offs vary month to month, so they're a list of dates for the year.
  const [payDates, setPayDates] = useState<string[]>(l.payrollDates ?? []);
  const [payNote, setPayNote] = useState(l.payrollNote ?? "");
  const [addDate, setAddDate] = useState("");
  const [paste, setPaste] = useState("");
  const addDates = (xs: string[]) => setPayDates([...new Set(payDates.concat(xs.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))))].sort());
  const pasted = paste.split(/[\s,;]+/).filter(Boolean);
  const pasteBad = pasted.filter((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x) || Number.isNaN(Date.parse(x)));
  const byMonth = payDates.reduce<Record<string, string[]>>((a, d) => ({ ...a, [d.slice(0, 7)]: (a[d.slice(0, 7)] ?? []).concat(d) }), {});
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const save = () =>
    s.run({
      type: "setLinks",
      links: { bipoLeave: leave, bipoOt: ot, quick: quick.filter((q) => q.label.trim() && q.url.trim()), payrollDates: payDates, payrollNote: payNote },
    });
  return (
    <Blueprint as="section" className="panel">
      <h2 className="h2">App links</h2>
      <span className="small">Addresses must start with https://. Only system admins see this.</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
        <div className="field">
          <label htmlFor="bipo-l">BIPO — filing approved leave</label>
          <input id="bipo-l" className="input" value={leave} onChange={(e) => setLeave(e.target.value)} placeholder="https://…" />
        </div>
        <div className="field">
          <label htmlFor="bipo-o">BIPO — filing approved overtime</label>
          <input id="bipo-o" className="input" value={ot} onChange={(e) => setOt(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pay-add">Payroll cut-off dates</label>
        <span className="small">Everyone gets a pop-up reminder from 2 days before each cut-off. Add the dates for the year, e.g. 15 and 30 Sep, 13 and 27 Oct.</span>
        <div className="row" style={{ gap: 8 }}>
          <input id="pay-add" className="input" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} style={{ width: 170 }} />
          <button
            className="btn btn-secondary btn-36"
            disabled={!addDate}
            onClick={() => {
              addDates([addDate]);
              setAddDate("");
            }}
          >
            Add date
          </button>
        </div>
        {payDates.length ? (
          <div className="pay-months">
            {Object.entries(byMonth).map(([ym, ds]) => (
              <div key={ym} className="pay-month" style={{ opacity: ym < s.today.slice(0, 7) ? 0.55 : 1 }}>
                <strong>
                  {MON[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}
                </strong>
                {ds.map((d) => (
                  <span key={d} className="ql-chip">
                    <span style={{ padding: "0 4px" }}>{Number(d.slice(8, 10))}</span>
                    <button aria-label={`Remove ${d}`} onClick={() => setPayDates(payDates.filter((x) => x !== d))}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <span className="small">No cut-off dates yet, so no reminder is shown.</span>
        )}
        <details>
          <summary className="small" style={{ cursor: "pointer" }}>
            Paste several dates at once
          </summary>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: "flex-start" }}>
            <textarea
              className="input"
              aria-label="Dates to add"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="2026-09-15, 2026-09-30, 2026-10-13, 2026-10-27"
              style={{ flex: 1, minHeight: 60 }}
            />
            <button
              className="btn btn-secondary btn-36"
              disabled={!pasted.length || pasteBad.length > 0}
              onClick={() => {
                addDates(pasted);
                setPaste("");
              }}
            >
              Add {pasted.length || ""}
            </button>
          </div>
          {pasteBad.length > 0 && <span className="small" style={{ color: "var(--color-accent-800)" }}>Use yyyy-mm-dd dates: {pasteBad.slice(0, 3).join(", ")}</span>}
        </details>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
        <div className="field">
          <label htmlFor="pay-n">Reminder message (optional)</label>
          <input id="pay-n" className="input" value={payNote} maxLength={200} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. File leave and overtime in BIPO before the cut-off." />
        </div>
      </div>
      <span className="small" style={{ fontSize: 12 }}>Quick links everyone sees (members add their own on top)</span>
      {quick.map((q, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <input className="input" aria-label="Name" value={q.label} maxLength={40} onChange={(e) => setQuick(quick.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ width: 200 }} />
          <input className="input" aria-label="Address" value={q.url} onChange={(e) => setQuick(quick.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={() => setQuick(quick.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button className="btn btn-secondary btn-36" onClick={() => setQuick(quick.concat({ label: "", url: "https://" }))}>
          Add a shared link
        </button>
        <Blueprint as="button" className="btn btn-primary btn-36" style={{ padding: "0 16px" }} onClick={save}>
          Save links and payroll
        </Blueprint>
      </div>
    </Blueprint>
  );
}
