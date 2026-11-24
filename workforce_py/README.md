# Workforce Management — Python edition (draft)

> A Python (Django) rebuild of the app in `../workforce/`, kept in its own folder so the original
> tool is not changed. Same screens, same look, same rules; runs on a Windows server inside the
> company network and on Microsoft SQL Server or MySQL. Sample people are fictional.

**Status: draft (phase 1 of 4).** It shows the main screens working end to end so the team can
compare them with the current app before the rest is moved over:

| Area | In this draft | Still in the original only (next phases) |
| --- | --- | --- |
| Workload | My work (Start work, Pending, Resolve ticket with required fields, Break / Lunch / Meeting / Ad hoc / Training, Back to work, End work, task timer, “Your day so far”), Queue (active and completed, filters, search, overdue / due-soon) | Task history, Upload tasks (Excel), Add task, Dashboard, Overtime approval, Members pick / admin assigns / round-robin modes, claims, admin pages (Intake, Task fields, Allocation, Targets, SLA, AHT, Business case, Data pull-out) |
| Calendar | Month grid (status and shift views, team / system / trade filters, Everyone / Just me, search), leave and holiday rules | Requests and approvals, leave balances, BCP, Management view, Dashboard, Notifications, all Admin screens, Headcount, Excel imports and reports |
| Platform | Sign-in with work email and password, sample-data mode with “view as”, database-neutral tables, one-task-at-a-time lock, tests | Temporary passwords / reset from Members, Microsoft Entra sign-in, Outlook (Microsoft Graph) |

## What changes compared with the original

| | Original (`workforce/`) | Python edition (`workforce_py/`) |
| --- | --- | --- |
| Language | TypeScript (Node.js, Next.js, React) | **Python 3.12+ (Django 5.2 LTS)** |
| Database | Supabase (hosted PostgreSQL), rules partly in SQL functions | **Microsoft SQL Server or MySQL** (or SQLite for a trial); all rules in Python |
| Hosting | Vercel + Supabase (internet) | **Your Windows server, internal network only** |
| Web server | Vercel | Waitress (pure Python, Windows-native), optionally behind IIS for HTTPS |
| Look and feel | Industry design system | **The same stylesheets, copied unchanged** — screens look the same |
| Screens update | Instantly in the browser, then saved | Saved first, then the page shows the result (about the same speed on an internal network) |
| Background refresh | Every 30 s | Every 30 s while the page is idle |
| Excel | ExcelJS | openpyxl (next phase) |
| Data back office | Supabase dashboard | Django admin at `/django-admin/` for system admins |

## Run it on a PC (trial, with sample data)

