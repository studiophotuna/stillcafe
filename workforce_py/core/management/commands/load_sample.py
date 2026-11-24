"""
python manage.py load_sample [--users]

Loads the same fictional sample organization, people, calendar and Rate Desk tasks as the
original app (exported from workforce/src/lib/*/seed.ts into core/sample_data/*.json).
Replaces everything in the app's tables. --users also creates a sign-in for every sample
person (password "Sample-pass-2026") so the sign-in flow can be tried without WFM_DEMO.
"""
import json
from datetime import date, datetime, timezone
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from core import models as m

DATA = Path(__file__).resolve().parents[2] / "sample_data"


def ms(v):
    return datetime.fromtimestamp(v / 1000, tz=timezone.utc) if v else None


class Command(BaseCommand):
    help = "Load the fictional sample data (replaces the app's tables)."

    def add_arguments(self, parser):
        parser.add_argument("--users", action="store_true", help="also create sign-ins for the sample people")

    @transaction.atomic
    def handle(self, *args, **opts):
        cal = json.loads((DATA / "calendar.json").read_text(encoding="utf-8"))
        wl = json.loads((DATA / "workload.json").read_text(encoding="utf-8"))

        for model in (m.TaskEvent, m.Task, m.Activity, m.TeamWorkload, m.RosterEntry, m.DayOverride, m.LeaveRequest,
                      m.Holiday, m.Allocation, m.Person, m.OrgNode, m.Shift):
            model.objects.all().delete()

        m.Shift.objects.bulk_create([m.Shift(**s) for s in cal["shifts"]])

        # Parents first (the list is already top-down).
        for i, n in enumerate(cal["nodes"]):
            opts_ = {k: v for k, v in n.items() if k not in ("id", "type", "name", "parent", "admins")}
            m.OrgNode.objects.create(id=n["id"], type=n["type"], name=n["name"], parent_id=n["parent"], sort=i, options=opts_)

        User = get_user_model()
        for p in cal["people"]:
            person = m.Person.objects.create(
                id=p["id"], name=p["name"], email=p["email"], level=p["level"], pattern=p["pattern"],
                shift_id=p["shift"], hire=p.get("hire"), resign=p.get("resign"), entitle=p.get("entitle", 25),
                wfh_days=p.get("wfhDays"), sys_admin=p["id"] == 23,
            )
            for j, a in enumerate(p["assign"]):
                m.Allocation.objects.create(person=person, node_id=a, sort=j)
            if opts["users"]:
                u, _ = User.objects.get_or_create(username=p["email"], defaults={"email": p["email"]})
                u.set_password("Sample-pass-2026")
                u.save()
                person.user = u
                person.save(update_fields=["user"])

        for n in cal["nodes"]:
            if n.get("admins"):
                m.OrgNode.objects.get(pk=n["id"]).admins.set(n["admins"])

        m.Holiday.objects.bulk_create([m.Holiday(date=h["date"], name=h["name"], kind=h.get("type", "regular"), scope=h["scope"]) for h in cal["holidays"]])
        m.LeaveRequest.objects.bulk_create([
            m.LeaveRequest(id=q["id"], person_id=q["pid"], type=q["type"], half=q.get("half"), start=q["start"], end=q["end"],
                           reason=q.get("reason", ""), created=q["created"], approvals=q["approvals"], lwop=q.get("lwop", 0))
            for q in cal["requests"]
        ])

        def split(key):
            pid, d = key.split("|")
            return int(pid), date.fromisoformat(d)

        m.DayOverride.objects.bulk_create([m.DayOverride(person_id=split(k)[0], date=split(k)[1], code=v) for k, v in cal["overrides"].items()])
        m.RosterEntry.objects.bulk_create([m.RosterEntry(person_id=split(k)[0], date=split(k)[1], shift_id=v) for k, v in cal["roster"].items()])

        team = m.OrgNode.objects.get(pk=wl["org"]["team"]["id"])
        settings = {k: v for k, v in wl["settings"].items() if k != "billing"}
        m.TeamWorkload.objects.create(team=team, settings=settings, fields=wl["fields"], seq=wl["seq"])
        for t in wl["tasks"]:
            task = m.Task.objects.create(
                id=t["id"], team=team, title=t["title"], trade=t["trade"], pr=t["pr"], received=ms(t["received"]),
                source=t["source"], status=t["status"], assignee_id=t["assignee"], started_at=ms(t["startedAt"]),
                done_at=ms(t["doneAt"]), hold=t.get("hold") or "", sla_h=t.get("slaH"), ttype=t.get("ttype") or "",
                fields=t["fields"], email=t.get("email"),
            )
            m.TaskEvent.objects.bulk_create([m.TaskEvent(task=task, at=ms(h["at"]), text=h["text"]) for h in t["history"]])

        self.stdout.write(self.style.SUCCESS(
            f"Loaded {m.Person.objects.count()} people, {m.OrgNode.objects.count()} org nodes, "
            f"{m.LeaveRequest.objects.count()} requests and {m.Task.objects.count()} tasks."
        ))
