"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppFrame, SideAction, type NavItem } from "@/components/AppFrame";
import { Blueprint, Icon } from "@/components/ui";
import { LEVELS } from "@/lib/calendar/constants";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";
import { CalDialogs, IssuedPasswords } from "./CalDialogs";

type Access = "all" | "leader" | "teamAdmin" | "anyAdmin";
const ROUTES: { href: string; access: Access }[] = [
  { href: "/calendar/management", access: "leader" },
  { href: "/calendar/dashboard", access: "leader" },
  { href: "/calendar/admin/approvals", access: "teamAdmin" },
  { href: "/calendar/admin/members", access: "teamAdmin" },
  { href: "/calendar/admin/settings", access: "teamAdmin" },
  { href: "/calendar/admin/shifts", access: "anyAdmin" },
  { href: "/calendar/admin/organization", access: "anyAdmin" },
  { href: "/calendar/admin/holidays", access: "anyAdmin" },
  { href: "/calendar/admin/reports", access: "anyAdmin" },
];

/** Views that show the Department › Tower › Team › System › Trade bar. */
const UNIT_BAR = ["/calendar", "/calendar/management", "/calendar/dashboard", "/calendar/bcp", "/calendar/admin/approvals", "/calendar/admin/members", "/calendar/admin/settings"];
const SUB_SEL = ["/calendar", "/calendar/admin/members", "/calendar/dashboard"];