Install Python 3.12 or later from python.org (tick “Add python.exe to PATH”). Then, in a command
prompt in this folder:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set WFM_DEMO=1
python manage.py migrate
python manage.py load_sample
python manage.py runserver
```

Open http://localhost:8000/workload/ . “Sample data · view as” at the bottom of the side menu
switches between a director, a manager, a team lead and a member, as in the original.

Tests: `python manage.py test` (rule tests that mirror the TypeScript engine, plus page tests).

## Database

The app uses only standard Django tables (no database-specific SQL), so the choice is one setting.
Ask IT which one they run; nothing else in the code changes.

**Microsoft SQL Server 2016 or later**

1. Install “Microsoft ODBC Driver 18 for SQL Server” on the app server.
2. `pip install mssql-django`
3. IT creates an empty database (e.g. `workforce`) and a login with rights to create tables in it,
   or grants the app server's Windows service account access (Windows authentication).
4. Settings:
   ```bat
   set WFM_DB_ENGINE=mssql
   set WFM_DB_HOST=sqlserver.corp.local
   set WFM_DB_NAME=workforce
   set WFM_DB_USER=wfm_app
   set WFM_DB_PASSWORD=...
   rem or, with Windows authentication instead of user/password:
   set WFM_DB_TRUSTED=1
   ```

**MySQL 8.0+ / MariaDB 10.6+**

1. `pip install mysqlclient`
2. `CREATE DATABASE workforce CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` and a user for it.
3. Settings: `WFM_DB_ENGINE=mysql`, `WFM_DB_HOST`, `WFM_DB_NAME`, `WFM_DB_USER`, `WFM_DB_PASSWORD`.

Then `python manage.py migrate` creates the tables. Backups are your database's normal backups.

## Install on the Windows server (internal network)

1. Install Python 3.12+ for all users, and the database driver above.
2. Copy this folder to e.g. `D:\apps\workforce_py`, create the virtual environment and
   `pip install -r requirements.txt` (plus the database driver).
3. Settings (system environment variables, or in the service definition):
   - `WFM_SECRET_KEY` — a long random string (e.g. `python -c "import secrets;print(secrets.token_urlsafe(50))"`)
   - `WFM_ALLOWED_HOSTS` — the names people will type, e.g. `wfm,wfm.corp.local,10.20.30.40`
   - the `WFM_DB_*` settings above
4. `python manage.py migrate` and `python manage.py collectstatic`.
5. Run it: `python serve.py` (listens on port 8080; `WFM_PORT` to change). To start it with
   Windows, register it as a service with NSSM (`nssm install WorkforceManagement`, path
   `D:\apps\workforce_py\.venv\Scripts\python.exe`, arguments `serve.py`, startup directory the
   folder) or with Task Scheduler “At startup”.
6. HTTPS (recommended): put IIS in front as a reverse proxy (URL Rewrite + Application Request
   Routing) with the company certificate, and set `WFM_HTTPS=1`.
7. Fonts: pages load the Barlow font from Google Fonts. If the server or PCs can't reach the
   internet, download Barlow and Barlow Condensed (free, OFL licence) into `core/static/core/fonts/`
   and replace the `<link>` in `core/templates/core/base.html` with a local `@font-face`; until then
   the pages fall back to the system font.

## Who can open it

- **Anyone on the company network (or VPN) can reach the address** — e.g. `http://wfm.corp.local:8080`.
  Nothing is exposed to the internet unless IT publishes it.
- **Reaching it isn't the same as getting in:** every page needs a sign-in with a work email and
  password, and what each person sees and can change is checked on the server (members act only as
  themselves; team admins manage their team; system admins everything) — the same rules as now.
- To narrow it further, IT can restrict the port to certain subnets in Windows Firewall, or allow
  only certain IP ranges / AD groups in IIS. Single sign-on with Microsoft Entra ID (company
  account, no separate password) is planned and fits the existing email-based accounts.

## Code map

```
wfm/settings.py         all settings from environment variables (database switch, demo mode)
serve.py                Waitress production server for Windows
core/models.py          tables: organization, people, calendar entries, tasks, activity
core/rules/             the rules as plain Python (ported from ../workforce/src/lib/*/engine.ts)
  clock.py              team time (Manila), SLA hours skipping weekends and holidays
  workload.py           SLA, queue order, Start work, help other trades, pending, resolve, breaks
  calendar.py           what each person's day shows (holiday → leave → override → weekend → pattern)
core/services.py        loads data for the rules, runs each action in one locked transaction
core/views.py           pages; core/templates/ the HTML (same markup as the original)
core/static/core/       the original stylesheets, unchanged, plus py.css (small additions)
core/management/commands/load_sample.py   loads the fictional sample data
core/tests/             rule tests and page tests
```

## Next phases

1. **Phase 1 (this draft):** foundation, database, sign-in, rules engines, main Workload and
   Calendar screens.
2. **Phase 2 — Workload complete:** uploads (Excel), Add task, Task history with CSV/Excel,
   Dashboard, Overtime, all allocation modes and claims, Workload admin pages.
3. **Phase 3 — Calendar complete:** requests and approvals with balances, leave cover, BCP,
   Management view, Dashboard, Notifications, Members (with temporary passwords), Organization,
   Shifts, Holidays, Headcount, Reports and Excel imports.
4. **Phase 4 — Move in:** export the live data from Supabase into SQL Server / MySQL, user
   testing next to the current app, switch over.
