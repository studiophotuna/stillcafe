"""
Database tables. Plain Django models only (no database-specific SQL), so the same code runs on
Microsoft SQL Server, MySQL or SQLite. Rules live in core/rules/ as plain Python, not in the
database, which is what makes the database interchangeable.

Calendar side (source of truth for people and organization):
    OrgNode, Person, Allocation, Shift, Holiday, LeaveRequest, DayOverride, RosterEntry
Workload side (one queue per Calendar team):
    TeamWorkload, Task, TaskEvent, Activity
"""
from django.conf import settings
from django.db import models

# ── Organization ──


class OrgNode(models.Model):
    """Department › Tower › Team (branch) › System › Trade."""

    DEPT, TOWER, TEAM, SYSTEM, TRADE = "dept", "tower", "branch", "system", "trade"
    TYPES = [(DEPT, "Department"), (TOWER, "Tower"), (TEAM, "Team"), (SYSTEM, "System"), (TRADE, "Trade")]

    id = models.CharField(primary_key=True, max_length=40)
    type = models.CharField(max_length=10, choices=TYPES)
    name = models.CharField(max_length=120)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    sort = models.IntegerField(default=0)
    # Team settings: approval mode, leave limit per day, ...
    options = models.JSONField(default=dict, blank=True)
    admins = models.ManyToManyField("Person", blank=True, related_name="admin_of")

    class Meta:
        ordering = ["sort", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


# ── People ──


class Person(models.Model):
    LEVELS = [
        ("member", "Associate"),
        ("specialist", "Specialist"),
        ("senior", "Sr. Specialist"),
        ("lead", "Team lead"),
        ("srlead", "Sr. Team Lead"),
        ("supervisor", "Supervisor"),
        ("manager", "Manager"),
        ("director", "Director"),
    ]
    id = models.IntegerField(primary_key=True)
    name = models.CharField(max_length=120)
    email = models.EmailField(unique=True)
    level = models.CharField(max_length=12, choices=LEVELS, default="member")
    # Weekly pattern A = WFH Mon+Tue, B = WFH Thu+Fri, unless wfh_days is set (0 = Sunday).
    pattern = models.CharField(max_length=1, default="A")
    wfh_days = models.JSONField(null=True, blank=True)
    shift = models.ForeignKey("Shift", null=True, blank=True, on_delete=models.SET_NULL)
    hire = models.DateField(null=True, blank=True)
    resign = models.DateField(null=True, blank=True, help_text="Last day")
    entitle = models.DecimalField(max_digits=5, decimal_places=1, default=25)
    sys_admin = models.BooleanField(default=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="person")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Allocation(models.Model):
    """A person belongs to a node (team, system or trade); several allocations are allowed."""

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="allocations")
    node = models.ForeignKey(OrgNode, on_delete=models.CASCADE, related_name="allocations")
    sort = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort"]
        constraints = [models.UniqueConstraint(fields=["person", "node"], name="uniq_allocation")]


class Shift(models.Model):
    BUCKETS = [("morning", "Morning"), ("mid", "Midshift"), ("gy", "GY")]
    id = models.CharField(primary_key=True, max_length=10)
    name = models.CharField(max_length=60)
    start = models.CharField(max_length=5)  # "08:00"
    end = models.CharField(max_length=5)
    bucket = models.CharField(max_length=10, choices=BUCKETS)

    def __str__(self):
        return f"{self.name} {self.start}–{self.end}"


class Holiday(models.Model):
    date = models.DateField()
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=20, default="regular")
    # "all" or an OrgNode id (the holiday applies to everything under it)
    scope = models.CharField(max_length=40, default="all")

    class Meta:
        ordering = ["date"]


# ── Calendar entries ──


