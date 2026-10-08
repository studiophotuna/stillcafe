"use client";

import { useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Blueprint, Icon } from "@/components/ui";
import { LEVELS, LEVEL_RANK, OOO, isLeader } from "@/lib/calendar/constants";
import { coveredLeaders, coveringFor, coversOf } from "@/lib/calendar/covers";
import { fmtY, rng2 } from "@/lib/calendar/dates";
import { useCalendar } from "@/lib/calendar/store";
import type { CalPerson, Cover } from "@/lib/calendar/types";

/**
 * Leave cover: a leader chooses someone in their department to approve and monitor for them
 * while they're away (dates pre-filled from their next leave); it ends by itself after the
 * last day, or when they end it. Stand-ins see what they cover.
 */
export function CoverPanel() {
  const s = useCalendar();
  const c = s.cal;
  const me = c.people.get(s.me);
  const [edit, setEdit] = useState<Cover | "new" | null>(null);
  if (!me) return null;
  const mine = isLeader(me.level) ? coversOf(s.data, me.id, s.today) : [];
  const asStandIn = coveringFor(s.data, me.id, s.today);
  const nowFor = coveredLeaders(s.data, me.id, s.today);
  const name = (id: number) => c.people.get(id)?.name ?? "Former member";
  if (!isLeader(me.level) && !asStandIn.length) return null;
  const line = (x: Cover, who: string) => {
    const on = x.from <= s.today;
    return (
      <div key={x.id} className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span>
          <span className={"tag " + (on ? "tag-accent" : "tag-outline")}>{on ? "Covering now" : "Coming up"}</span> {who} · {rng2(x.from, x.to)}
        </span>
        {x.leader === me.id && (
          <span className="row" style={{ gap: 4 }}>
            <button className="btn btn-ghost" onClick={() => setEdit(x)}>
              Change
            </button>
            <button className="btn btn-ghost" onClick={() => s.run({ type: "endCover", id: x.id })}>
              {on ? "End now (I’m back)" : "Cancel"}
            </button>
          </span>
        )}
      </div>
    );
  };
  return (
    <Blueprint as="section" className="panel" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h2">Leave cover</h2>
        {isLeader(me.level) && (
          <button className="btn btn-secondary btn-36" onClick={() => setEdit("new")}>
            <Icon name="plus" size={16} />
            Choose cover
          </button>
        )}
      </div>
      {isLeader(me.level) && (
        <span className="small">
          Away? Choose someone in your department to approve and monitor for you on those days: leave, schedule, overtime and break approvals, and your
          dashboards, trackers and calendars. Their access ends by itself after the last day.
        </span>
      )}
      {mine.map((x) => line(x, `${name(x.standIn)} covers for you`))}
      {asStandIn.map((x) => line(x, `You cover for ${name(x.leader)}`))}
      {nowFor.length > 0 && (
        <span className="small">You can approve their teams’ requests in Approvals and see their dashboards and trackers until the cover ends.</span>
      )}
      {isLeader(me.level) && !mine.length && <span className="muted small">No cover set.</span>}
      {edit && <CoverDialog me={me} cover={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Blueprint>
  );
}

function CoverDialog({ me, cover, onClose }: { me: CalPerson; cover: Cover | null; onClose: () => void }) {
  const s = useCalendar();
  const c = s.cal;
  // Dates from the next leave (approved or waiting), else tomorrow.
  const next = s.data.requests
    .filter((q) => q.pid === me.id && OOO.includes(q.type) && q.end >= s.today && Object.values(q.approvals).every((v) => v !== "declined"))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const [from, setFrom] = useState(cover?.from ?? (next ? (next.start < s.today ? s.today : next.start) : s.today));
  const [to, setTo] = useState(cover?.to ?? next?.end ?? s.today);
  const [who, setWho] = useState(cover ? String(cover.standIn) : "");
  const [q, setQ] = useState("");
  const depts = (p: CalPerson) => new Set(p.assign.flatMap((x) => c.O.anc(x)).filter((n) => c.O.by[n]?.type === "dept"));
  const mine = depts(me);
  const ql = q.trim().toLowerCase();
  const people = s.data.people
    .filter((p) => p.id !== me.id && c.alive(p, s.today) && [...depts(p)].some((x) => mine.has(x)))
    .filter((p) => !ql || p.name.toLowerCase().includes(ql) || String(p.id) === who)
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.name.localeCompare(b.name));
  const teamsOf = (p: CalPerson) => c.O.branchesOf(p).map((b) => b.name).join(", ");
  return (
    <Modal onClose={onClose} width={560}>
      <div className="dialog-scroll" style={{ padding: 20, gap: 12 }}>
        <div className="dialog-title" style={{ fontSize: 22 }}>
          {cover ? "Change cover" : "Choose who covers for you"}
        </div>
        <span className="small">
          {next && !cover ? `Dates from your leave ${rng2(next.start, next.end)}. ` : ""}They can approve and monitor for you from the first to the last day; their access ends after {fmtY(to)}.
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field">
            <label htmlFor="cv-from">First day</label>
            <input id="cv-from" className="input" type="date" min={s.today} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cv-to">Last day</label>
            <input id="cv-to" className="input" type="date" min={from || s.today} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cv-who">Covered by</label>
          <input className="input" type="search" placeholder="Find someone in your department" aria-label="Find a person" value={q} onChange={(e) => setQ(e.target.value)} />
          <select id="cv-who" className="input" size={6} value={who} onChange={(e) => setWho(e.target.value)} style={{ height: "auto" }}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {LEVELS[p.level]}
                {teamsOf(p) ? ` · ${teamsOf(p)}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={onClose}>
            Cancel
          </button>
          <Blueprint
            as="button"
            className="btn btn-primary btn-40"
            style={{ padding: "0 18px" }}
            disabled={!who || !from || !to || to < from}
            onClick={() => {
              s.run({ type: "setCover", ...(cover ? { id: cover.id } : {}), leader: me.id, standIn: Number(who), from, to, actor: s.me });
              onClose();
            }}
          >
            Save cover
          </Blueprint>
        </div>
      </div>
    </Modal>
  );
}
