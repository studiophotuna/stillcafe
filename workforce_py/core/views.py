"""
Pages. Each page is rendered on the server from the database; buttons are ordinary form posts
(they work without JavaScript), followed by a redirect so a refresh never repeats an action.
"""
from __future__ import annotations

import calendar as pycal
from datetime import date, timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import views as auth_views
from django.http import HttpResponseForbidden
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from . import models as m
from . import services as svc
from .access import PERSONAS, current_person
from .rules import workload as W
from .rules.calendar import CODES, LEADER_LEVELS, cell_style
from .rules.clock import day_key, dur, fmt_day, fmt_min, fmt_s, fmt_t, local, now as clock_now

LEVEL_LABEL = dict(m.Person.LEVELS)


# ── shell ──


def _role(person: m.Person, team: m.OrgNode | None, c) -> str:
    parts = []
    if person.level in LEADER_LEVELS:
        parts.append(LEVEL_LABEL[person.level])
    if team and svc.is_team_admin(person, team.id, c):
        parts.append("Admin")
    if team:
        parts.append(team.name)
    p = c.people.get(person.id)
    if p and team and not parts[:-1]:
        sub = next((c.O.sub(a) for a in p.assign if team.id in c.O.anc(a) and c.O.sub(a)), "")
        if sub:
            parts.append(sub.replace(" · ", " › "))
    return " · ".join(parts)


def _shell(request, module: str, person: m.Person, team: m.OrgNode | None, c, nav: list[dict], **extra) -> dict:
    path = request.path
    for n in nav:
        n["current"] = path == n["href"] or (n["href"] not in ("/calendar/", "/workload/") and path.startswith(n["href"]))
    return {
        "module": module,
        "team": team,
        "me": person,
        "initials": "".join(w[0] for w in person.name.split()[:2]),
        "role": _role(person, team, c),
        "nav": nav,
        "show_admin": any(svc.is_team_admin(person, t.id, c) for t in svc.teams_for(person, c)),
        "demo": settings.WFM_DEMO,
        "personas": PERSONAS,
        "view_as": request.session.get("view_as", "employee"),
        "now_text": fmt_t(clock_now()),
        **extra,
    }


def _person_or_403(request):
    p = current_person(request)
    if not p:
        return None, HttpResponseForbidden("Your sign-in isn’t linked to a person yet. Ask an admin to add you in Members.")
    return p, None


def _team(request, person, c) -> m.OrgNode | None:
    teams = [t for t in svc.teams_for(person, c) if hasattr(t, "workload")]
    want = request.GET.get("team") or request.session.get("team")
    t = next((x for x in teams if x.id == want), teams[0] if teams else None)
    if t:
        request.session["team"] = t.id
    return t


@require_POST
def view_as(request):
    if settings.WFM_DEMO and any(request.POST.get("v") == k for k, _, _ in PERSONAS):
        request.session["view_as"] = request.POST["v"]
    return redirect(request.POST.get("next") or "/workload/")


class LoginView(auth_views.LoginView):
    template_name = "core/login.html"
    redirect_authenticated_user = True


# ── Workload ──


def _wl_nav(state: W.WorkloadState) -> list[dict]:
    waiting = sum(1 for t in state.tasks if t.status == "new")
    return [
        {"href": "/workload/", "label": "My work", "icon": "my"},
        {"href": "/workload/queue/", "label": "Queue", "icon": "queue", "badge": waiting},
        {"href": "/workload/history/", "label": "Task history", "icon": "reports"},
    ]


def _status_bar(state, me, now):
    away = W.current_away(state, me.id)
    ended = W.ended_today(state, me.id, now)
    return {
        "away": away and {"label": W.AWAY_LABEL[away.kind].lower(), "since": f"{local(away.start):%H:%M}", "mins": fmt_min((now - away.start).total_seconds() / 60)},
        "ended": ended and f"{local(ended.start):%H:%M}",
        "kinds": W.AWAY,
    }


