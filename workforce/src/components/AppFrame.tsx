"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/lib/session";
import { BipoNotice, HolidayPrompt, PayrollNotice, QuickLinks } from "./AppExtras";
import type { ViewAs } from "@/lib/workload/types";
import type { NavSection } from "./adminNav";
import { Blueprint, Icon, type IconName } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

/**
 * Shared shell: 248px sidebar (logo, "Workforce Management", Calendar / Workload / Admin
 * switch, nav, user), sticky filter bar, main. The Admin area shows the admin menu
 * (sections) instead of the everyday pages.
 */
export function AppFrame({
  module,
  top,
  nav,
  admin,
  user,
  viewAs,
  setViewAs,
  filterBar,
  banner,
  children,
  overlay,
}: {
  module: "calendar" | "workload" | "admin";
  /** Above the nav, e.g. the Request leave button. */
  top?: ReactNode;
  nav: NavItem[];
  /** The Admin area's menu; `show` = this person has it. */
  admin: { show: boolean; sections: NavSection[] };
  user: { name: string; role: string };
  /** Sample data only: switch between the admin and employee views. Signed-in users get Sign out instead. */
  viewAs?: ViewAs;
  setViewAs?: (v: ViewAs) => void;
  filterBar?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  /** Dialogs and toasts. */
  overlay?: ReactNode;
}) {
  const path = usePathname();
  const adminBadge = admin.sections.reduce((a, sec) => a + sec.items.reduce((b, n) => b + (n.badge ?? 0), 0), 0);
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const item = (n: NavItem) => {
    const current = path === n.href || (!["/calendar", "/workload", "/calendar/admin"].includes(n.href) && path.startsWith(n.href + "/"));
    return (
      <Link key={n.href} href={n.href} className="nav-item" aria-current={current ? "page" : undefined}>
        <Icon name={n.icon} />
        <span>{n.label}</span>
        {!!n.badge && <span className="tag tag-accent">{n.badge}</span>}
      </Link>
    );
  };
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
            {module === "calendar" ? <span className="on">Calendar</span> : <Link href="/calendar">Calendar</Link>}
            {module === "workload" ? <span className="on">Workload</span> : <Link href="/workload">Workload</Link>}
            {admin.show &&
              (module === "admin" ? (
                <span className="on">Admin</span>
              ) : (
                <Link href="/calendar/admin">
                  Admin{adminBadge > 0 && <span className="side-switch-dot" aria-label={`${adminBadge} waiting`} />}
                </Link>
              ))}
          </div>
          {module !== "admin" && top}
          {module === "admin" ? (
            admin.sections.map((sec) => (
              <nav key={sec.title} aria-label={sec.title} className="side-nav">
                <span className="side-nav-label">{sec.title}</span>
                {sec.items.map(item)}
              </nav>
            ))
          ) : (
            <nav aria-label="Main" className="side-nav">
              {nav.map(item)}
            </nav>
          )}
          <div className="side-user">
            <span className="avatar">{initials}</span>
            <span className="side-user-text">
              <span>{user.name}</span>
              <span>{user.role}</span>
            </span>
          </div>
          {viewAs && setViewAs ? (
            <label className="side-demo">
              Sample data · view as
              <select className="input" value={viewAs} onChange={(e) => setViewAs(e.target.value as ViewAs)}>
                <option value="admin">Admin (Sam Delgado)</option>
                <option value="employee">Employee (Ana Reyes)</option>
              </select>
            </label>
          ) : (
            <div className="side-signout">
              <a className="btn btn-ghost" href={`/change-password?next=${encodeURIComponent(path)}`}>
                Change password
              </a>
              <button className="btn btn-ghost" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </aside>
        <div className="content">
          <QuickLinks />
          {banner}
          {filterBar && <div className="filterbar">{filterBar}</div>}
          <main className="page">{children}</main>
        </div>
      </div>
      {overlay}
      <BipoNotice />
      <HolidayPrompt />
      <PayrollNotice />
    </div>
  );
}

/** Primary sidebar button (Request leave). */
export function SideAction({ label, icon, onClick }: { label: string; icon: IconName; onClick: () => void }) {
  return (
    <Blueprint as="button" className="btn btn-primary side-action" onClick={onClick}>
      <Icon name={icon} size={16} />
      {label}
    </Blueprint>
  );
}
