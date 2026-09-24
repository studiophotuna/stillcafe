"use client";

import { Blueprint, Icon } from "@/components/ui";
import { TYPE_L } from "@/lib/calendar/constants";
import { useCalendar } from "@/lib/calendar/store";
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
          <span>Department › Tower › Team › System › Trade. Department, tower and team are required; system and trade are optional.</span>
        </div>
        <button className="btn btn-secondary btn-36" onClick={() => s.setDialog({ kind: "node", mode: "add", ntype: "dept", parent: null })}>
          <Icon name="plus" size={16} />
          Add department
        </button>
      </div>
      <Blueprint>
        {rows.map(({ n, depth }) => {
          const hasMe = (n.type === "dept" || n.type === "tower" || n.type === "branch") && v.myBranches.every((b) => O.anc(b.id).includes(n.id));
          let meta = countIn(n.id) + " people";
          if (n.type === "dept") meta = `${O.kids(n.id, "tower").length} towers · ${meta}`;
          if (n.type === "tower") meta = `${O.kids(n.id, "branch").length} teams · ${meta}`;
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
    </>
  );
}
