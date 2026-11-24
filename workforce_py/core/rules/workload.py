"""
Workload rules (port of workforce/src/lib/workload/engine.ts).

Plain functions over a WorkloadState. They change the task / activity objects they are given
and return an Outcome listing what changed; core/services.py loads the state inside a database
transaction, runs one rule and saves only the changed rows. The same functions are unit-tested
without a database (core/tests/test_rules.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from .clock import add_hours, day_key, fmt_t, local, span, weekend

PRIORITY_WEIGHT = {"high": 0, "normal": 1, "low": 2}
PR = {"high": ("High", "tag-accent"), "normal": ("Normal", "tag-outline"), "low": ("Low", "tag-neutral")}
ST = {
    "new": ("In queue", "tag-outline"),
    "assigned": ("Assigned", "tag-accent"),
    "in_progress": ("In progress", "tag-accent"),
    "on_hold": ("Pending", "tag-neutral"),
    "done": ("Done", "tag-neutral"),
}
AWAY = [("break", "Break"), ("lunch", "Lunch"), ("meeting", "Meeting"), ("adhoc", "Ad hoc"), ("training", "Training")]
AWAY_LABEL = dict(AWAY)


@dataclass
class WPerson:
    """A team member as Workload sees them (derived from the Calendar each request)."""

    id: int
    name: str
    trades: list[str]
    avail: str = "available"  # available | leave | offshift
    shift: str = "—"
    shift_start: int = 8
    on_today: bool = True


@dataclass
class Trade:
    id: str
    name: str
    sys: str


@dataclass
class WorkloadState:
    team_id: str
    team_name: str
    settings: dict
    fields: list[dict]
    tasks: list[Any]  # core.models.Task (saved or not)
    people: list[WPerson]
    systems: dict[str, str]  # id → name
    trades: list[Trade]
    holidays: set[str] = field(default_factory=set)
    activities: list[Any] = field(default_factory=list)  # core.models.Activity
    # Tasks the person has in progress in other teams (one task at a time across teams).
    busy_elsewhere: list[dict] = field(default_factory=list)

    def person(self, pid: int | None) -> WPerson | None:
        return next((p for p in self.people if p.id == pid), None)

    def trade(self, tid: str) -> Trade | None:
        return next((t for t in self.trades if t.id == tid), None)

    def trade_path(self, tid: str) -> str:
        t = self.trade(tid)
        if not t:
            return "Needs trade" if not tid else tid
        return f"{self.systems[t.sys]} › {t.name}" if t.sys in self.systems else t.name


@dataclass
class Outcome:
    changed_tasks: list[Any] = field(default_factory=list)
    new_activities: list[Any] = field(default_factory=list)
    changed_activities: list[Any] = field(default_factory=list)
    events: list[tuple[Any, datetime, str]] = field(default_factory=list)  # (task, at, text)
    message: str = ""
    ask: dict | None = None  # Start work found nothing in the member's trades: offer to help elsewhere


# ── SLA ──


def off_time(s: WorkloadState):
    """Whether a moment falls on a day that doesn't count toward the SLA."""
    wk = s.settings.get("slaWeekends") is not True
    hol = s.holidays if s.settings.get("slaHolidays") is not True else set()

    def f(dt: datetime) -> bool:
        return (wk and weekend(dt)) or (bool(hol) and day_key(dt) in hol)

    return f


def sla_hours_for(task, settings: dict) -> float:
    for t in settings.get("taskTypes", []) or []:
        if task.ttype and t.get("id") == task.ttype and t.get("sla"):
            return t["sla"]
    return settings.get("sla", {}).get(task.pr) or 24


def sla_of(task, settings: dict) -> float:
    """Fixed on the task when it came in; from the settings for older tasks."""
    return task.sla_h if task.sla_h is not None else sla_hours_for(task, settings)


def due(task, s: WorkloadState) -> datetime:
    return add_hours(task.received, sla_of(task, s.settings), off_time(s))


def overdue_by(task, s: WorkloadState, now: datetime) -> timedelta:
    return span(due(task, s), task.done_at or now, off_time(s))


def is_overdue(task, s: WorkloadState, now: datetime) -> bool:
    return task.status != "done" and now > due(task, s)


def waiting(task, s: WorkloadState, now: datetime) -> timedelta:
    return span(task.received, now, off_time(s))


