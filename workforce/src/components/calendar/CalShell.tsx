"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppFrame, SideAction, type NavItem } from "@/components/AppFrame";
import { adminSections, hasAdminArea, isAdminPath, type AdminFlags } from "@/components/adminNav";
import { Blueprint, Icon } from "@/components/ui";
import { LEVELS } from "@/lib/calendar/constants";
import { evState } from "@/lib/calendar/engine";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";
import { CalDialogs, IssuedPasswords } from "./CalDialogs";

type Access = "all" | "leader" | "approver" | "teamAdmin" | "anyAdmin" | "adminArea";
const ROUTES: { href: string; access: Access }[] = [
  { href: "/calendar/admin", access: "adminArea" as Access },
  { href: "/calendar/management", access: "leader" },
  { href: "/calendar/dashboard", access: "leader" },
  { href: "/calendar/admin/approvals", access: "approver" },
  { href: "/calendar/admin/members", access: "teamAdmin" },
  { href: "/calendar/admin/schedules", access: "teamAdmin" },
  { href: "/calendar/admin/settings", access: "teamAdmin" },
  { href: "/calendar/admin/shifts", access: "anyAdmin" },
  { href: "/calendar/admin/organization", access: "anyAdmin" },
  { href: "/calendar/admin/holidays", access: "anyAdmin" },
  { href: "/calendar/admin/reports", access: "anyAdmin" },
  { href: "/calendar/admin/headcount", access: "anyAdmin" },
];

/** Views that show the Department › Tower › Team › System › Trade bar. */
const UNIT_BAR = ["/calendar", "/calendar/admin", "/calendar/management", "/calendar/dashboard", "/calendar/bcp", "/calendar/admin/approvals", "/calendar/admin/members", "/calendar/admin/schedules", "/calendar/admin/settings"];
const SUB_SEL = ["/calendar", "/calendar/admin/members", "/calendar/admin/schedules", "/calendar/dashboard"];
/** Views that can show every team in a tower or department ("All towers" / "All teams"). */
const MULTI = ["/calendar", "/calendar/admin", "/calendar/dashboard", "/calendar/admin/approvals", "/calendar/admin/members", "/calendar/admin/schedules"];

export function CalShell({ children }: { children: React.ReactNode }) {
  const s = useCalendar();
  const v = useCalView();
  const path = usePathname();
  const router = useRouter();
  const { O } = s.cal;

  // The Admin area's menu. Workload rights come from the same team admins and leaders.
  const flags: AdminFlags = {
    canApprove: v.canApprove,
    teamAdmin: v.isAdmin,
    anyAdmin: v.anyAdmin,
    leader: v.isLeader,
    wlAdmin: v.anyAdmin,
    wlApprover: v.isLeader || v.anyAdmin,
    pricing: !!v.meP.sysAdmin || v.meP.level === "manager" || v.meP.level === "director",
    badges: { approvals: v.pendingCount },
  };
  const allowed = (a: Access) =>
    a === "all" ||
    (a === "adminArea"
      ? hasAdminArea(flags)
      : a === "leader"
        ? v.isLeader || v.anyAdmin
        : a === "approver"
          ? v.canApprove || v.isAdmin
          : a === "teamAdmin"
            ? v.isAdmin
            : v.anyAdmin);
  const route = ROUTES.find((r) => path === r.href);
  // Pages for one team (e.g. Settings) go back to a single team.
  const multiOk = MULTI.includes(path);
  const oneTeamPage = UNIT_BAR.includes(path) && !multiOk && path !== "/calendar/management" && path !== "/calendar/bcp";
  useEffect(() => {
    if (oneTeamPage && s.sel.span && s.sel.span !== "team") s.setSel({ span: "team" });
  }, [oneTeamPage, s]);
  const blocked = !!route && !allowed(route.access);
  useEffect(() => {
    if (blocked) router.replace("/calendar");
  }, [blocked, router]);

  // Everyday pages; admin and leader pages are in the Admin area.
  const nav: NavItem[] = [
    { href: "/calendar", icon: "calendar", label: "Calendar" },
    { href: "/calendar/bcp", icon: "bcp", label: "BCP" },
    { href: "/calendar/requests", icon: "requests", label: "My requests" },
    { href: "/calendar/notifications", icon: "bell", label: "Notifications" },
  ];

  // BCP banner: an active event that covers me and I haven't checked in yet.
  const evs = s.data.bcpEvents.filter((e) => O.by[e.scope] && O.anc(e.scope).includes(v.dept.id));
  const activeEv = evs.find((e) => evState(e, s.today) === "active" && O.inN(v.meP, e.scope));
  const needCheckin = !!activeEv && !(s.data.checkins[activeEv.id] || {})[s.me];

  const vMgmt = path === "/calendar/management";
  const vBcp = path === "/calendar/bcp";
  const showUnit = UNIT_BAR.includes(path);
  const showSub = SUB_SEL.includes(path);
  const sameDept = v.viewBranches.some((b) => O.up(b.id, "dept")!.id === v.dept.id);
  const unitNote = vBcp
    ? "BCP covers the whole department"
    : vMgmt
      ? v.mTower === "all"
        ? "Showing leaders across all towers"
        : `Showing leaders in ${O.by[v.mTower].name}`
      : (path === "/calendar/admin/approvals" && !v.multi) || path === "/calendar/admin/settings"
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
        s.setSel({ dept: val, branch: b ? b.id : "", system: "all", trade: "all", mTower: "all", span: "team" });
      }, 200)}
      {vMgmt && v.mTowers.length > 0 &&
        sel("f-mtower", "Tower", v.mTower, v.mTowers, (val) => s.setSel({ mTower: val }), 220, "All towers")}
      {!vMgmt && !vBcp && sameDept &&
        sel(
          "f-tower",
          "Tower",
          multiOk && v.span === "dept" ? "all" : v.tower.id,
          v.towerOpts,
          (val) => {
            if (val === "all") return s.setSel({ span: "dept", system: "all", trade: "all" });
            const b = v.viewBranches.find((x) => O.up(x.id, "tower")!.id === val);
            if (b) s.setSel({ branch: b.id, system: "all", trade: "all", span: v.span === "dept" ? "tower" : v.span });
          },
          220,
          multiOk && v.towerOpts.length > 1 ? "All towers" : undefined,
        )}
      {!vMgmt && !vBcp && v.branchOpts.length > 0 && !(multiOk && v.span === "dept") &&
        sel(
          "f-team",
          "Team",
          multiOk && v.span === "tower" ? "all" : v.bid,
          v.branchOpts,
          (val) => (val === "all" ? s.setSel({ span: "tower", system: "all", trade: "all" }) : s.setSel({ branch: val, system: "all", trade: "all", span: "team" })),
          180,
          multiOk && v.branchOpts.length > 1 ? "All teams" : undefined,
        )}
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
      module={isAdminPath(path) ? "admin" : "calendar"}
      top={<SideAction label="Request" icon="plus" onClick={() => s.setDialog({ kind: "request" })} />}
      nav={nav}
      admin={{ show: hasAdminArea(flags), sections: adminSections(flags) }}
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