def my_work(request):
    person, err = _person_or_403(request)
    if err:
        return err
    now = clock_now()
    c = svc.calendar_model()
    team = _team(request, person, c)
    if not team:
        return render(request, "core/planned.html", _shell(request, "workload", person, None, c, [], title="My work", text="You aren’t in a team that uses Workload yet."))

    if request.method == "POST":
        act = request.POST.get("action", "")
        kw = {}
        if act == "away":
            kw["kind"] = request.POST.get("kind", "")
        if act in ("complete", "hold", "resume"):
            kw["task_id"] = request.POST.get("task", "")
        if act == "complete":
            kw["values"] = {k[2:]: v for k, v in request.POST.items() if k.startswith("f_")}
        if act == "hold":
            kw["reason"] = request.POST.get("reason", "")
        if act == "startWork":
            kw["assist"] = request.POST.get("assist") == "1"
        try:
            out = svc.run_action(team, person, act, now, **kw)
        except svc.Forbidden as e:
            messages.error(request, str(e))
            return redirect("/workload/")
        if out.message:
            messages.success(request, out.message)
        if out.ask:
            request.session["ask"] = out.ask
        return redirect("/workload/")

    s = svc.load_state(team, now, c, viewer=person.id)
    me = s.person(person.id)
    ctx = _shell(request, "workload", person, team, c, _wl_nav(s), teams=[t for t in svc.teams_for(person, c) if hasattr(t, "workload")], mode_label="First in, first out" if s.settings.get("mode") == "fifo" else "")
    ctx["ask"] = request.session.pop("ask", None)
    if not me:
        ctx.update(sub="Admin view. Switch to employee (bottom of the menu) to see a member’s screen.", on_team=False,
                   idle={"title": "Team at a glance", "text": f"{sum(1 for t in s.tasks if t.status == 'new')} tasks waiting in the queue. Manage it, or see today’s numbers on the dashboard.", "manager": True})
        return render(request, "core/workload/my_work.html", ctx)

    trades = ", ".join(s.trade_path(t) for t in me.trades)
    cur = W.current_task(s, me.id)
    ctx.update(on_team=True, sub=f"You work on {trades} · shift {me.shift}." if me.trades else "", status=_status_bar(s, me, now))

    if cur:
        due_txt, due_col = W.due_text(cur, s, now)
        worked = W.task_work(s, cur, now)
        ctx["cur"] = {
            "t": cur,
            "pr": W.PR[cur.pr],
            "path": s.trade_path(cur.trade),
            "source": "Outlook" if cur.source == "outlook" else "Upload",
            "due_text": due_txt,
            "due_color": due_col,
            "worked_s": int(worked.total_seconds()),
            "paused": bool(W.current_away(s, me.id)),
            "started": f"{local(cur.started_at):%H:%M}",
            "missing": W.missing_required(s.fields, cur.fields or {}),
            "rows": [("System › Trade", s.trade_path(cur.trade)), ("SLA", f"{W.sla_of(cur, s.settings):g} h · standard request ({W.PR[cur.pr][0].lower()} priority)"), ("Started", fmt_t(cur.started_at))]
            + [(f["label"], cur.fields.get(f["key"]) or "—") for f in s.fields if (cur.fields or {}).get(f["key"])],
            "fields": [{**f, "value": (cur.fields or {}).get(f["key"], ""), "opts": [o.strip() for o in f.get("options", "").split(",") if o.strip()]} for f in s.fields],
            "email": cur.email,
            "received": fmt_t(cur.received),
        }
    else:
        unavailable = not W.can_work(me, s.settings)
        if s.busy_elsewhere:
            b = s.busy_elsewhere[0]
            idle = {"title": f"You’re working in {b['team']}", "text": f"{b['id']} is in progress there. Resolve it, pause it or set it to pending before you start a task here."}
        elif not me.trades and (svc.is_team_admin(person, team.id, c) or person.level in LEADER_LEVELS):
            # Admins and leaders without a trade manage the team rather than take tasks.
            waiting_n = sum(1 for t in s.tasks if t.status == "new")
            idle = {"title": "Team at a glance", "text": f"{waiting_n} task{'' if waiting_n == 1 else 's'} waiting in the queue. Manage it, or see today’s numbers on the dashboard.", "manager": True}
            ctx["sub"] = "Admin view. Switch to employee (bottom of the menu) to see a member’s screen." if settings.WFM_DEMO else "You manage this team. To take tasks yourself, add yourself to a trade in Admin › Members."
        elif not me.trades:
            idle = {"title": "No trades allocated", "text": "You aren’t allocated to a system and trade, so no tasks come to you. Ask an admin to allocate you (Admin › Members)."}
        elif unavailable:
            idle = {"title": "You’re marked unavailable", "text": "The Calendar shows you as " + {"leave": "on leave", "offshift": "off shift"}.get(me.avail, me.avail) + " now, so tasks aren’t given to you."}
        else:
            idle = {"title": "You’re free", "text": f"Click Start work to get the next task in {trades}. You get one task at a time, highest priority and oldest first."}
        idle["start"] = bool(me.trades) and not s.busy_elsewhere
        idle["disabled"] = unavailable or bool(ctx["status"]["away"]) or bool(ctx["status"]["ended"])
        ctx["idle"] = idle

    # Your day so far
    mine_done = [t for t in s.tasks if t.assignee_id == me.id and t.status == "done" and t.done_at and day_key(t.done_at) == day_key(now)]
    on_time = sum(1 for t in mine_done if t.done_at <= W.due(t, s))
    avg = dur(sum((t.done_at - t.started_at for t in mine_done if t.started_at), timedelta(0)) / len(mine_done)) if mine_done else "—"
    away_min = sum(((a.end or now) - a.start).total_seconds() / 60 for a in s.activities if a.person_id == me.id and a.kind != "end" and day_key(a.start) == day_key(now))
    target = sum((s.settings.get("targets") or {}).get(t, 0) for t in me.trades) or 0
    ctx["kpis"] = [] if not me.trades else [
        {"k": "Productivity", "v": f"{round(100 * len(mine_done) / target)}%" if target else "—", "m": f"{len(mine_done)} of {target} tasks today"},
        {"k": "On time", "v": f"{round(100 * on_time / len(mine_done))}%" if mine_done else "—", "m": f"{on_time} of {len(mine_done)} done in time"},
        {"k": "Average time", "v": avg, "m": "per task today"},
        {"k": "Time away", "v": fmt_min(away_min), "m": "logged today" if away_min else "nothing logged today"},
    ]
    mine = W.sort_tasks([t for t in s.tasks if t.assignee_id == me.id and t.status in ("assigned", "on_hold")], s)
    ctx["my_list"] = [_row(s, t, now) for t in mine]
    ctx["busy"] = bool(cur)
    return render(request, "core/workload/my_work.html", ctx)