def sort_tasks(tasks: list, s: WorkloadState) -> list:
    if s.settings.get("order") == "priority":
        return sorted(tasks, key=lambda t: (PRIORITY_WEIGHT[t.pr], due(t, s), t.received))
    return sorted(tasks, key=lambda t: t.received)


# ── who can work ──


def can_work(p: WPerson, settings: dict) -> bool:
    """With "skip people who are unavailable", people off shift are skipped unless scheduled today (overtime)."""
    return not settings.get("skipUnavail") or p.avail == "available" or (p.avail == "offshift" and p.on_today)


def current_task(s: WorkloadState, pid: int):
    return next((t for t in s.tasks if t.assignee_id == pid and t.status == "in_progress"), None)


def current_away(s: WorkloadState, pid: int):
    return next((a for a in s.activities if a.person_id == pid and a.kind != "end" and a.end is None), None)


def ended_today(s: WorkloadState, pid: int, now: datetime):
    return next((a for a in s.activities if a.person_id == pid and a.kind == "end" and day_key(a.start) == day_key(now)), None)


def not_working(s: WorkloadState, pid: int, now: datetime) -> str:
    away = current_away(s, pid)
    if away:
        return f"You’re on {AWAY_LABEL[away.kind].lower()}. Click Back to work first."
    if ended_today(s, pid, now):
        return "You’ve ended work for today. Undo End work to continue."
    return ""


def own_queue(s: WorkloadState, me: WPerson) -> list:
    """Waiting tasks in the member's own trades, next first."""
    return sort_tasks([t for t in s.tasks if t.status == "new" and t.trade in me.trades], s)


def help_queue(s: WorkloadState, me: WPerson) -> list[tuple[Any, bool]]:
    """Other trades: same system first, then the rest of the team. Tasks needing a trade are left for an admin."""
    sys_of = lambda tid: (s.trade(tid).sys if s.trade(tid) else "")  # noqa: E731
    my_sys = {sys_of(t) for t in me.trades if sys_of(t)}
    rest = sort_tasks([t for t in s.tasks if t.status == "new" and t.trade and t.trade not in me.trades], s)
    tagged = [(t, sys_of(t.trade) in my_sys) for t in rest]
    return [x for x in tagged if x[1]] + [x for x in tagged if not x[1]]


def _begin(task, p: WPerson, now: datetime, out: Outcome, note: str = ""):
    task.status = "in_progress"
    task.assignee_id = p.id
    task.started_at = now
    out.changed_tasks.append(task)
    out.events.append((task, now, f"Started by {p.name}{note}"))


# ── actions ──


def start_work(s: WorkloadState, pid: int, now: datetime, assist: bool = False) -> Outcome:
    """
    The member's next assigned task, or in first-in-first-out mode the next waiting task in their
    own trades (highest priority, then earliest due). When their trades are empty it offers work
    elsewhere and takes it only once they agree. One task in progress at a time, across teams.
    """
    out = Outcome()
    me = s.person(pid)
    if not me or current_task(s, pid):
        return out
    if s.busy_elsewhere:
        b = s.busy_elsewhere[0]
        out.message = f"You already have {b['id']} in progress in {b['team']}. Resolve it, pause it or set it to pending there first."
        return out
    stop = not_working(s, pid, now)
    if stop:
        out.message = stop
        return out
    if not can_work(me, s.settings):
        out.message = "You’re marked unavailable, so tasks aren’t given to you."
        return out
    assigned = sort_tasks([t for t in s.tasks if t.assignee_id == pid and t.status == "assigned"], s)
    if assigned:
        _begin(assigned[0], me, now, out)
        out.message = f"Started {assigned[0].id}."
        return out
    own = own_queue(s, me) if s.settings.get("mode") == "fifo" else []
    if own:
        _begin(own[0], me, now, out)
        out.message = f"Started {own[0].id}."
        return out
    if s.settings.get("mode") != "fifo" or not me.trades:
        out.message = "Done. No more tasks waiting in your trades right now."
        return out
    helpq = help_queue(s, me)
    if not helpq:
        out.message = "Done. Nothing is waiting in the team right now."
        return out
    if not assist:
        out.ask = {"system": sum(1 for _, same in helpq if same), "team": sum(1 for _, same in helpq if not same)}
        return out
    t, _ = helpq[0]
    note = f" (helping {s.trade(t.trade).name})"
    _begin(t, me, now, out, note)
    out.message = f"Started {t.id}{note}."
    return out


