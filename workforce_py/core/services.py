"""
Glue between the database and the rules.

- calendar_model(): the Calendar read model (core.rules.calendar.Cal) from the tables.
- people_for_team(): Workload's people come from the Calendar: the team's members, the trades
  their allocations cover, and whether they can take work now (not on leave, a rest day or
  holiday, and inside their shift). Port of workforce/src/lib/workload/people.ts.
- run_action(): one Workload action in a database transaction. The acting person's row is
  locked first (SELECT ... FOR UPDATE on SQL Server / MySQL), so two clicks can never give one
  person two tasks in progress, or one task to two people.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Q

from . import models as m
from .rules import workload as W
from .rules.calendar import Cal, Hol, Node, Org, P, Req
from .rules.clock import day_key, local_hour

OUT = ["VL", "SL", "EL", "BT", "HOL", "RD"]
DONE_DAYS = 35


class Forbidden(Exception):
    pass


def calendar_model(months: tuple[date, date] | None = None) -> Cal:
    nodes = [Node(n.id, n.type, n.name, n.parent_id) for n in m.OrgNode.objects.all()]
    alloc: dict[int, list[str]] = {}
    for a in m.Allocation.objects.order_by("sort"):
        alloc.setdefault(a.person_id, []).append(a.node_id)
    people = [
        P(p.id, p.name, p.level, alloc.get(p.id, []), p.pattern, p.shift_id, p.resign, p.wfh_days)
        for p in m.Person.objects.all()
    ]
    rq = m.LeaveRequest.objects.all()
    ov = m.DayOverride.objects.all()
    ro = m.RosterEntry.objects.all()
    if months:
        a, b = months
        rq = rq.filter(start__lte=b, end__gte=a)
        ov = ov.filter(date__range=(a, b))
        ro = ro.filter(date__range=(a, b))
    reqs = [Req(q.id, q.person_id, q.type, q.start, q.end, q.approvals) for q in rq]
    hols = [Hol(h.date, h.name, h.scope) for h in m.Holiday.objects.all()]
    overrides = {(o.person_id, o.date): o.code for o in ov}
    roster = {(r.person_id, r.date): r.shift_id for r in ro}
    return Cal(Org(nodes), people, reqs, hols, overrides, roster)


def units_of(c: Cal, team_id: str) -> list[W.Trade]:
    """Where tasks can go: the team's trades; a system with no trades is one unit; a bare team is one unit."""
    units: list[W.Trade] = []
    for sy in c.O.kids(team_id, "system"):
        trs = c.O.kids(sy.id, "trade")
        units += [W.Trade(t.id, t.name, sy.id) for t in trs] if trs else [W.Trade(sy.id, sy.name, "")]
    units += [W.Trade(t.id, t.name, "") for t in c.O.kids(team_id, "trade")]
    if not units and team_id in c.O.by:
        units.append(W.Trade(team_id, c.O.by[team_id].name, ""))
    return units


def people_for_team(c: Cal, team_id: str, now: datetime) -> list[W.WPerson]:
    today = date.fromisoformat(day_key(now))
    hour = local_hour(now)
    shifts = {s.id: s for s in m.Shift.objects.all()}
    units = units_of(c, team_id)
    out = []
    for p in sorted(c.people.values(), key=lambda x: x.name):
        if not c.O.in_node(p, team_id) or not c.alive(p, today):
            continue
        mine = [a for a in p.assign if team_id in c.O.anc(a)]
        trades = [u.id for u in units if any(a == u.id or (a != team_id and a in c.O.anc(u.id)) for a in mine)]
        cell = c.raw(p, today, team_id)
        sh = shifts.get(c.shift_for(p, today) or "")
        start = int(sh.start[:2]) + int(sh.start[3:5]) / 60 if sh else 8
        in_shift = (hour - start + 24) % 24 < 9
        avail = "available"
        if cell.code in OUT and not cell.pending:
            avail = "leave"
        elif not cell.code or not in_shift:
            avail = "offshift"
        rest = cell.code in ("RDOT", "RD") or (cell.wk and not cell.code)
        if rest and cell.code != "RDOT":
            avail = "offshift"
        on_today = rest or (avail != "leave" and bool(cell.code))
        out.append(W.WPerson(p.id, p.name, trades, avail, f"{sh.name} {sh.start}–{sh.end}" if sh else "—", int(start), on_today))
    return out


