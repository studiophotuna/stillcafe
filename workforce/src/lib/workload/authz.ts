/**
 * Who may do what in Workload. Members act only as themselves; admin actions
 * need Workload admin rights (team admin or system admin, from the Calendar).
 */
import type { Action } from "./actions";
import type { WorkloadData } from "./engine";

const ADMIN_ONLY: Action["type"][] = ["reviewCx", "distribute", "setTrade", "setPriority", "setTaskType", "setReceived", "assign", "checkMail", "setSettings", "setFields"];

/** Admins, and members an admin has allowed to upload tasks (they must be in the team). */
export const canUpload = (d: WorkloadData, me: number) =>
  d.admins.includes(me) || ((d.settings.uploaders ?? []).includes(me) && d.people.some((p) => p.id === me));

export function authorizeWl(a: Action, d: WorkloadData, me: number): { action: Action } | { error: string } {
  const admin = d.admins.includes(me);
  if (a.type === "importRows") return canUpload(d, me) ? { action: a } : { error: "Ask a Workload admin for upload access." };
  if (a.type === "reviewCx" || a.type === "editDone") return admin ? { action: { ...a, by: me } } : { error: "Only Workload admins can do that." };
  if (a.type === "setSettings" && "billing" in a.patch && !(d.pricers ?? []).includes(me)) return { error: "Only managers and directors can set pricing." };
  if (ADMIN_ONLY.includes(a.type)) return admin ? { action: a } : { error: "Only Workload admins can do that." };
  switch (a.type) {
    case "startWork":
    case "startTask":
    case "pickTask":
    case "pauseTask":
    case "claimTask":
    case "answerClaim":
    case "cancelClaim":
    case "resume":
    case "complete":
    case "away":
    case "back":
    case "planOt":
    case "endWork":
    case "undoEnd":
      return { action: { ...a, pid: me } };
    case "decideOt": {
      const x = d.activities.find((y) => y.id === a.id);
      if (!d.approvers.includes(me)) return { error: "Only Workload admins and leads can approve overtime." };
      if (x?.pid === me) return { error: "Someone else needs to approve your overtime." };
      return { action: { ...a, by: me } };
    }
    case "setDelay": {
      const t = d.tasks.find((x) => x.id === a.id);
      return t && (t.assignee === me || admin || d.approvers.includes(me)) ? { action: a } : { error: "Only the assignee or a lead can add delay remarks." };
    }
    case "hold": {
      const t = d.tasks.find((x) => x.id === a.id);
      return t && (t.assignee === me || admin) ? { action: a } : { error: "You can only set your own ticket to pending." };
    }
  }
  return { error: "Unknown action." };
}
