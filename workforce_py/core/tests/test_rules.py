"""
Rule tests (no database): the Python port must behave like the TypeScript engine.
Run: python manage.py test
"""
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest import TestCase

from core.rules import workload as W
from core.rules.calendar import Cal, Hol, Node, Org, P, Req, cell_style
from core.rules.clock import TZ, add_hours, dur, span

THU = datetime(2026, 9, 24, 10, 30, tzinfo=TZ)  # the sample clock: Thu 24 Sep 2026 10:30 Manila


def task(id, trade="eu", pr="normal", hours_ago=1, status="new", assignee=None, fields=None):
    return SimpleNamespace(
        id=id, title=id, trade=trade, pr=pr, received=THU - timedelta(hours=hours_ago), status=status,
        assignee_id=assignee, started_at=None, done_at=None, hold="", sla_h=None, ttype="", fields=fields or {}, source="upload", version=0,
    )


def act(pid, kind, start, end=None):
    return SimpleNamespace(person_id=pid, kind=kind, start=start, end=end)


def state(tasks, people=None, **settings):
    s = {"mode": "fifo", "order": "priority", "skipUnavail": True, "sla": {"high": 4, "normal": 24, "low": 72}, **settings}
    return W.WorkloadState(
        team_id="rm", team_name="Rate Desk", settings=s,
        fields=[{"key": "ticket", "label": "Ticket no.", "required": True}],
        tasks=tasks,
        people=people or [W.WPerson(1, "Ana", ["eu"]), W.WPerson(2, "Ben", ["us"])],
        systems={"gpm": "RateHub", "rcm": "TariffPro"},
        trades=[W.Trade("eu", "Europe", "gpm"), W.Trade("fe", "Far East", "gpm"), W.Trade("us", "Americas", "rcm")],
    )


class ClockTests(TestCase):
    def test_add_hours_skips_weekends(self):
        fri_16 = datetime(2026, 9, 25, 16, 0, tzinfo=TZ)
        # 24 h from Friday 16:00, weekend not counted → Tuesday 16:00... minus nothing: Sat+Sun skipped.
        self.assertEqual(add_hours(fri_16, 24, True), datetime(2026, 9, 28, 16, 0, tzinfo=TZ))
        self.assertEqual(add_hours(fri_16, 24, False), datetime(2026, 9, 26, 16, 0, tzinfo=TZ))

    def test_span_skips_weekends(self):
        fri_16 = datetime(2026, 9, 25, 16, 0, tzinfo=TZ)
        mon_10 = datetime(2026, 9, 28, 10, 0, tzinfo=TZ)
        self.assertEqual(span(fri_16, mon_10, True), timedelta(hours=18))
        self.assertEqual(span(mon_10, fri_16, True), timedelta(0))

    def test_dur(self):
        self.assertEqual(dur(timedelta(hours=25, minutes=47)), "1d 1h 47m")
        self.assertEqual(dur(timedelta(minutes=45)), "45m")


