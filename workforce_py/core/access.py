"""
Who is using the app.

Saved data: everyone signs in with their work email and password (Django auth); the signed-in
user is linked to a Person. Sample-data mode (WFM_DEMO=1): no sign-in, and a "view as" switch
picks one of four sample people, as in the original app.
"""
from django.conf import settings
from django.shortcuts import redirect

from .models import Person

PERSONAS = [
    ("director", 26, "Director (Diego Samonte)"),
    ("admin", 23, "Manager (Sam Delgado)"),
    ("lead", 14, "Team lead (Kim Bautista)"),
    ("employee", 0, "Employee (Ana Reyes)"),
]
OPEN_PATHS = ("/login/", "/static/", "/django-admin/")


def current_person(request) -> Person | None:
    if settings.WFM_DEMO:
        v = request.session.get("view_as", "employee")
        pid = next((pid for key, pid, _ in PERSONAS if key == v), 0)
        return Person.objects.filter(pk=pid).first()
    if request.user.is_authenticated:
        return Person.objects.filter(user=request.user).first()
    return None


class SignInRequiredMiddleware:
    """Every page needs a signed-in person (except in sample-data mode)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not settings.WFM_DEMO and not request.path.startswith(OPEN_PATHS) and not request.user.is_authenticated:
            return redirect(f"{settings.LOGIN_URL}?next={request.path}")
        return self.get_response(request)