def teams_for(person: m.Person, c: Cal) -> list[m.OrgNode]:
    """Teams this person can open: their own, the ones they administer, and those under a tower/department they're allocated to."""
    allt = list(m.OrgNode.objects.filter(type=m.OrgNode.TEAM))
    if person.sys_admin:
        return allt
    p = c.people.get(person.id)
    admin_of = set(person.admin_of.values_list("id", flat=True))
    mine = p.assign if p else []
    return [t for t in allt if (p and c.O.in_node(p, t.id)) or any(a in admin_of or a in mine for a in c.O.anc(t.id))]


def is_team_admin(person: m.Person, team_id: str, c: Cal) -> bool:
    if person.sys_admin:
        return True
    admin_of = set(person.admin_of.values_list("id", flat=True))
    return any(a in admin_of for a in c.O.anc(team_id))


def load_state(team: m.OrgNode, now: datetime, c: Cal | None = None, viewer: int | None = None, lock: bool = False) -> W.WorkloadState:
    c = c or calendar_model()
    wl, _ = m.TeamWorkload.objects.get_or_create(team=team, defaults={"settings": default_settings(), "fields": []})
    # Open tasks plus the last DONE_DAYS days of finished ones (older ones are fetched per page).
    tq = m.Task.objects.filter(Q(team=team) & (~Q(status="done") | Q(done_at__gte=now - timedelta(days=DONE_DAYS))))
    if lock:
        tq = tq.select_for_update()
    tasks = list(tq.order_by("received"))
    acts = list(m.Activity.objects.filter(team=team, start__gte=now - timedelta(days=2)))
    busy = []
    if viewer is not None:
        busy = [{"id": t.id, "team": t.team.name} for t in m.Task.objects.filter(assignee_id=viewer, status="in_progress").exclude(team=team).select_related("team")]
    return W.WorkloadState(
        team_id=team.id,
        team_name=team.name,
        settings=wl.settings,
        fields=wl.fields,
        tasks=tasks,
        people=people_for_team(c, team.id, now),
        systems={n.id: n.name for n in c.O.kids(team.id, "system")},
        trades=units_of(c, team.id),
        holidays={h.date.isoformat() for h in m.Holiday.objects.all() if h.scope == "all" or h.scope in c.O.anc(team.id)},
        activities=acts,
        busy_elsewhere=busy,
    )


def default_settings() -> dict:
    return {
        "mode": "fifo",
        "order": "priority",
        "skipUnavail": True,
        "sla": {"high": 4, "normal": 24, "low": 72},
        "work": {"shift": 9, "b1": 60, "b2": 30, "prod": 6.8},
        "targets": {},
    }


def run_action(team: m.OrgNode, person: m.Person, action: str, now: datetime, **kw) -> W.Outcome:
    """Apply one action as `person` and save what changed, all or nothing."""
    with transaction.atomic():
        # Serialize this person's actions: one task in progress, whatever else is clicked.
        m.Person.objects.select_for_update().get(pk=person.pk)
        s = load_state(team, now, viewer=person.id, lock=True)
        if not any(p.id == person.id for p in s.people):
            raise Forbidden("You aren’t a member of this team.")

        def make_activity(kind: str, start: datetime):
            return m.Activity(person_id=person.id, team=team, kind=kind, start=start)

        if action == "startWork":
            out = W.start_work(s, person.id, now, assist=kw.get("assist", False))
        elif action == "complete":
            out = W.complete(s, kw["task_id"], person.id, now, kw.get("values", {}))
        elif action == "hold":
            out = W.hold(s, kw["task_id"], person.id, now, kw.get("reason", ""))
        elif action == "resume":
            out = W.resume(s, kw["task_id"], person.id, now)
        elif action == "away":
            out = W.away(s, person.id, kw["kind"], now, make_activity)
        elif action == "back":
            out = W.back(s, person.id, now)
        elif action == "endWork":
            out = W.end_work(s, person.id, now, make_activity)
        else:
            raise Forbidden("Unknown action.")

        for t in {id(t): t for t in out.changed_tasks}.values():
            t.version += 1
            t.save()
        for t, at, text in out.events:
            m.TaskEvent.objects.create(task=t, at=at, text=text)
        for a in out.new_activities:
            a.save()
        for a in out.changed_activities:
            a.save()
        return out
