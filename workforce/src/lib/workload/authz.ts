/**
 * Who may do what in Workload. Members act only as themselves; admin actions
 * need Workload admin rights (team admin or system admin, from the Calendar).
 */
import type { Action } from "./actions";
import type { WorkloadData } from "./engine";

const ADMIN_ONLY: Action["type"][] = ["distribute", "setTrade", "setPriority", "assign", "checkMail", "setSettings", "setFields"];

/** Admins, and members an admin has allowed to upload tasks (they must be in the team). */
export const canUpload = (d: WorkloadData, me: number) =>
  d.admins.includes(me) || ((d.settings.uploaders ?? []).includes(me) && d.people.some((p) => p.id === me));

export function authorizeWl(a: Action, d: WorkloadData, me: number): { action: Action } | { error: string } {
  const admin = d.admins.includes(me);
  if (a.type === "importRows") return canUpload(d, me) ? { action: a } : { error: "Ask a Workload admin for upload access." };
  if (ADMIN_ONLY.includes(a.type)) return admin ? { action: a } : { error: "Only Workload admins can do that." };
  switch (a.type) {
    case "startWork":
    case "startTask":
    case "resume":
    case "complete":
      return { action: { ...a, pid: me } };
    case "hold": {
      const t = d.tasks.find((x) => x.id === a.id);
      return t && (t.assignee === me || admin) ? { action: a } : { error: "You can only put your own task on hold." };
    }
  }
  return { error: "Unknown action." };
}