def _row(s: W.WorkloadState, t, now) -> dict:
    d = W.due(t, s)
    od = t.status != "done" and now > d
    soon = not od and t.status != "done" and (d - now) < timedelta(hours=2)
    p = s.person(t.assignee_id)
    return {
        "t": t,
        "ticket": (t.fields or {}).get("ticket") or "—",
        "path": s.trade_path(t.trade),
        "pr": W.PR[t.pr],
        "st": W.ST[t.status],
        "source": "Outlook" if t.source == "outlook" else "Upload",
        "received": fmt_s(t.received, now),
        "age": "—" if t.status == "done" else dur(W.waiting(t, s, now)),
        "due": ("Done " + fmt_s(t.done_at, now)) if t.status == "done" else ("Overdue " + dur(W.overdue_by(t, s, now))) if od else fmt_s(d, now),
        "due_state": "overdue" if od else "soon" if soon else "",
        "due_color": "var(--color-accent-800)" if od else "var(--color-accent-700)" if soon else "var(--color-neutral-800)",
        "assignee": p.name if p else (m.Person.objects.filter(pk=t.assignee_id).values_list("name", flat=True).first() or "—"),
        "hold": t.hold,
    }


def queue(request):
    person, err = _person_or_403(request)
    if err:
        return err
    now = clock_now()
    c = svc.calendar_model()
    team = _team(request, person, c)
    if not team:
        return redirect("/workload/")
    s = svc.load_state(team, now, c, viewer=person.id)
    tab = request.GET.get("tab", "active")
    status = request.GET.get("status", "open")
    q = request.GET.get("q", "").strip().lower()
    sys_f = request.GET.get("sys", "all")
    tr_f = request.GET.get("tr", "all")

    def keep(t):
        if sys_f != "all" and (s.trade(t.trade).sys if s.trade(t.trade) else "") != sys_f:
            return False
        if tr_f != "all" and t.trade != tr_f:
            return False
        if q and q not in f"{t.title} {t.id} {(t.fields or {}).get('ticket', '')}".lower():
            return False
        return True

    active = [t for t in s.tasks if t.status != "done" and keep(t)]
    if tab == "done":
        today = day_key(now)
        rows = sorted([t for t in s.tasks if t.status == "done" and keep(t) and day_key(t.done_at) == today], key=lambda t: t.done_at, reverse=True)
    else:
        rows = [t for t in active if status == "open" or t.status == status]
        rows.sort(key=lambda t: (0 if t.status != "done" and now > W.due(t, s) else 1, W.due(t, s)))
    rws = [_row(s, t, now) for t in rows]
    overdue = sum(1 for t in active if W.is_overdue(t, s, now))
    ctx = _shell(request, "workload", person, team, c, _wl_nav(s), teams=[t for t in svc.teams_for(person, c) if hasattr(t, "workload")],
                 mode_label="First in, first out" if s.settings.get("mode") == "fifo" else "", rows=rws, tab=tab, status=status, q=request.GET.get("q", ""),
                 overdue=overdue, active_n=len(active), systems=s.systems.items(), trades=[t for t in s.trades if sys_f in ("all", t.sys)],
                 sys_f=sys_f, tr_f=tr_f, statuses=[("open", "All open"), ("new", "In queue"), ("assigned", "Assigned"), ("in_progress", "In progress"), ("on_hold", "Pending")],
                 queue_filters=True)
    return render(request, "core/workload/queue.html", ctx)


