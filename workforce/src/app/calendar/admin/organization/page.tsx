"use client";

import { useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { TYPE_L } from "@/lib/calendar/constants";
import { useCalendar } from "@/lib/calendar/store";
import { isNodeAdmin } from "@/lib/calendar/org";
import { useCalView } from "@/lib/calendar/useCalView";
import type { NodeType, OrgNode } from "@/lib/calendar/types";

export default function OrganizationPage() {
  const s = useCalendar();
  const v = useCalView();
  const { O } = s.cal;
  const countIn = (id: string) => s.data.people.filter((p) => O.inN(p, id) && !(p.resign && p.resign < s.today)).length;
  const rows: { n: OrgNode; depth: number }[] = [];
  const push = (n: OrgNode, depth: number) => {
    rows.push({ n, depth });
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
      <Blueprint>
        {rows.map(({ n, depth }) => {
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
              <span className={"tag " + (n.type === "dept" || n.type === "tower" ? "tag-accent" : n.type === "branch" ? "tag-outline" : "tag-neutral")} style={{ minWidth: 64, justifyContent: "center" }}>
                {TYPE_L[n.type]}
              </span>
              <span style={{ fontWeight: depth < 2 ? 600 : 500, fontSize: depth === 0 ? 16 : 14 }}>{n.name}</span>
              <span className="small" style={{ marginRight: "auto" }}>{meta}</span>
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
  const save = () => s.run({ type: "setLinks", links: { bipoLeave: leave, bipoOt: ot, quick: quick.filter((q) => q.label.trim() && q.url.trim()) } });
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
          Save links
        </Blueprint>
      </div>
    </Blueprint>
  );
}
