# Workforce Management — Workload

> Standalone app in `workforce/`, separate from the stillcafe site at the repo root.
> Sample people are fictional.

Next.js (App Router) + TypeScript implementation of the **Workload** module from the Claude Design
handoff (`Workload.dc.html`, handoff notes in `design_handoff_wfm/README.md`; the design bundle is
kept outside this repo).

This first build is **frontend-first**: every screen and rule from the design works, on
in-memory sample data that resets on reload. The rules live in one pure module so the
Supabase backend can take them over without touching the screens.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 → /workload
npm test           # rule tests (vitest)
npm run typecheck
npm run build
```

Use **Prototype · view as** at the bottom of the side menu to switch between the admin
(Sam Delgado) and a member (Ana Reyes). Microsoft Entra ID sign-in replaces this
switch later.

The clock starts at the design's reference time (Thu 24 Sep 2026, 10:30 Manila) and runs
forward, so the sample data looks the same as the design. Set `NEXT_PUBLIC_DEMO_CLOCK=off` to use
the real clock.

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
  store.tsx     React context: in-memory data, toasts, view-as, System/Trade filter, dialogs
  seed.ts       sample tasks, identical to the prototype's seed
  constants.ts  org seed (GPM/RCM trades), people, labels
  clock.ts      Manila-time formatting + demo clock
  excel.ts      ExcelJS template download; .xlsx/.csv upload reader
  view.ts       row/detail view models shared by tables and dialogs
src/components/ Shell (sidebar + filter bar), TaskTable, Dialogs (task details, hold, done), ui
src/app/        routes; industry.css = design-system stylesheet (copied from the design bundle's `_ds/industry-…/styles.css`)
supabase/migrations/0001_workload.sql  schema + atomic wl_start_work() (FOR UPDATE SKIP LOCKED)
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

1. Supabase project → apply `supabase/migrations/0001_workload.sql`; add RLS by team allocation.
2. Replace `initialData()` / `run()` in `store.tsx` with Supabase queries and RPCs
   (`wl_start_work` is ready; add take / hold / resume / done / assign the same way).
3. Entra ID SSO (replaces “view as”), availability from the Calendar module.
4. Microsoft Graph mailbox webhook → tasks (replaces “Check mailbox now”).
