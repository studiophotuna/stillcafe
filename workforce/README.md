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
npm run dev        # http://localhost:3000 → /calendar ; /workload
npm test           # rules + persistence tests (vitest)
npm run typecheck
npm run build
```

With the database (the default) everyone signs in with **email and password** at `/login`.
With `WORKFORCE_DB=off` the app runs on fictional sample data, and **Sample data · view as** at
the bottom of the side menu switches between the admin (Sam Delgado) and a member (Ana Reyes).

## Sign-in

- **Accounts come from members.** When an admin adds a member (Calendar › Admin › Members ›
  Add member, or a members upload), their work email becomes their sign-in and the app shows a
  **temporary password once** (copy, or download CSV for several). Changing someone's email
  replaces their sign-in with a new temporary password.
- **First sign-in** with a temporary password goes to *Set your password*: at least 10 characters
  with letters and numbers. Nothing else opens until it is changed.
- **Forgotten password:** an admin presses *Reset password* on the Members page (new temporary
  password; the person's open sessions end). *Remove sign-in* appears for people who have left.
- Passwords are bcrypt-hashed in the database; sessions are random tokens in an httpOnly cookie
  (only their SHA-256 is stored), valid 12 hours. Five wrong passwords lock the account for
  15 minutes.
- **Who may do what** is checked on the server for every action (`src/lib/calendar/authz.ts`,
  `src/lib/workload/authz.ts`): members act only as themselves; team admins manage their team's
  people, schedule and settings; a **system admin** (`sysAdmin` on the person, set for the first
  administrator) can do everything, and only a system admin can change another system admin.
  The database also refuses non-admin changes to people, org, schedules, shifts, holidays,
  BCP events and Workload settings.
- **First administrator:** created directly in the database (see *Starting fresh* below).

## Organization

**Allocations by role:** directors need only a department, managers a department and tower,
team leads and members a department, tower and team (deeper is always allowed). People
allocated to a whole department or tower belong to no team: they appear in the Management
view and in the Members list of every team under them, their leave is approved automatically,
and only a system admin can edit them.

Calendar › Admin › Organization › **Import from Excel**: paste the Tower and Team columns (and
optionally System and Trade) straight from a spreadsheet. The dialog previews what will be added;
names already there are skipped (a team that already exists as a system of a team in that tower,
such as GPM inside Rate Management, counts as there), so the same list can be pasted again after
adding rows. New teams start with admin approval and no team admin.

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
- Each browser refreshes every 20 s and on focus.
- **The Calendar is Workload's source of truth.** Each Calendar team has its own Workload
  (queue, settings, targets), picked from the Team filter. Everything else comes from Calendar ›
  Organization and Members, read fresh on every load:
  - **Where tasks go:** the team's trades. A system with no trades counts as one; a team with no
    systems or trades is one unit itself, so every team can use Workload.
  - **People:** the team's members; their trades from their allocations (a trade, or every trade
    under an allocated system; in a single-unit team, everyone). Availability from today's
    calendar (leave, rest day, holiday, outside their shift).
  - **Admins:** the team's admins plus system admins.
  - **Which teams someone can open:** their own teams, teams they administer, and the teams under
    a department or tower they're allocated to (system admins: all). The server checks this.
- The Outlook mailbox is not connected yet; with live data, tasks come in by upload only.
- **Getting work:** Start work gives a member's assigned tasks first, then the waiting tasks
  in their own trades. When those are empty it asks whether they'll help with other trades
  and, if they agree, gives tasks from other trades in their system first, then the rest of
  the team (task history notes “helping …”). In “members pick” mode the same list appears.
- **Status and utilization:** My work has Break, Lunch, Meeting, Ad hoc and Training buttons
  (and Back to work). Time away isn't counted on an open task, new work can't start until
  the member is back, and utilization = time on tasks ÷ (shift time so far − time away);
  planned breaks (Targets) are assumed only when none were logged. Stored in
  `workforce.activity` (migration 0006).
- **End work and overtime:** End work closes the day (not with a task in progress; undo is
  possible until overtime is decided). Only when it's pressed after the shift does it ask for
  overtime, at most the time past the shift. Overtime counts in the dashboard and the Overtime
  report only after a Workload admin or a lead/manager/director of the team approves it (not
  their own); the database enforces this too.
- **Productivity** counts completed tasks by default; an admin can switch it (Targets) to the
  total of a number field (e.g. No. of contracts) or distinct values of any field (e.g. one
  per ticket). Targets are in that unit.
- **Uploads:** admins, and members an admin ticks under Intake › Who can upload tasks (they
  get an Upload tasks page). Required fields may be blank in the file; they must be filled
  before the task can be marked done, and My work shows what's missing.
- **Who sees tasks:** only people who can open the team (see above); the server refuses others.
- **Timers:** going on a break/lunch/meeting/ad hoc/training opens a pop-up with a running timer
  and Back to work (can be minimized to a corner chip on every Workload page). The current task
  shows its running time (paused while away) and start time; task details show started,
  finished and time worked.
- **Reminders:** a pop-up (once a day) lists open tasks received N days ago or more — the team's
  for admins, their own for members — and overtime waiting that long for approvers. N is set
  under Allocation (default 2, 0 = off).
- **Queue:** Active and Completed tabs with a Day/Week/Month navigator (Active: by received
  date, all dates by default; Completed: by finish date, today by default). Overdue rows are red
  and rows due within 2 hours amber. A ticket-number column (Allocation › Ticket number field;
  defaults to a field named “ticket”) is searchable.
- **Task history:** completed tasks by day/week/month — members their own, admins and leads the
  team's or their own — filtered by person, trade and timeliness, searchable, with totals and a
  CSV including start and finish times and time worked.

### Starting fresh

The live database was cleared to start with real data: no tasks, the org tree (BSS › A&S
Support – Rate Management › Rate Management with its systems and trades), the standard shifts,
and one person — the first system admin, with a temporary password. Everything else is added in
the app.

### Keys — read before storing real data

The server only calls `workforce_*` functions; the tables are closed to Supabase's API roles.

| Server env | Key used | Who else can call the functions |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` set | secret key | nobody (after applying `supabase/pending/workforce_secret_key_only.sql`) |
| not set (current) | the project's **publishable** key, built in | anyone with the publishable key + URL, **but only with a valid session** |

