"use client";

import { Chip, Seg } from "@/components/calendar/bits";
import { Blueprint, Icon } from "@/components/ui";
import { CODES, CODE_KEYS, POOL } from "@/lib/calendar/constants";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";
import type { CalAction } from "@/lib/calendar/actions";
import type { OrgNode } from "@/lib/calendar/types";

type TeamPatch = Extract<CalAction, { type: "teamSettings" }>["patch"];

export default function SettingsPage() {
  const s = useCalendar();
  const v = useCalView();
  const b = v.branch;
  const admins = b.admins ?? [];
  const set = (patch: TeamPatch) => s.run({ type: "teamSettings", id: b.id, patch });
  const cands = s.data.people
    .filter((p) => s.cal.O.inN(p, b.id) && !admins.includes(p.id) && !(p.resign && p.resign < s.today))
    .sort((x, y) => x.name.localeCompare(y.name));
  const check = (label: string, desc: string, on: boolean, key: keyof Pick<OrgNode, "notifyAdmin" | "notifyUser" | "invite">) => (
    <label className="rule">
      <input type="checkbox" className="check" checked={on} onChange={() => set({ [key]: !on })} />
      <span className="rule-text">
        <strong>{label}</strong>
        <span>{desc}</span>
      </span>
    </label>
  );
  const mode = (m: "auto" | "approval", label: string, desc: string) => (
    <label className={"pick-card" + ((b.mode ?? "approval") === m ? " on" : "")}>
      <input type="radio" name="mode" className="check" checked={(b.mode ?? "approval") === m} onChange={() => set({ mode: m })} style={{ marginTop: 2 }} />
      <span className="mode-text">
        <strong>{label}</strong>
        <span>{desc}</span>
      </span>
    </label>
  );
  return (
    <>
      <div className="page-head">
        <h1>Settings · {b.name}</h1>
        <span>Settings apply to the whole team, including its systems and trades. Changes save immediately.</span>
      </div>
      <div className="grid-2">
        <Blueprint as="section" className="panel">
          <h2 className="h2">Leave approval</h2>
          {mode("auto", "Approve automatically", "Requests appear on the calendar straight away. The employee gets a confirmation email.")}
          {mode("approval", "Require admin approval", "Requests show as pending until an admin approves or declines them.")}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="small" style={{ fontSize: 12 }}>Team admins</span>
            <div className="tags" style={{ alignItems: "center" }}>
              {admins.map((i) => (
                <span key={i} className="tag tag-accent" style={{ gap: 6, paddingRight: 4 }}>
                  {s.cal.people.get(i)?.name}
                  {admins.length > 1 && (
                    <button
                      onClick={() => s.run({ type: "removeAdmin", id: b.id, pid: i })}
                      aria-label="Remove admin"
                      title="Remove admin"
                      style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: "inherit", display: "grid", placeItems: "center" }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <select
              className="input"
              aria-label="Add an admin"
              value=""
              onChange={(e) => e.target.value !== "" && s.run({ type: "addAdmin", id: b.id, pid: Number(e.target.value) })}
              style={{ width: "auto", maxWidth: 280 }}
            >
              <option value="">Add an admin…</option>
              {cands.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </Blueprint>
        <Blueprint as="section" className="panel" style={{ gap: 14 }}>
          <h2 className="h2">Notifications</h2>
          {check("Email admins about new requests", "Includes Approve and Decline buttons.", b.notifyAdmin !== false, "notifyAdmin")}
          {check("Email employees when a decision is made", "Sent when a request is approved or declined.", b.notifyUser !== false, "notifyUser")}
          {check(
            "Send Outlook reminders to the team",
            "Approved leave and business trips are added to every team member’s Outlook calendar as “Free”, so the reminder doesn’t block their time.",
            b.invite !== false,
            "invite",
          )}
        </Blueprint>
        <Blueprint as="section" className="panel">
          <h2 className="h2">Calendar</h2>
          <div className="field">
            <label>Default view when someone opens the calendar</label>
            <Seg name="defscope" value={b.defaultScope ?? "all"} options={[["all", "Everyone in view"], ["me", "Just me"]]} onChange={(val) => set({ defaultScope: val })} />
          </div>
        </Blueprint>
        <Blueprint as="section" className="panel" style={{ gap: 10 }}>
          <h2 className="h2">Leave policy</h2>
          <div className="stat-grid">
            <div>
              <span>VL + SL</span>
              <span>25</span>
              <span>days per year, shared</span>
            </div>
            <div>
              <span>Emergency leave</span>
              <span>5</span>
              <span>days per year, separate</span>
            </div>
            <div>
              <span>Carry-over</span>
              <span>5</span>
              <span>max unused VL/SL days into next year</span>
            </div>
          </div>
          <span className="small" style={{ fontSize: 13 }}>
            Company-wide. On 1 January each person’s unused VL/SL (up to 5 days) is added to the new year’s 25. Unused emergency leave doesn’t carry over. Per-person entitlements can be set in the members upload.
          </span>
        </Blueprint>
        <Blueprint as="section" className="panel tight">
          <h2 className="h2">Status codes</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Meaning</th>
                <th>Uses balance</th>
              </tr>
            </thead>
            <tbody>
              {CODE_KEYS.map((k) => (
                <tr key={k}>
                  <td>
                    <Chip s={CODES[k]}>{k}</Chip>
                  </td>
                  <td>{CODES[k].label}</td>
                  <td className="muted">
                    {k === "HD" ? "VL + SL pool (half a day)" : POOL.includes(k) ? "VL + SL pool (25 + carry-over)" : k === "EL" ? "Emergency leave (5)" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Blueprint>
      </div>
    </>
  );
}
