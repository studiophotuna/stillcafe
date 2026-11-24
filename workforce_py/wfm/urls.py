from django.contrib import admin
from django.contrib.auth.views import LogoutView
from django.urls import path
from django.views.generic import RedirectView

from core import views

urlpatterns = [
    path("", RedirectView.as_view(url="/calendar/")),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(next_page="/login/"), name="logout"),
    path("view-as/", views.view_as, name="view_as"),
    path("workload/", views.my_work, name="my_work"),
    path("workload/queue/", views.queue, name="queue"),
    path("calendar/", views.calendar_grid, name="calendar"),
    path("workload/history/", views.planned),
    path("calendar/bcp/", views.planned),
    path("calendar/requests/", views.planned),
    path("calendar/notifications/", views.planned),
    path("admin-area/", views.planned),
    # Django's built-in data back office, for system admins (fix a record by hand, audit tables).
    path("django-admin/", admin.site.urls),
]
