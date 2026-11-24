"""WSGI entry point, used by Waitress on Windows (see serve.py) or any WSGI server."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wfm.settings")
application = get_wsgi_application()
