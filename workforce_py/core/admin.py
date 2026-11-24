"""Django's built-in back office at /django-admin/ (system admins): browse and fix any record by hand."""
from django.contrib import admin

from . import models as m

for model in (m.OrgNode, m.Person, m.Allocation, m.Shift, m.Holiday, m.LeaveRequest, m.DayOverride, m.RosterEntry, m.TeamWorkload, m.Activity):
    admin.site.register(model)


@admin.register(m.Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "team", "trade", "pr", "status", "assignee", "received")
    list_filter = ("team", "status", "pr")
    search_fields = ("id", "title")