# ── Calendar ──

CAL_NAV = [
    {"href": "/calendar/", "label": "Calendar", "icon": "calendar"},
    {"href": "/calendar/bcp/", "label": "BCP", "icon": "bcp"},
    {"href": "/calendar/requests/", "label": "My requests", "icon": "requests"},
    {"href": "/calendar/notifications/", "label": "Notifications", "icon": "bell"},
]


def calendar_grid(request):
    person, err = _person_or_403(request)
    if err:
        return err
    now = clock_now()
    today = date.fromisoformat(day_key(now))
    try:
        y, mo = (int(x) for x in request.GET.get("m", f"{today.year}-{today.month}").split("-"))
        first = date(y, mo, 1)
    except ValueError:
        first = today.replace(day=1)
    last = first.replace(day=pycal.monthrange(first.year, first.month)[1])
    c = svc.calendar_model((first, last))
    teams = svc.teams_for(person, c)
    team_id = request.GET.get("team") or request.session.get("team") or (teams[0].id if teams else "")
    team = next((t for t in teams if t.id == team_id), teams[0] if teams else None)
    if team:
        request.session["team"] = team.id
    sys_f, tr_f = request.GET.get("sys", "all"), request.GET.get("tr", "all")
    scope = request.GET.get("scope", "all")
    cellmode = request.GET.get("cells", "status")
    q = request.GET.get("q", "").strip().lower()
    shifts = {s.id: s for s in m.Shift.objects.all()}

    days = [first + timedelta(days=i) for i in range(last.day)]
    # A team's grid lists its members; managers and directors appear in the Management view instead.
    members = [p for p in c.people.values() if team and p.level not in ("manager", "director") and c.O.in_node(p, team.id) and (not p.resign or p.resign >= first)]
    total = len(members)
    if sys_f != "all":
        members = [p for p in members if c.O.in_node(p, sys_f)]
    if tr_f != "all":
        members = [p for p in members if c.O.in_node(p, tr_f)]
    if scope == "me":
        members = [p for p in members if p.id == person.id]
    if q:
        members = [p for p in members if q in p.name.lower()]
    members.sort(key=lambda p: p.name)

    rows = []
    for p in members:
        here = [a for a in p.assign if team.id in c.O.anc(a)]
        sub = next((c.O.sub(a) for a in here if c.O.sub(a)), "")
        others = [c.O.up(a, "branch").name for a in p.assign if c.O.up(a, "branch") and c.O.up(a, "branch").id != team.id]
        line = " · ".join(x for x in [sub, ("Also in " + ", ".join(dict.fromkeys(others))) if others else ""] if x)
        if p.resign:
            line = f"Last day {p.resign.day} {pycal.month_abbr[p.resign.month]} {p.resign.year}"
        tcell = c.raw(p, today, team.id)
        sh = shifts.get(c.shift_for(p, today) or "") or shifts.get(p.shift or "")
        sh_name = f"{sh.name} {sh.start}–{sh.end}" if sh else "No shift set"
        if tcell.gone or tcell.code in ("RTO", "WFH", "HDY", "RDOT"):
            off, sh_title = "", (sh_name if tcell.gone else f"Today: {sh_name} · {CODES[tcell.code][0]}")
        else:
            off = tcell.code or "Off"
            sh_title = f"Today: {(CODES[tcell.code][0] + (' (pending)' if tcell.pending else '')) if tcell.code else 'Rest day'} · usual shift {sh_name}"
        cells = []
        for d in days:
            cell = c.raw(p, d, team.id)
            label, bg, fg, bd = cell_style(cell, cellmode == "shift", shifts)
            what = "No longer with the team" if cell.gone else (CODES[cell.code][0] + (" – pending approval" if cell.pending else "") + (f" – {cell.note}" if cell.note else "")) if cell.code else "Weekend"
            csh = shifts.get(cell.shift or "")
            title = f"{p.name} · {fmt_day(d)} · {what}" + (f" · {csh.name} {csh.start}–{csh.end}" if csh and cell.code in ("RTO", "WFH", "HDY", "RDOT") else "")
            cells.append({"label": label, "bg": bg, "fg": fg, "bd": bd, "title": title, "wk": cell.wk, "gone": cell.gone, "today": d == today})
        rows.append({
            "p": p, "line": line, "level": LEVEL_LABEL[p.level] if p.level != "member" else "", "lv": p.level,
            "shift": f"{sh.start} - {sh.end}" if sh else "—", "shift_off": off, "shift_title": sh_title,
            "cells": cells,
        })

    prev_m = (first - timedelta(days=1)).replace(day=1)
    next_m = last + timedelta(days=1)
    tower = c.O.up(team.id, "tower") if team else None
    ctx = _shell(request, "calendar", person, team, c, [dict(n) for n in CAL_NAV], teams=teams, tower=tower,
                 systems=c.O.kids(team.id, "system") if team else [], trades=[t for sy in c.O.kids(team.id, "system") for t in c.O.kids(sy.id, "trade") if sys_f in ("all", sy.id)] if team else [],
                 sys_f=sys_f, tr_f=tr_f, scope=scope, cellmode=cellmode, q=request.GET.get("q", ""),
                 month_title=f"{pycal.month_name[first.month]} {first.year}", m_prev=f"{prev_m.year}-{prev_m.month}", m_next=f"{next_m.year}-{next_m.month}",
                 m_cur=f"{first.year}-{first.month}", m_today=f"{today.year}-{today.month}",
                 days=[{"dow": fmt_day(d).split()[0], "n": d.day, "wk": d.weekday() >= 5, "today": d == today, "title": fmt_day(d)} for d in days],
                 rows=rows, total=total, legend=[(k, v[0], v[1], v[2], v[3]) for k, v in CODES.items()])
    return render(request, "core/calendar/grid.html", ctx)


