"use client";

import { UploadTasks } from "@/components/UploadTasks";
import { Blueprint, PageHead } from "@/components/ui";
import { trPathOf } from "@/lib/workload/constants";
import { useWorkload } from "@/lib/workload/store";

export default function IntakePage() {
  const { data, run, mode } = useWorkload();
  const { org } = data;
  const s = data.settings;
  const setSetting = (patch: Partial<typeof s>) => run({ type: "setSettings", patch });
  // Members who may upload (admins always can).
  const uploaders = s.uploaders ?? [];
  const members = data.people.filter((p) => !data.admins.includes(p.id));

  return (
    <>
      <PageHead title={`Intake · ${org.team.name}`} sub="Tasks come in from an uploaded file or from the team’s shared Outlook mailbox." />
      <div className="grid-2 wide">
        <UploadTasks />

        <Blueprint as="section" className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h2 className="h2">Outlook mailbox</h2>
            {mode === "demo" ? <span className="tag tag-accent">Connected</span> : <span className="tag tag-neutral">Not connected yet</span>}
          </div>
          <div className="field">
            <label htmlFor="mailbox">Shared mailbox</label>
            <input id="mailbox" className="input" value={s.mailbox} onChange={(e) => setSetting({ mailbox: e.target.value })} />
          </div>
          <span className="note">Each new email becomes a task with its sender, Cc, subject, body, received time and attachments.</span>
          <div className="field">
            <label htmlFor="mailtrade">System › Trade for emails from this mailbox (optional)</label>
            <select id="mailtrade" className="input" value={s.mailTrade} onChange={(e) => setSetting({ mailTrade: e.target.value })}>
              <option value="">Set by an admin for each email</option>
              {org.trades.map((o) => (
                <option key={o.id} value={o.id}>
                  {trPathOf(org, o.id)}
                </option>
              ))}
            </select>
          </div>
          <span className="small">If left blank, new emails wait in the queue as “Needs trade” until an admin sets it from the task details.</span>
          <div className="row">
            {mode === "demo" ? (
              <>
                <button className="btn btn-secondary btn-40" onClick={() => run({ type: "checkMail" })}>
                  Check mailbox now
                </button>
                <span className="small">Sample emails. Checked automatically every 2 minutes in the live system.</span>
              </>
            ) : (
              <span className="small">Emails start arriving as tasks once the Microsoft Graph connection is set up. Until then, use Upload tasks.</span>
            )}
          </div>
        </Blueprint>
      </div>
      <Blueprint as="section" className="panel">
        <h2 className="h2">Who can upload tasks</h2>
        <span className="note">
          Admins can always upload. Tick members who may upload too; they get an Upload tasks page in their menu.
        </span>
        {members.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
            {members.map((p) => (
              <label key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  className="check"
                  checked={uploaders.includes(p.id)}
                  onChange={() => setSetting({ uploaders: uploaders.includes(p.id) ? uploaders.filter((x) => x !== p.id) : uploaders.concat(p.id) })}
                />
                {p.name}
              </label>
            ))}
          </div>
        ) : (
          <span className="small">No members in this team yet.</span>
        )}
      </Blueprint>
    </>
  );
}
