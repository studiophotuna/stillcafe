"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/lib/session";
import { BipoNotice, QuickLinks } from "./AppExtras";
import type { ViewAs } from "@/lib/workload/types";
import { Blueprint, Icon, type IconName } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

/**
 * Shared shell for both modules: 248px sidebar (logo, "Workforce Management",
 * Calendar / Workload switch, nav, Admin group, user), sticky filter bar, main.
 */
export function AppFrame({
  module,
  top,
  nav,
  adminNav,
  user,
  viewAs,
  setViewAs,
  filterBar,
  banner,
  children,
  overlay,
}: {
  module: "calendar" | "workload";
  /** Above the nav, e.g. the Request leave button. */
  top?: ReactNode;
  nav: NavItem[];
  adminNav: NavItem[];
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
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const item = (n: NavItem) => {
    const current = path === n.href || (n.href !== "/calendar" && n.href !== "/workload" && path.startsWith(n.href + "/"));
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
          </div>
          {top}
          <nav aria-label="Main" className="side-nav">
            {nav.map(item)}
          </nav>
          {adminNav.length > 0 && (
            <nav aria-label="Admin" className="side-nav">
              <span className="side-nav-label">Admin</span>
              {adminNav.map(item)}
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