class WorkloadTests(TestCase):
    def test_sla_and_overdue(self):
        t = task("T-1", pr="high", hours_ago=5)
        s = state([t])
        self.assertEqual(W.due(t, s), THU - timedelta(hours=1))
        self.assertTrue(W.is_overdue(t, s, THU))
        self.assertEqual(W.overdue_by(t, s, THU), timedelta(hours=1))

    def test_task_type_sla_wins(self):
        t = task("T-1", pr="normal")
        t.ttype = "rush"
        s = state([t], taskTypes=[{"id": "rush", "sla": 2}])
        self.assertEqual(W.sla_of(t, s.settings), 2)

    def test_queue_order_priority_then_due(self):
        a, b, c = task("A", pr="normal", hours_ago=10), task("B", pr="high", hours_ago=1), task("C", pr="normal", hours_ago=20)
        self.assertEqual([x.id for x in W.sort_tasks([a, b, c], state([]))], ["B", "C", "A"])
        self.assertEqual([x.id for x in W.sort_tasks([a, b, c], state([], order="fifo"))], ["C", "A", "B"])

    def test_start_work_takes_next_in_own_trade(self):
        own_old, own_high, other = task("A", hours_ago=10), task("B", pr="high"), task("C", trade="us", pr="high")
        s = state([own_old, own_high, other])
        out = W.start_work(s, 1, THU)
        self.assertEqual(out.message, "Started B.")
        self.assertEqual((own_high.status, own_high.assignee_id), ("in_progress", 1))
        self.assertEqual(other.status, "new")

    def test_one_task_at_a_time(self):
        s = state([task("A"), task("B")])
        W.start_work(s, 1, THU)
        out = W.start_work(s, 1, THU)
        self.assertEqual(out.changed_tasks, [])
        self.assertEqual(sum(t.status == "in_progress" for t in s.tasks), 1)

    def test_busy_in_another_team_blocks(self):
        s = state([task("A")])
        s.busy_elsewhere = [{"id": "CS-1", "team": "Customer Care"}]
        out = W.start_work(s, 1, THU)
        self.assertIn("in progress in Customer Care", out.message)
        self.assertEqual(s.tasks[0].status, "new")

    def test_assigned_tasks_come_first(self):
        mine = task("M", trade="us", status="assigned", assignee=1)
        s = state([task("A", pr="high"), mine])
        W.start_work(s, 1, THU)
        self.assertEqual(mine.status, "in_progress")

    def test_away_blocks_start_and_back_resumes(self):
        s = state([task("A")])
        a = act(1, "break", THU - timedelta(minutes=5))
        s.activities.append(a)
        self.assertIn("Back to work", W.start_work(s, 1, THU).message)
        W.back(s, 1, THU)
        self.assertEqual(a.end, THU)
        self.assertEqual(W.start_work(s, 1, THU).message, "Started A.")

    def test_unavailable_gets_no_task(self):
        s = state([task("A")], people=[W.WPerson(1, "Ana", ["eu"], avail="leave", on_today=False)])
        self.assertIn("unavailable", W.start_work(s, 1, THU).message)

    def test_offer_help_when_own_trades_empty(self):
        same_sys, other_sys = task("F", trade="fe"), task("U", trade="us")
        s = state([same_sys, other_sys])
        out = W.start_work(s, 1, THU)
        self.assertEqual(out.ask, {"system": 1, "team": 1})
        out = W.start_work(s, 1, THU, assist=True)
        self.assertEqual(out.message, "Started F (helping Far East).")

    def test_resolve_needs_required_fields(self):
        t = task("A")
        s = state([t])
        W.start_work(s, 1, THU)
        self.assertIn("Ticket no.", W.complete(s, "A", 1, THU, {}).message)
        self.assertEqual(t.status, "in_progress")
        W.complete(s, "A", 1, THU + timedelta(minutes=30), {"ticket": "RM-1"})
        self.assertEqual((t.status, t.fields["ticket"]), ("done", "RM-1"))

    def test_time_away_not_counted_on_task(self):
        t = task("A")
        s = state([t])
        W.start_work(s, 1, THU)
        s.activities.append(act(1, "lunch", THU + timedelta(minutes=10), THU + timedelta(minutes=40)))
        self.assertEqual(W.task_work(s, t, THU + timedelta(hours=1)), timedelta(minutes=30))

    def test_pending_and_resume(self):
        t = task("A")
        s = state([t])
        W.start_work(s, 1, THU)
        W.hold(s, "A", 1, THU, "Waiting for carrier")
        self.assertEqual((t.status, t.hold), ("on_hold", "Waiting for carrier"))
        W.resume(s, "A", 1, THU)
        self.assertEqual(t.status, "in_progress")


class CalendarTests(TestCase):
    def setUp(self):
        org = Org([Node("rm", "branch", "Rate Desk", None), Node("gpm", "system", "RateHub", "rm"), Node("eu", "trade", "Europe", "gpm")])
        self.ana = P(0, "Ana", "member", ["eu"], pattern="A", shift="D")
        self.bob = P(1, "Bob", "member", ["eu"], pattern="B", shift="D", resign=date(2026, 9, 18))
        reqs = [Req("LR1", 0, "VL", date(2026, 9, 28), date(2026, 9, 30), {"rm": "pending"})]
        hols = [Hol(date(2026, 8, 31), "National Heroes Day", "all")]
        overrides = {(0, date(2026, 9, 24)): "WFH", (0, date(2026, 8, 31)): "RTO"}
        self.c = Cal(org, [self.ana, self.bob], reqs, hols, overrides, {})

    def test_weekly_pattern(self):
        self.assertEqual(self.c.raw(self.ana, date(2026, 9, 21), "rm").code, "WFH")  # Mon, pattern A
        self.assertEqual(self.c.raw(self.ana, date(2026, 9, 23), "rm").code, "RTO")  # Wed
        self.assertEqual(self.c.raw(self.bob, date(2026, 9, 17), "rm").code, "WFH")  # Thu, pattern B

    def test_weekend_override_leave_holiday_resigned(self):
        self.assertEqual(self.c.raw(self.ana, date(2026, 9, 26), "rm").code, "")  # Saturday
        self.assertEqual(self.c.raw(self.ana, date(2026, 9, 24), "rm").code, "WFH")  # admin override
        leave = self.c.raw(self.ana, date(2026, 9, 29), "rm")
        self.assertEqual((leave.code, leave.pending), ("VL", True))
        self.assertEqual(self.c.raw(self.ana, date(2026, 8, 31), "rm").code, "HDY")  # working on a holiday
        self.assertEqual(self.c.raw(self.bob, date(2026, 8, 31), "rm").code, "HOL")
        self.assertTrue(self.c.raw(self.bob, date(2026, 9, 21), "rm").gone)

    def test_pending_cells_are_amber(self):
        cell = self.c.raw(self.ana, date(2026, 9, 29), "rm")
        self.assertEqual(cell_style(cell, False, {})[1], "#fff4dc")
