"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { fmtT } from "@/lib/workload/clock";
import { SYS, TEAM, TRADES, modeLabel, trPath } from "@/lib/workload/constants";
import { useWorkload } from "@/lib/workload/store";
import type { ViewAs } from "@/lib/workload/types";
import { Dialogs, Toasts } from "./Dialogs";
import { ICONS, Icon } from "./ui";

type NavKey = keyof typeof ICONS;
const NAV: { href: string; key: NavKey; label: string; admin?: boolean }[] = [
  { href: "/workload", key: "my", label: "My work" },
  { href: "/workload/queue", key: "queue", label: "Queue" },
  { href: "/workload/dashboard", key: "dash", label: "Dashboard", admin: true },
];
const ADMIN_NAV: { href: string; key: NavKey; label: string }[] = [
  { href: "/workload/admin/intake", key: "intake", label: "Intake" },
  { href: "/workload/admin/fields", key: "fields", label: "Task fields" },
  { href: "/workload/admin/allocation", key: "rules", label: "Allocation" },
  { href: "/workload/admin/targets", key: "targets", label: "Targets" },
];

/** Admin-only routes; members are sent back to My work. */
const isAdminRoute = (path: string) => path.startsWith("/workload/admin") || path.startsWith("/workload/dashboard");

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
  const initials = me.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const role = isAdmin ? `Manager · Admin · ${TEAM.name}` : "Member · " + me.trades.map(trPath).join(", ");

  const item = (n: { href: string; key: NavKey; label: string }, badge?: number) => (
    <Link key={n.href} href={n.href} className="nav-item" aria-current={path === n.href ? "page" : undefined}>
      <Icon name={n.key} />
      <span>{n.label}</span>
      {!!badge && <span className="tag tag-accent">{badge}</span>}
    </Link>
  );

  return (
    <div className="app">
      <div className="app-grid">
        <aside className="side">
          <div className="side-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dsv-logo.png" alt="DSV" />
            <span>Workforce Management</span>
          </div>
          <div className="side-switch">
            <Link href="/calendar">Calendar</Link>
            <span className="on">Workload</span>
          </div>
          <nav aria-label="Main" className="side-nav">
            {NAV.filter((n) => !n.admin || isAdmin).map((n) => item(n, n.key === "queue" ? openQ : undefined))}
          </nav>
          {isAdmin && (
            <nav aria-label="Admin" className="side-nav">
              <span className="side-nav-label">Admin</span>
              {ADMIN_NAV.map((n) => item(n))}
            </nav>
          )}
          <div className="side-user">
            <span className="avatar">{initials}</span>
            <span className="side-user-text">
              <span>{me.name}</span>
              <span>{role}</span>
            </span>
          </div>
          {/* Stand-in for Entra ID sign-in until auth is connected. */}
          <label className="side-demo">
            Prototype · view as
            <select className="input" value={viewAs} onChange={(e) => setViewAs(e.target.value as ViewAs)}>
              <option value="admin">Admin (Sam Delgado)</option>
              <option value="employee">Employee (Ana Reyes)</option>
            </select>
          </label>
        </aside>

        <div className="content">
          <div className="filterbar">
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
          </div>
          <main className="page">{blocked ? null : children}</main>
        </div>
      </div>
      <Dialogs />
      <Toasts />
    </div>
  );
}