def missing_required(fields: list[dict], values: dict) -> list[str]:
    return [f["label"] for f in fields if f.get("required") and str(values.get(f["key"], "")).strip() == ""]


def complete(s: WorkloadState, task_id: str, pid: int, now: datetime, values: dict) -> Outcome:
    """Resolve the member's task in progress, saving the field values they entered."""
    out = Outcome()
    t = next((x for x in s.tasks if x.id == task_id), None)
    if not t or t.assignee_id != pid or t.status != "in_progress":
        return out
    merged = {**(t.fields or {}), **{k: v for k, v in values.items() if k in {f["key"] for f in s.fields}}}
    missing = missing_required(s.fields, merged)
    if missing:
        out.message = "Fill in " + ", ".join(missing) + " before resolving."
        return out
    t.fields = merged
    t.status = "done"
    t.done_at = now
    out.changed_tasks.append(t)
    out.events.append((t, now, "Done"))
    out.message = f"{t.id} resolved."
    return out


def hold(s: WorkloadState, task_id: str, pid: int, now: datetime, reason: str) -> Outcome:
    """Pending: the task stops counting time and goes on the member's list with a reason."""
    out = Outcome()
    t = next((x for x in s.tasks if x.id == task_id), None)
    if not t or t.assignee_id != pid or t.status != "in_progress":
        return out
    t.status = "on_hold"
    t.hold = reason.strip()
    out.changed_tasks.append(t)
    out.events.append((t, now, "On hold" + (f": {t.hold}" if t.hold else "")))
    out.message = f"{t.id} is pending."
    return out


def resume(s: WorkloadState, task_id: str, pid: int, now: datetime) -> Outcome:
    out = Outcome()
    t = next((x for x in s.tasks if x.id == task_id), None)
    if not t or t.assignee_id != pid or t.status != "on_hold":
        return out
    if current_task(s, pid):
        out.message = "Resolve or set your current task to pending first."
        return out
    stop = not_working(s, pid, now)
    if stop:
        out.message = stop
        return out
    t.status = "in_progress"
    t.hold = ""
    out.changed_tasks.append(t)
    out.events.append((t, now, "Resumed"))
    out.message = f"{t.id} resumed."
    return out


def away(s: WorkloadState, pid: int, kind: str, now: datetime, make_activity) -> Outcome:
    """Break, lunch, meeting, ad hoc or training: time away isn't counted on the open task."""
    out = Outcome()
    if kind not in AWAY_LABEL or current_away(s, pid) or ended_today(s, pid, now):
        return out
    out.new_activities.append(make_activity(kind=kind, start=now))
    out.message = f"On {AWAY_LABEL[kind].lower()}. Click Back to work when you’re back."
    return out


def back(s: WorkloadState, pid: int, now: datetime) -> Outcome:
    out = Outcome()
    a = current_away(s, pid)
    if not a:
        return out
    a.end = now
    out.changed_activities.append(a)
    out.message = "Welcome back."
    return out


def end_work(s: WorkloadState, pid: int, now: datetime, make_activity) -> Outcome:
    out = Outcome()
    if current_task(s, pid):
        out.message = "Resolve your ticket or set it to pending first."
        return out
    if ended_today(s, pid, now):
        return out
    out.new_activities.append(make_activity(kind="end", start=now))
    out.message = f"Work ended at {local(now):%H:%M}."
    return out


# ── time worked (time away excluded) ──


def task_work(s: WorkloadState, task, now: datetime) -> timedelta:
    if not task.started_at:
        return timedelta(0)
    end = task.done_at or now
    total = end - task.started_at
    for a in s.activities:
        if a.person_id != task.assignee_id or a.kind == "end":
            continue
        a_end = a.end or now
        lo, hi = max(a.start, task.started_at), min(a_end, end)
        if hi > lo:
            total -= hi - lo
    return max(total, timedelta(0))


def due_text(task, s: WorkloadState, now: datetime) -> tuple[str, str]:
    """Long form for the current-task card: ("Due Thu 24 Sep, 14:00", colour)."""
    if is_overdue(task, s, now):
        from .clock import dur

        return "Overdue by " + dur(overdue_by(task, s, now)), "var(--color-accent-800)"
    return "Due " + fmt_t(due(task, s)), "var(--color-neutral-800)"
