"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { fmtT } from "@/lib/workload/clock";
import { modeLabel, trPathOf } from "@/lib/workload/constants";
import { cxQuestions } from "@/lib/workload/engine";
import { breakFlags } from "@/lib/workload/breaks";
import { rangeMs, todayRange } from "@/lib/workload/period";
import { useWorkload } from "@/lib/workload/store";
import { useUnit } from "@/lib/workload/useUnit";
import { adminSections, hasAdminArea, isAdminPath, type AdminFlags } from "./adminNav";
import { AppFrame, type NavItem } from "./AppFrame";
import { Dialogs, Toasts } from "./Dialogs";
import { AwayPopup, StaleNotice } from "./WorkloadBits";

/** Admin-only routes; members are sent back to My work. */
const isAdminRoute = (path: string) => path.startsWith("/workload/admin") || path.startsWith("/workload/dashboard");

/** Workload module shell. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { data, now, mode, me, isAdmin, canUpload, isApprover, viewAs, setViewAs, sys, tr, setSys, setTr, setTeam } = useWorkload();
  const otPending = data.activities.filter((a) => a.otStatus === "pending" && a.pid !== me.id).length;
  // Today's break + lunch over the allowance for members assigned to me (or unassigned).
  const [d0, d1] = rangeMs(todayRange(now));
  const brkFlags = isApprover
    ? breakFlags(data, d0, d1, now).filter((f) => {
        const ap = data.people.find((p) => p.id === f.pid)?.approver;
        return f.pid !== me.id && (ap === me.id || ap === undefined);
      }).length
    : 0;
  const { trOpts } = useUnit();
  const { org } = data;
  // Teams grouped by tower for the picker.
  const towers = [...new Set(org.teams.map((t) => t.tower))];
  const path = usePathname();
  const router = useRouter();
  const blocked = (!isAdmin && isAdminRoute(path)) || (!canUpload && path === "/workload/upload") || (!isApprover && (path === "/workload/overtime" || path === "/workload/breaks"));

  useEffect(() => {
    if (blocked) router.replace("/workload");
  }, [blocked, router]);

  const openQ = data.tasks.filter((t) => t.status === "new").length;
  // Requests from teammates to take one of my tasks.
  const myClaims = data.tasks.filter((t) => t.assignee === me.id && t.claim && t.status !== "done").length;
  const cxQs = isAdmin ? cxQuestions(data).length : 0;
  // Everyday pages; admin and approver pages are in the Admin area.
  const nav: NavItem[] = [
    { href: "/workload", icon: "my", label: "My work", badge: myClaims },
    { href: "/workload/queue", icon: "queue", label: "Queue", badge: openQ },
    { href: "/workload/history", icon: "reports", label: "Task history" },
    ...(!isAdmin && canUpload ? [{ href: "/workload/upload", icon: "intake" as const, label: "Upload tasks" }] : []),
  ];
  // Calendar rights come from the same team admins and leaders.
  const flags: AdminFlags = {
    canApprove: isApprover,
    teamAdmin: isAdmin,
    anyAdmin: isAdmin,
    leader: isApprover,
    wlAdmin: isAdmin,
    wlApprover: isApprover,
    badges: { overtime: otPending, breaks: brkFlags, complexity: cxQs },
  };

  return (
    <AppFrame
      module={isAdminPath(path) ? "admin" : "workload"}
      nav={nav}
      admin={{ show: hasAdminArea(flags), sections: adminSections(flags) }}
      user={{
        name: me.name,
        role: (isAdmin ? `Admin · ${org.team.name}` : org.team.name) + // (a team that is its own single unit isn't repeated)
          (me.trades.some((x) => x !== org.team.id) ? " · " + me.trades.map((x) => trPathOf(org, x)).join(", ") : ""),
      }}
      viewAs={viewAs}
      setViewAs={setViewAs}
      overlay={
        <>
          <Dialogs />
          <Toasts />
          <AwayPopup />
          <StaleNotice />
        </>
      }
      filterBar={
        <>
          <div className="field">
            <label htmlFor="f-team">Team</label>
            <select id="f-team" className="input" style={{ minWidth: 220, fontWeight: 500 }} value={org.team.id} onChange={(e) => setTeam(e.target.value)} disabled={org.teams.length < 2}>
              {towers.map((tw) => (
                <optgroup key={tw} label={tw || "Teams"}>
                  {org.teams
                    .filter((t) => t.tower === tw)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          {org.systems.length > 0 && (
            <div className="field">
              <label htmlFor="f-sys">System</label>
              <select id="f-sys" className="input" style={{ minWidth: 150 }} value={sys} onChange={(e) => setSys(e.target.value)}>
                <option value="all">All systems</option>
                {org.systems.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {trOpts.length > 1 && (
            <div className="field">
              <label htmlFor="f-tr">Trade</label>
              <select id="f-tr" className="input" style={{ minWidth: 150 }} value={tr} onChange={(e) => setTr(e.target.value)}>
                <option value="all">All trades</option>
                {trOpts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <span className="filterbar-now">
            {mode === "demo" && (
              <span className="tag tag-neutral" title="No database is connected. Changes reset when the page reloads.">
                Sample data · not saved
              </span>
            )}
            <span className="tag tag-outline">{modeLabel(data.settings.mode)}</span>
            {fmtT(now)}
          </span>
        </>
      }
    >
      {blocked ? null : children}
    </AppFrame>
  );
}
