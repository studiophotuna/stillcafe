"""
Django settings for the Python edition of Workforce Management.

Everything that differs between a laptop and the company server comes from environment
variables (or a `.env`-style file loaded by the service wrapper), so the code never changes:

    WFM_SECRET_KEY      long random string (required in production)
    WFM_DEBUG           "1" on a developer PC only
    WFM_ALLOWED_HOSTS   comma-separated host names, e.g. "wfm.corp.local,10.20.30.40"
    WFM_DB_ENGINE       "sqlite" (default, for the draft), "mssql" or "mysql"
    WFM_DB_NAME / WFM_DB_USER / WFM_DB_PASSWORD / WFM_DB_HOST / WFM_DB_PORT
    WFM_DB_DRIVER       SQL Server ODBC driver name (default "ODBC Driver 18 for SQL Server")
    WFM_DB_TRUSTED      "1" = SQL Server Windows authentication instead of user/password
    WFM_DEMO            "1" = sample-data mode with the "view as" switch and no sign-in
    WFM_DEMO_CLOCK      sample-data clock start, default "2026-09-24T10:30" (Manila)
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


DEBUG = env("WFM_DEBUG") == "1"
SECRET_KEY = env("WFM_SECRET_KEY") or ("dev-only-not-secret" if DEBUG or env("WFM_DEMO") == "1" else "")
if not SECRET_KEY:
    raise RuntimeError("Set WFM_SECRET_KEY (a long random string) before starting the server.")

ALLOWED_HOSTS = [h.strip() for h in env("WFM_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.access.SignInRequiredMiddleware",
]

ROOT_URLCONF = "wfm.urls"
WSGI_APPLICATION = "wfm.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ── Database: one setting switches between SQL Server, MySQL and SQLite ──
def _database() -> dict:
    engine = env("WFM_DB_ENGINE", "sqlite").lower()
    if engine == "mssql":
        # pip install mssql-django ; needs Microsoft "ODBC Driver 18 for SQL Server" on the server.
        extra = env("WFM_DB_EXTRA", "TrustServerCertificate=yes")
        opts = {"driver": env("WFM_DB_DRIVER", "ODBC Driver 18 for SQL Server"), "extra_params": extra}
        if env("WFM_DB_TRUSTED") == "1":
            opts["extra_params"] = (extra + ";" if extra else "") + "Trusted_Connection=yes"
        return {
            "ENGINE": "mssql",
            "NAME": env("WFM_DB_NAME", "workforce"),
            "USER": "" if env("WFM_DB_TRUSTED") == "1" else env("WFM_DB_USER"),
            "PASSWORD": "" if env("WFM_DB_TRUSTED") == "1" else env("WFM_DB_PASSWORD"),
            "HOST": env("WFM_DB_HOST", "localhost"),
            "PORT": env("WFM_DB_PORT", ""),
            "OPTIONS": opts,
        }
    if engine == "mysql":
        # pip install mysqlclient ; MySQL 8.0+ (or MariaDB 10.6+), utf8mb4.
        return {
            "ENGINE": "django.db.backends.mysql",
            "NAME": env("WFM_DB_NAME", "workforce"),
            "USER": env("WFM_DB_USER"),
            "PASSWORD": env("WFM_DB_PASSWORD"),
            "HOST": env("WFM_DB_HOST", "localhost"),
            "PORT": env("WFM_DB_PORT", "3306"),
            "OPTIONS": {"charset": "utf8mb4", "init_command": "SET sql_mode='STRICT_TRANS_TABLES'"},
        }
    return {"ENGINE": "django.db.backends.sqlite3", "NAME": env("WFM_DB_NAME") or BASE_DIR / "workforce.sqlite3"}


DATABASES = {"default": _database()}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Sign-in: work email + password, hashed by Django (PBKDF2), 12-hour sessions ──
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LOGIN_URL = "/login/"
SESSION_COOKIE_AGE = 12 * 3600
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = env("WFM_HTTPS") == "1"
CSRF_COOKIE_SECURE = env("WFM_HTTPS") == "1"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# ── App switches ──
WFM_DEMO = env("WFM_DEMO") == "1"
WFM_DEMO_CLOCK = env("WFM_DEMO_CLOCK", "2026-09-24T10:30")
