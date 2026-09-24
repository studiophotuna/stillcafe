"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { fmtT } from "@/lib/workload/clock";
import { SYS, TEAM, TRADES, modeLabel, trPath } from "@/lib/workload/constants";
import { useWorkload } from "@/lib/workload/store";
import { AppFrame, type NavItem } from "./AppFrame";
import { Dialogs, Toasts } from "./Dialogs";

/** Admin-only routes; members are sent back to My work. */
const isAdminRoute = (path: string) => path.startsWith("/workload/admin") || path.startsWith("/workload/dashboard");

/** Workload module shell. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { data, now, mode, me, isAdmin, viewAs, setViewAs, sys, tr, setSys, setTr } = useWorkload();
  const path = usePathname();
  const router = useRouter();
  const blocked = !isAdmin && isAdminRoute(path);

  useEffect(() => {
    if (blocked) router.replace("/workload");
  }, [blocked, router]);

  const openQ = data.tasks.filter((t) => t.status === "new").length;
  const trOpts = TRADES.filter((t) => sys === "all" || t.sys === sys);
  const nav: NavItem[] = [
    { href: "/workload", icon: "my", label: "My work" },
    { href: "/workload/queue", icon: "queue", label: "Queue", badge: openQ },
    ...(isAdmin ? [{ href: "/workload/dashboard", icon: "dash" as const, label: "Dashboard" }] : []),
  ];
  const adminNav: NavItem[] = isAdmin
    ? [
        { href: "/workload/admin/intake", icon: "intake", label: "Intake" },
        { href: "/workload/admin/fields", icon: "fields", label: "Task fields" },
        { href: "/workload/admin/allocation", icon: "rules", label: "Allocation" },
        { href: "/workload/admin/targets", icon: "targets", label: "Targets" },
      ]
    : [];

  return (
    <AppFrame
      module="workload"
      nav={nav}
      adminNav={adminNav}
      user={{ name: me.name, role: isAdmin ? `Manager · Admin · ${TEAM.name}` : "Member · " + me.trades.map(trPath).join(", ") }}
      viewAs={viewAs}
      setViewAs={setViewAs}
      overlay={
        <>
          <Dialogs />
          <Toasts />
        </>
      }
      filterBar={
        <>
          <div className="field">
            <label htmlFor="f-team">Team</label>
            <select id="f-team" className="input" style={{ minWidth: 200, fontWeight: 500 }} value={TEAM.id} onChange={() => {}}>
              <option value={TEAM.id}>{TEAM.name}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-sys">System</label>
            <select id="f-sys" className="input" style={{ minWidth: 150 }} value={sys} onChange={(e) => setSys(e.target.value)}>
              <option value="all">All systems</option>
              {Object.entries(SYS).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {trOpts.length > 0 && (
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
