"""
App tests with a database (Django creates a throw-away test database): pages render with the
sample data, actions save, and two clicks can't give one person two tasks.
"""
from django.core.management import call_command
from django.test import TestCase, override_settings

from core import models as m
from core import services as svc
from core.rules.clock import now


@override_settings(WFM_DEMO=True)
class SampleAppTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("load_sample", verbosity=0)

    def test_pages_render(self):
        for url in ["/workload/", "/workload/queue/", "/workload/queue/?tab=done", "/calendar/", "/calendar/?cells=shift", "/calendar/?m=2026-10", "/calendar/bcp/"]:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_calendar_lists_team_members(self):
        html = self.client.get("/calendar/").content.decode()
        self.assertIn("Name · 29", html)
        self.assertIn("Ana Reyes", html)

    def test_start_work_and_resolve_saves(self):
        r = self.client.post("/workload/", {"action": "startWork"}, follow=True)
        self.assertContains(r, "Started T-1043.")
        t = m.Task.objects.get(pk="T-1043")
        self.assertEqual((t.status, t.assignee_id), ("in_progress", 0))
        self.client.post("/workload/", {"action": "complete", "task": "T-1043", "f_ticket": "RM-21444", "f_carrier": "FJRD", "f_contracts": "3"})
        t.refresh_from_db()
        self.assertEqual(t.status, "done")
        self.assertTrue(m.TaskEvent.objects.filter(task=t, text="Done").exists())

    def test_never_two_tasks_in_progress(self):
        team, ana = m.OrgNode.objects.get(pk="rm"), m.Person.objects.get(pk=0)
        svc.run_action(team, ana, "startWork", now())
        svc.run_action(team, ana, "startWork", now())
        self.assertEqual(m.Task.objects.filter(assignee=ana, status="in_progress").count(), 1)

    def test_break_then_back(self):
        self.client.post("/workload/", {"action": "away", "kind": "break"})
        self.assertContains(self.client.get("/workload/"), "Back to work")
        self.client.post("/workload/", {"action": "back"})
        self.assertEqual(m.Activity.objects.filter(person_id=0, end__isnull=True).count(), 0)

    def test_view_as_switches_person(self):
        self.client.post("/view-as/", {"v": "admin", "next": "/workload/"})
        self.assertContains(self.client.get("/workload/"), "Team at a glance")


class SignInTests(TestCase):
    def test_pages_need_sign_in(self):
        r = self.client.get("/workload/")
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r["Location"].startswith("/login/"))

    def test_sign_in_with_work_email(self):
        call_command("load_sample", "--users", verbosity=0)
        r = self.client.post("/login/", {"username": "ana.reyes@demobss.com", "password": "Sample-pass-2026", "next": "/workload/"})
        self.assertEqual(r.status_code, 302)
        self.assertContains(self.client.get("/workload/"), "Ana Reyes")
        self.client.post("/logout/")
        r = self.client.post("/login/", {"username": "ana.reyes@demobss.com", "password": "wrong"})
        self.assertContains(r, "Wrong email or password.")