class LeaveRequest(models.Model):
    TYPES = [
        ("VL", "Vacation leave"), ("SL", "Sick leave"), ("EL", "Emergency leave"), ("HD", "Half-day leave"),
        ("BT", "Business trip"), ("WFH", "Work from home"), ("RTO", "In office"), ("ML", "Maternity leave"),
        ("PL", "Paternity leave"), ("SPL", "Solo parent leave"),
    ]
    id = models.CharField(primary_key=True, max_length=20)
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="requests")
    type = models.CharField(max_length=4, choices=TYPES)
    half = models.CharField(max_length=2, null=True, blank=True)
    start = models.DateField()
    end = models.DateField()
    reason = models.CharField(max_length=500, blank=True)
    created = models.DateField()
    # Per-team decision: {"rm": "pending", "cs": "approved"}
    approvals = models.JSONField(default=dict)
    lwop = models.DecimalField(max_digits=5, decimal_places=1, default=0)

    class Meta:
        indexes = [models.Index(fields=["person", "start", "end"])]


class DayOverride(models.Model):
    """An admin's (or approved request's) status for one person on one day: RTO, WFH, RD, HDY, ..."""

    person = models.ForeignKey(Person, on_delete=models.CASCADE)
    date = models.DateField()
    code = models.CharField(max_length=5)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["person", "date"], name="uniq_override")]


class RosterEntry(models.Model):
    """A different shift for one person on one day."""

    person = models.ForeignKey(Person, on_delete=models.CASCADE)
    date = models.DateField()
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["person", "date"], name="uniq_roster")]


# ── Workload ──


class TeamWorkload(models.Model):
    """A Calendar team's Workload: allocation mode, SLA, targets, task fields, task numbering."""

    team = models.OneToOneField(OrgNode, primary_key=True, on_delete=models.CASCADE, related_name="workload")
    settings = models.JSONField(default=dict)
    fields = models.JSONField(default=list)
    seq = models.IntegerField(default=1000)
    version = models.IntegerField(default=0)


class Task(models.Model):
    STATUSES = [("new", "In queue"), ("assigned", "Assigned"), ("in_progress", "In progress"), ("on_hold", "Pending"), ("done", "Done")]
    PRIORITIES = [("high", "High"), ("normal", "Normal"), ("low", "Low")]

    id = models.CharField(primary_key=True, max_length=20)
    team = models.ForeignKey(OrgNode, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=300)
    trade = models.CharField(max_length=40, blank=True)
    pr = models.CharField(max_length=6, choices=PRIORITIES, default="normal")
    received = models.DateTimeField()
    source = models.CharField(max_length=10, default="upload")
    status = models.CharField(max_length=12, choices=STATUSES, default="new")
    assignee = models.ForeignKey(Person, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks")
    started_at = models.DateTimeField(null=True, blank=True)
    done_at = models.DateTimeField(null=True, blank=True)
    hold = models.CharField(max_length=500, blank=True)
    ttype = models.CharField(max_length=40, blank=True, help_text="Task type id (its own SLA)")
    sla_h = models.FloatField(null=True, blank=True)
    fields = models.JSONField(default=dict, blank=True)
    email = models.JSONField(null=True, blank=True)
    version = models.IntegerField(default=0)

    class Meta:
        indexes = [
            models.Index(fields=["team", "status"]),
            models.Index(fields=["assignee", "status"]),
            models.Index(fields=["team", "done_at"]),
        ]

    def __str__(self):
        return f"{self.id} · {self.title}"


class TaskEvent(models.Model):
    """Task history: "Imported from upload", "Started by Ana Reyes", ..."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="events")
    at = models.DateTimeField()
    text = models.CharField(max_length=500)

    class Meta:
        ordering = ["at", "id"]


class Activity(models.Model):
    """Break, lunch, meeting, ad hoc, training, or End work (with overtime) for one person."""

    KINDS = [("break", "Break"), ("lunch", "Lunch"), ("meeting", "Meeting"), ("adhoc", "Ad hoc"), ("training", "Training"), ("end", "End work")]
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="activities")
    team = models.ForeignKey(OrgNode, on_delete=models.CASCADE)
    kind = models.CharField(max_length=10, choices=KINDS)
    start = models.DateTimeField()
    end = models.DateTimeField(null=True, blank=True)
    ot_min = models.IntegerField(default=0)
    ot_status = models.CharField(max_length=10, blank=True)

    class Meta:
        indexes = [models.Index(fields=["person", "start"])]
