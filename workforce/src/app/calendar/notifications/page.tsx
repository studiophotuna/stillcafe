"use client";

import { useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { useCalendar } from "@/lib/calendar/store";

export default function NotificationsPage() {
  const s = useCalendar();
  const { O } = s.cal;
  const vis = s.data.logs.filter((l) => (O.by[l.did]?.admins ?? []).includes(s.me) || l.toIds.includes(s.me));
  const [sel, setSel] = useState<string | null>(null);
  const L = vis.find((l) => l.id === sel) ?? vis[0];
  const kind = (k: string) => (k === "invite" ? "Outlook reminder" : "Email");
  const att = L?.att ?? [];
  return (
    <>
      <div className="page-head">
        <h1>Notifications</h1>
        <span>Emails and Outlook reminders sent by Workforce Management. Sending goes live with the Microsoft 365 connection; until then they are recorded here.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 20, alignItems: "start", padding: 6 }}>
        <Blueprint style={{ display: "flex", flexDirection: "column", maxHeight: "70vh", overflow: "auto" }}>
          {vis.map((l) => (
            <button key={l.id} className="log-item" aria-current={l.id === L?.id} onClick={() => setSel(l.id)}>
              <span style={{ flex: "none", color: "var(--color-accent-700)", marginTop: 2 }}>
                <Icon name={l.kind === "invite" ? "calendar" : "mail"} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 500, fontSize: 13.5 }}>{l.subject}</span>
                <span className="small" style={{ fontSize: 12 }}>
                  {kind(l.kind)} · {l.toShort} · {l.at}
                </span>
              </span>
            </button>
          ))}
          {!vis.length && <div style={{ padding: "24px 14px", color: "var(--color-neutral-700)" }}>No notifications for you yet.</div>}
        </Blueprint>
        {L && (
          <Blueprint as="article" className="current" style={{ gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="tag tag-accent">{kind(L.kind)}</span>
              <span className="small" style={{ fontSize: 12 }}>{L.at}</span>
            </div>
            <h2 style={{ fontSize: 24 }}>{L.subject}</h2>
            <div className="email-head" style={{ fontSize: 13, gap: "4px 12px", paddingBottom: 12, borderBottom: "1px solid var(--color-divider)" }}>
              <span>From</span>
              <span>Workforce Management &lt;no-reply@dsv.com&gt;</span>
              <span>To</span>
              <span>{L.toLine}</span>
              {L.kind === "invite" && (
                <>
                  <span>When</span>
                  <span>{L.when}</span>
                  <span>Show as</span>
                  <span>Free · Reminder 1 day before</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14.5, lineHeight: 1.5, maxWidth: "60ch" }}>
              {L.lines.map((ln, i) => (
                <p key={i} style={{ margin: 0 }}>{ln}</p>
              ))}
            </div>
            {L.cta && (
              <div className="row">
                <Blueprint as="span" className="btn btn-primary btn-40" style={{ padding: "0 18px" }}>Approve</Blueprint>
                <span className="btn btn-secondary btn-40" style={{ padding: "0 18px" }}>Decline</span>
                <span className="btn btn-ghost btn-40">Open Workforce Management</span>
              </div>
            )}
            {L.kind === "invite" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="small" style={{ fontSize: 12 }}>Attendees ({att.length})</span>
                <div className="tags">
                  {att.slice(0, 14).concat(att.length > 14 ? [`+${att.length - 14} more`] : []).map((a) => (
                    <span key={a} className="tag tag-neutral">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </Blueprint>
        )}
      </div>
    </>
  );
}
