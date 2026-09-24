"use client";

import { useState } from "react";
import { Blueprint, Icon, PageHead } from "@/components/ui";
import { trPathOf } from "@/lib/workload/constants";
import { checkRows, type UploadRow } from "@/lib/workload/engine";
import { downloadTaskTemplate, readTaskFile } from "@/lib/workload/excel";
import { useWorkload } from "@/lib/workload/store";

export default function IntakePage() {
  const { data, run, toast, mode } = useWorkload();
  const { org } = data;
  const [upload, setUpload] = useState<{ file: string; rows: UploadRow[] } | null>(null);
  const s = data.settings;
  const chk = upload ? checkRows(upload.rows, data.fields, org) : [];
  const okN = chk.filter((c) => c.ok).length;
  const setSetting = (patch: Partial<typeof s>) => run({ type: "setSettings", patch });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUpload({ file: file.name, rows: await readTaskFile(file) });
    } catch {
      toast("That file couldn’t be read.");
    }
  };

  return (
    <>
      <PageHead title={`Intake · ${org.team.name}`} sub="Tasks come in from an uploaded file or from the team’s shared Outlook mailbox." />
      <div className="grid-2 wide">
        <Blueprint as="section" className="panel">
          <h2 className="h2">Upload tasks</h2>
          <span className="note">
            The template follows this team’s task fields (Admin › Task fields). Required columns are marked with *. System, Trade, Priority and list fields have drop-downs.
          </span>
          <div className="row">
            <button
              className="btn btn-secondary btn-40"
              onClick={async () => {
                try {
                  await downloadTaskTemplate(data.fields, org);
                  toast("Template downloaded.");
                } catch {
                  toast("The template couldn’t be created. Try again.");
                }
              }}
            >
              <Icon name="download" size={16} />
              Download template (.xlsx)
            </button>
            <label className="btn btn-secondary btn-40 file-btn">
              Choose file (.xlsx or .csv)
              <input type="file" accept=".xlsx,.csv" onChange={onFile} />
            </label>
            <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{upload?.file}</span>
          </div>
          {upload && (
            <>
              <div className="banner">
                {chk.length} rows · {okN} ready · {chk.length - okN} with errors
              </div>
              <div className="boxed-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Task</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chk.slice(0, 200).map((u) => (
                      <tr key={u.n}>
                        <td className="muted">{u.n}</td>
                        <td>{u.summary}</td>
                        <td>
                          <span className={"tag " + (u.ok ? "tag-accent" : "tag-neutral")}>{u.ok ? "Ready" : "Error"}</span>
                        </td>
                        <td style={{ fontSize: 13 }}>{u.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row end">
                <button className="btn btn-secondary btn-40" onClick={() => setUpload(null)}>
                  Cancel
                </button>
                <Blueprint
                  as="button"
                  className="btn btn-primary btn-40"
                  style={{ padding: "0 18px" }}
                  disabled={!okN}
                  onClick={() => {
                    run({ type: "importRows", rows: upload.rows });
                    setUpload(null);
                  }}
                >
                  Import {okN} task{okN === 1 ? "" : "s"}
                </Blueprint>
              </div>
            </>
          )}
        </Blueprint>

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
    </>
  );
}
