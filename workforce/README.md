# Workforce Management — Workload

> Standalone app in `workforce/`, separate from the stillcafe site at the repo root.
> Sample people are fictional.

Next.js (App Router) + TypeScript implementation of the **Workload** module from the Claude Design
handoff (`Workload.dc.html`, handoff notes in `design_handoff_wfm/README.md`; the design bundle is
kept outside this repo).

Every screen and rule from the design works, and data is saved in Supabase.

## Data and saving

- **Database:** schema `workforce` in the stillcafe Supabase project (`qepcyhgtyhjnxxlrjebk`),
  kept apart from the site's tables. Migrations in `supabase/migrations/`.
- **Rules run on the server.** The browser applies an action on screen straight away and posts it
  to `/api/wl/action`. The server re-runs the same rule (`src/lib/workload/actions.ts` →
  `engine.ts`) on the stored data and saves only the rows that changed, with version checks. If
  someone else changed those rows in the meantime, it reloads and retries. The database also
  refuses a second in-progress task for one person, so two members pressing Start work at once
  never get the same task.
- **Live-ish:** each browser refreshes from `/api/wl/snapshot` every 20 s and on focus.
- **First load** seeds the team with the sample tasks.

### Keys — read before storing real data

The server calls two database functions, `workforce_snapshot` and `workforce_apply`; the
`workforce` tables themselves are closed to Supabase's API roles.

| Server env | Key used | Who else can call the functions |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` set | secret key | nobody (after applying `supabase/pending/0003_…`) |
| not set (current) | the project's **publishable** key, built in | anyone who has the publishable key + URL (both public) |

The publishable-key setup (migration `0002`) is for the fictional sample data only. Before real
data goes in:
1. Vercel › workforce › Settings › Environment Variables: add `SUPABASE_SECRET_KEY` (Supabase ›
   Project Settings › API Keys › a secret key). Never prefix it with `NEXT_PUBLIC_`. Redeploy.
2. Apply `supabase/pending/0003_workforce_secret_key_only.sql` to close the functions to the
   public key.

Optional env: `SUPABASE_URL` (defaults to the stillcafe project), `WORKFORCE_DB=off` (in-memory
sample data, marked “Sample data · not saved” in the top bar).

> There is no sign-in yet: anyone who can open the app can act as anyone via “view as”. Keep the
> Vercel deployment protected until Entra ID sign-in is added.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 → /workload
npm test           # rule + persistence tests (vitest)
npm run typecheck
npm run build
```

Use **Prototype · view as** at the bottom of the side menu to switch between the admin
(Sam Delgado) and a member (Ana Reyes). Microsoft Entra ID sign-in replaces this
switch later.

The clock starts at the design's reference time (Thu 24 Sep 2026, 10:30 Manila) and runs
forward, so the sample data looks the same as the design. Set `NEXT_PUBLIC_DEMO_CLOCK=off` to use
the real clock. Saved (database) data always uses the real clock.

## Screens

| Route | Screen | Who |
| --- | --- | --- |
| `/workload` | My work: KPIs, current task (hold / done), Start work, assigned & on-hold list | everyone |
| `/workload/queue` | Queue with status filter, search, “Share out queue now” (round-robin / admin assigns) | everyone |
| `/workload/dashboard` | Productivity, utilization, timeliness, queue by trade, people | admins / leaders |
| `/workload/admin/intake` | Excel template + upload with row checks, Outlook mailbox | admins |
| `/workload/admin/fields` | Team task fields (type, options, required, dashboard metric, order) | admins |
| `/workload/admin/allocation` | Allocation method, after-done rule, order, skip unavailable, SLA | admins |
| `/workload/admin/targets` | Working time, target per trade, member overrides | admins |
| `/calendar` | Placeholder until the Calendar module is built | everyone |

Members who open an admin route are sent back to My work.

## Code map

```
src/lib/workload/
  engine.ts     all Workload rules as pure functions (start work, take, hold, resume, done,
                auto-feed, round-robin, assign, intake, upload validation, metrics)
  engine.test.ts
  actions.ts    serializable actions + applyAction (shared by browser and server)
  server.ts     Supabase load/save with version checks and retry (server-only)
  server.test.ts
  store.tsx     React context: db/demo mode, optimistic actions, refresh, toasts, view-as, filters
  seed.ts       sample tasks (identical to the prototype's seed) and a team's initial data
  constants.ts  org seed (GPM/RCM trades), people, labels
  clock.ts      Manila-time formatting + demo clock
  excel.ts      ExcelJS template download; .xlsx/.csv upload reader
  view.ts       row/detail view models shared by tables and dialogs
src/components/ Shell (sidebar + filter bar), TaskTable, Dialogs (task details, hold, done), ui
src/app/api/wl/ snapshot (GET) and action (POST) route handlers
src/app/        routes; industry.css = design-system stylesheet (copied from the design bundle's `_ds/industry-…/styles.css`)
supabase/migrations/0001_workforce_schema.sql  workforce schema + snapshot/apply functions
supabase/migrations/0002_…public_key_access.sql  temporary: publishable key may call them
supabase/pending/0003_…secret_key_only.sql      apply once the secret key is configured
```

## Where this differs from the prototype

Deliberate fixes to edge cases the prototype didn't handle:

- **Reassigning an in-progress task** (admin › Assign to) makes it *Assigned* to the new person,
  so nobody ends up with two tasks in progress. The prototype kept it *In progress*.
- **Changing a task's trade** only returns it to the queue if it hadn't been started yet. The
  prototype also removed the assignee from in-progress tasks, leaving them with no owner.
- **Round-robin + “Needs trade”**: when an admin sets the trade on a waiting email, round-robin
  assigns it straight away instead of waiting for “Share out queue now”.
- The engine itself enforces *unavailable*, *one in progress* and *required fields*, not only
  the buttons.
- The dashboard's People table shows one column per “counts in dashboard” field, not fixed
  Contracts / Amendments columns.
- Uploads read `.xlsx` and `.csv` with ExcelJS; SheetJS isn't needed (old `.xls` is dropped).

## Next steps (build order from the handoff README)

1. Microsoft Entra ID sign-in (replaces “view as”); take the acting person from the session on
   the server instead of from the request.
2. People, org and availability from the Calendar module (today they are constants in
   `constants.ts`); then move task fields, targets and history into their own tables as the
   handoff data model describes.
3. Microsoft Graph mailbox webhook → tasks (replaces “Check mailbox now”).