# ── Screens planned for the next phases ──

PLANNED = {
    "/workload/history/": ("workload", "Task history", "Completed tasks by day, week or month, filtered by person, trade and timeliness, with a CSV and Excel download."),
    "/calendar/bcp/": ("calendar", "BCP", "Business-continuity events, check-ins, FTE by tower and team, and readiness."),
    "/calendar/requests/": ("calendar", "My requests", "Your leave balances and requests, with each team’s approval."),
    "/calendar/notifications/": ("calendar", "Notifications", "Emails and Outlook reminders the app sent."),
    "/admin-area/": ("admin", "Admin", "Approvals, members, team settings, shifts, organization, holidays, headcount, reports, and the Workload admin pages (intake, task fields, allocation, targets, SLA)."),
}


def planned(request):
    person, err = _person_or_403(request)
    if err:
        return err
    c = svc.calendar_model()
    module, title, text = PLANNED[request.path]
    team = m.OrgNode.objects.filter(pk=request.session.get("team")).first()
    nav = [dict(n) for n in CAL_NAV] if module == "calendar" else _wl_nav(svc.load_state(team, clock_now(), c)) if team and module == "workload" else []
    return render(request, "core/planned.html", _shell(request, module if module != "admin" else "admin", person, team, c, nav, title=title, text=text))