With the publishable key, every data function still requires a signed-in session and the database
enforces the admin-only parts. What it cannot stop: a signed-in member calling the functions
directly (outside the app) could change data the app keeps them out of, such as other people's
leave requests, BCP check-ins, readiness or Workload tasks. To close that:
1. Vercel › workforce › Settings › Environment Variables: add `SUPABASE_SECRET_KEY` (Supabase ›
   Project Settings › API Keys › a secret key). Never prefix it with `NEXT_PUBLIC_`. Redeploy.
2. Apply `supabase/pending/workforce_secret_key_only.sql`.

Optional env: `SUPABASE_URL` (defaults to the stillcafe project), `WORKFORCE_DB=off` (in-memory
sample data, marked “Sample data · not saved” in the top bar), `NEXT_PUBLIC_DEMO_CLOCK=off`
(sample mode uses a clock that starts at Thu 24 Sep 2026 10:30 Manila; saved data always uses the
real clock).

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
  db.ts                 Supabase client (server only), key selection, ConflictError, ForbiddenError
  auth.ts               sessions (cookie), temporary passwords, error → HTTP mapping
  session.ts            browser side: who is signed in, redirects to /login, sign out
  calendar/             engine.ts (cell resolution, balances, messages), actions.ts,
                        uploads.ts, reports.ts, seed.ts, org.ts, excel.ts (templates/reading),
                        store.tsx, useCalView.ts, server.ts, authz.ts, engine.test.ts
  workload/             engine.ts, actions.ts, seed.ts, excel.ts, store.tsx, server.ts,
                        people.ts (people from the Calendar), authz.ts, tests
src/components/         AppFrame (shared shell), Workload Shell/TaskTable/Dialogs,
                        calendar/ (CalShell, CalendarGrid, CalDialogs)
src/app/                routes; /login, /change-password; api/auth/*, api/wl/*, api/cal/*
supabase/migrations/    0001 workload schema · 0002 public-key access · 0003 calendar ·
                        0004 sign-in, sessions and session-gated functions
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

1. Set `SUPABASE_SECRET_KEY` and apply the pending script (see *Keys*).
2. Microsoft Entra ID sign-in can replace passwords later, once approved; accounts are already
   keyed by work email.
3. Microsoft Graph: send the recorded emails and Outlook reminders; mailbox webhook → tasks.
4. Normalize the Calendar document into the handoff tables before real data; Excel data migration.