export function CalShell({ children }: { children: React.ReactNode }) {
  const s = useCalendar();
  const v = useCalView();
  const path = usePathname();
  const router = useRouter();
  const { O } = s.cal;

  const allowed = (a: Access) =>
    a === "all" || (a === "leader" ? v.isLeader || v.anyAdmin : a === "teamAdmin" ? v.isAdmin : v.anyAdmin);
  const route = ROUTES.find((r) => path === r.href);
  const blocked = !!route && !allowed(route.access);
  useEffect(() => {
    if (blocked) router.replace("/calendar");
  }, [blocked, router]);

  const nav: NavItem[] = [
    { href: "/calendar", icon: "calendar", label: "Calendar" },
    ...(v.isLeader || v.anyAdmin
      ? [
          { href: "/calendar/management", icon: "mgmt" as const, label: "Management" },
          { href: "/calendar/dashboard", icon: "dash" as const, label: "Dashboard" },
        ]
      : []),
    { href: "/calendar/bcp", icon: "bcp", label: "BCP" },
    { href: "/calendar/requests", icon: "requests", label: "My requests" },
    { href: "/calendar/notifications", icon: "bell", label: "Notifications" },
  ];
  const adminNav: NavItem[] = [
    ...(v.isAdmin
      ? [
          { href: "/calendar/admin/approvals", icon: "approvals" as const, label: "Approvals", badge: v.pendingCount },
          { href: "/calendar/admin/members", icon: "members" as const, label: "Members" },
          { href: "/calendar/admin/settings", icon: "settings" as const, label: "Settings" },
        ]
      : []),
    ...(v.anyAdmin
      ? [
          { href: "/calendar/admin/shifts", icon: "shifts" as const, label: "Shifts" },
          { href: "/calendar/admin/organization", icon: "org" as const, label: "Organization" },
          { href: "/calendar/admin/holidays", icon: "holidays" as const, label: "Holidays" },
          { href: "/calendar/admin/reports", icon: "reports" as const, label: "Reports" },
        ]
      : []),
  ];

  // BCP banner: an active event that covers me and I haven't checked in yet.
  const evs = s.data.bcpEvents.filter((e) => O.by[e.scope] && O.anc(e.scope).includes(v.dept.id));
  const activeEv = evs.find((e) => e.status === "active" && O.inN(v.meP, e.scope));
  const needCheckin = !!activeEv && !(s.data.checkins[activeEv.id] || {})[s.me];

  const vMgmt = path === "/calendar/management";
  const vBcp = path === "/calendar/bcp";
  const showUnit = UNIT_BAR.includes(path);
  const showSub = SUB_SEL.includes(path);
  const sameDept = v.viewBranches.some((b) => O.up(b.id, "dept")!.id === v.dept.id);
  const unitNote = vBcp
    ? "BCP covers the whole department"
    : vMgmt
      ? "Showing leadership across all teams"
      : path === "/calendar/admin/approvals" || path === "/calendar/admin/settings"
        ? "Approvals and settings apply to the whole team"
        : "";
  const sel = (id: string, label: string, value: string, opts: { id: string; name: string }[], onChange: (v: string) => void, min: number, all?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" style={{ minWidth: min, fontWeight: all ? 400 : 500 }} value={value} onChange={(e) => onChange(e.target.value)}>
        {all && <option value="all">{all}</option>}
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );

  const filterBar = showUnit ? (
    <>
      {sel("f-dept", "Department", v.dept.id, v.deptList, (val) => {
        const b = v.viewBranches.find((x) => O.up(x.id, "dept")!.id === val);
        s.setSel({ dept: val, branch: b ? b.id : "", system: "all", trade: "all" });
      }, 200)}
      {!vMgmt && !vBcp && sameDept &&
        sel("f-tower", "Tower", v.tower.id, v.towerOpts, (val) => {
          const b = v.viewBranches.find((x) => O.up(x.id, "tower")!.id === val);
          if (b) s.setSel({ branch: b.id, system: "all", trade: "all" });
        }, 220)}
      {!vMgmt && !vBcp && v.branchOpts.length > 0 &&
        sel("f-team", "Team", v.bid, v.branchOpts, (val) => s.setSel({ branch: val, system: "all", trade: "all" }), 180)}
      {showSub && v.systems.length > 0 &&
        sel("f-sys", "System", v.system, v.systems, (val) => s.setSel({ system: val, trade: "all" }), 150, "All systems")}
      {showSub && v.trades.length > 0 && sel("f-tr", "Trade", v.trade, v.trades, (val) => s.setSel({ trade: val }), 150, "All trades")}
      <span className="filterbar-now">
        {unitNote && <span>{unitNote}</span>}
        {s.mode === "demo" && (
          <span className="tag tag-neutral" title="No database is connected. Changes reset when the page reloads.">
            Sample data · not saved
          </span>
        )}
      </span>
    </>
  ) : undefined;

  return (
    <AppFrame
      module="calendar"
      top={<SideAction label="Request leave" icon="plus" onClick={() => s.setDialog({ kind: "request" })} />}
      nav={nav}
      adminNav={adminNav}
      user={{
        name: v.meP.name,
        role: LEVELS[v.meP.level] + (v.meP.sysAdmin ? " · System admin" : v.isAdmin ? " · Admin" : "") + (v.myBranches.length ? " · " + v.myBranches.map((b) => b.name).join(", ") : ""),
      }}
      viewAs={s.viewAs}
      setViewAs={s.setViewAs}
      banner={
        needCheckin && activeEv ? (
          <div className="banner-bcp" role="alert">
            <Icon name="bcp" size={22} />
            <div>
              <strong>BCP check-in: {activeEv.name}</strong>
              <span>{activeEv.note}</span>
            </div>
            <button
              className="btn"
              onClick={() => {
                router.push("/calendar/bcp");
                s.setDialog({ kind: "checkin", pid: s.me, evId: activeEv.id });
              }}
            >
              Check in now
            </button>
          </div>
        ) : undefined
      }
      filterBar={filterBar}
      overlay={
        <>
          <CalDialogs />
          <IssuedPasswords />
          <div className="toasts" role="status" aria-live="polite">
            {s.toasts.map((t) => (
              <Blueprint key={t.id} className="toast">
                <Icon name="check" stroke="var(--color-accent-700)" />
                <span>{t.text}</span>
              </Blueprint>
            ))}
          </div>
        </>
      }
    >
      {blocked ? null : children}
    </AppFrame>
  );
}
