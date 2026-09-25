"use client";

import { useState } from "react";
import { Blueprint, Icon } from "@/components/ui";
import { checkRows, type UploadRow } from "@/lib/workload/engine";
import { downloadTaskTemplate, readTaskFile } from "@/lib/workload/excel";
import { useWorkload } from "@/lib/workload/store";

/**
 * Upload tasks from the team's template: admins (Intake) and members an admin allowed
 * (Upload tasks). Required fields may be left blank here; they're asked for when the
 * task is marked done.
 */
export function UploadTasks() {
  const { data, run, toast } = useWorkload();
  const { org } = data;
  const [upload, setUpload] = useState<{ file: string; rows: UploadRow[] } | null>(null);
  const chk = upload ? checkRows(upload.rows, data.fields, org) : [];
  const okN = chk.filter((c) => c.ok).length;

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
    <Blueprint as="section" className="panel">
      <h2 className="h2">Upload tasks</h2>
      <span className="note">
        The template follows this team’s task fields (Admin › Task fields). Columns marked * can be left blank here but must be filled in before a task is marked done. System, Trade, Priority and list fields have drop-downs.
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
  );
}
