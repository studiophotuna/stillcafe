# Workforce Management — Calendar + Workload

> Standalone app in `workforce/`, separate from the stillcafe site at the repo root.
> Sample people are fictional.

Next.js (App Router) + TypeScript implementation of the two modules from the Claude Design
handoff (`WFM v2` / `Workload.dc.html`, handoff notes in `design_handoff_wfm/README.md`; the
design bundle is kept outside this repo):

- **Calendar** — month grid of status and shifts per person, leave requests with per-team
  approvals and balances, management calendar, dashboard, BCP, notifications, and admin screens
  for approvals, members, team settings, shifts, organization, holidays and CSV reports.
- **Workload** — task intake, allocation (FIFO / members pick / admin assigns / round-robin),
  one-task-at-a-time work screen, task fields, productivity / utilization / timeliness.

Both modules share one shell (sidebar with the Calendar / Workload switch), one design system
(Industry, `src/app/industry.css`) and the same people ids.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 → /workload ; /calendar
npm test           # rules + persistence tests (vitest)
npm run typecheck
npm run build
```

Use **Prototype · view as** at the bottom of the side menu to switch between the admin
(Sam Delgado) and a member (Ana Reyes). Microsoft Entra ID sign-in replaces this switch later.

## Data and saving

Both modules save to Supabase: schema `workforce` in the stillcafe project
(`qepcyhgtyhjnxxlrjebk`), kept apart from the site's tables. Migrations in `supabase/migrations/`.

- **Rules run on the server.** The browser applies an action on screen straight away and posts it
  (`/api/wl/action`, `/api/cal/action`). The server re-runs the same rule on the stored data and
  saves with a version check; if someone else saved in between, it reloads and retries.
- **Workload** stores tasks as rows (`workforce.task`) and only writes rows that changed; the
  database also refuses a second in-progress task for one person, so two members pressing Start
  work never get the same task.
- **Calendar** stores the whole calendar as one versioned document (`workforce.cal_state`) — an
  interim design so it is usable now; the normalized tables in the handoff data model replace it
  when real data moves in.
- Each browser refreshes every 20 s and on focus. First load seeds the sample data.

### Keys — read before storing real data

The server only calls `workforce_*` functions; the tables are closed to Supabase's API roles.

| Server env | Key used | Who else can call the functions |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` set | secret key | nobody (after applying `supabase/pending/workforce_secret_key_only.sql`) |
| not set (current) | the project's **publishable** key, built in | anyone who has the publishable key + URL (both public) |

The publishable-key setup (migrations `0002`, `0003`) is for the fictional sample data only.
Before real data goes in:
1. Vercel › workforce › Settings › Environment Variables: add `SUPABASE_SECRET_KEY` (Supabase ›
   Project Settings › API Keys › a secret key). Never prefix it with `NEXT_PUBLIC_`. Redeploy.
2. Apply `supabase/pending/workforce_secret_key_only.sql`.

Optional env: `SUPABASE_URL` (defaults to the stillcafe project), `WORKFORCE_DB=off` (in-memory
sample data, marked “Sample data · not saved” in the top bar), `NEXT_PUBLIC_DEMO_CLOCK=off`
(sample mode uses a clock that starts at Thu 24 Sep 2026 10:30 Manila; saved data always uses the
real clock).

> There is no sign-in yet: anyone who can open the app can act as anyone via “view as”. Keep the
> Vercel deployment protected until Entra ID sign-in is added.

## Screens

| Route | Screen | Who |
| --- | --- | --- |
| `/calendar` | Calendar grid: Status / Shift, Everyone / Just me, search, daily counts; admins click a day to change it, members click their own row to request | everyone |
| `/calendar/management` | Leadership across the department, combined status | leaders, admins |
| `/calendar/dashboard` | Headcount, attendance chart, breakdown, out next two weeks, shift manning, holiday duty | leaders, admins |
| `/calendar/bcp` | BCP events, check-ins, FTE by tower/team, readiness | everyone (details: leaders, admins) |
| `/calendar/requests` | My balances and requests | everyone |
| `/calendar/notifications` | Emails and Outlook reminders the app sent | everyone |
| `/calendar/admin/approvals` · `members` · `settings` | Team admin screens | team admins |
| `/calendar/admin/shifts` · `organization` · `holidays` · `reports` | Department admin screens | admins of any team in the department |
| `/workload` · `/workload/queue` | My work, Queue | everyone |
| `/workload/dashboard` · `/workload/admin/*` | Dashboard, Intake, Task fields, Allocation, Targets | admins |

Admin-only routes send others back to the module's home.

## Code map

```
src/lib/
  db.ts                 Supabase client (server only), key selection, ConflictError
  calendar/             engine.ts (cell resolution, balances, messages), actions.ts,
                        uploads.ts, reports.ts, seed.ts, org.ts, excel.ts (templates/reading),
                        store.tsx, useCalView.ts, server.ts, engine.test.ts
  workload/             engine.ts, actions.ts, seed.ts, excel.ts, store.tsx, server.ts, tests
src/components/         AppFrame (shared shell), Workload Shell/TaskTable/Dialogs,
                        calendar/ (CalShell, CalendarGrid, CalDialogs)
src/app/                routes; api/wl/*, api/cal/*
supabase/migrations/    0001 workload schema · 0002 public-key access (temporary) · 0003 calendar
supabase/pending/       workforce_secret_key_only.sql — apply once the secret key is configured
```

## Where this differs from the prototypes

- Notifications are recorded (Calendar › Notifications) but not sent until the Microsoft Graph
  connection is built.
- Workload: reassigning an in-progress task makes it *Assigned* to the new person; changing a
  task's trade only requeues it if not started; round-robin assigns a “Needs trade” email once
  its trade is set; the dashboard shows one column per “counts in dashboard” field.
- Uploads read `.xlsx` and `.csv` with ExcelJS (old `.xls` is dropped).

## Next steps (build order from the handoff README)

1. Microsoft Entra ID sign-in (replaces “view as”); the server takes the acting person from the
   session and enforces who may do what.
2. Workload reads people, trades and availability from the Calendar data.
3. Microsoft Graph: send the recorded emails and Outlook reminders; mailbox webhook → tasks.
4. Normalize the Calendar document into the handoff tables before real data; Excel data migration.
