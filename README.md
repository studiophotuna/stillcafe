# Still Café — Mobile Coffee Cart Booking

A booking website for a mobile coffee-cart business, modeled on the "Book an
Event" flow of a photography-studio site. Customers browse packages, book an
event, and pay online (GCash / card via **PayMongo**). An admin dashboard lets
the owner manage packages, bookings, and payment settings.

Built with **Next.js (App Router)**, **Supabase** (Postgres + Auth + Storage),
**Tailwind CSS**, and deployed on **Vercel**.

---

## Features

**Customer**
- Landing page with packages and a "How it works" section
- A **7-step Book-an-Event wizard** with a sidebar (what to expect, FAQ,
  support), modeled on the reference site's flow:
  1. Policies → 2. FAQ → 3. **Availability calendar** (booked dates disabled) →
  4. **Multi-select packages** + extra hours (with combo discount) →
  5. Event schedule (city, venue, address, maps) → 6. Contact + headcount +
  event type → 7. Terms
- A **live quote summary** that totals packages + overtime − combo discount and
  shows the deposit due now
- Online **deposit payment** via PayMongo (GCash, card, GrabPay, Maya)
- Booking confirmation with a reference number

**Admin** (`/admin`, Supabase email/password auth)
- Overview with booking stats and upcoming events
- Bookings list with status management
- **Packages CRUD** with image upload
- Settings: payment provider & methods, **deposit %, extra-hour price, combo
  discount, service area, standard coverage**

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Set up Supabase

Create a project at [supabase.com](https://supabase.com), then run the SQL in
order (SQL Editor, or the Supabase CLI):

1. `supabase/migrations/0001_init.sql` — tables, RLS, triggers
2. `supabase/migrations/0002_storage.sql` — package-images storage bucket
3. `supabase/migrations/0003_wizard.sql` — multi-package / wizard fields
4. `supabase/seed.sql` — *(optional)* sample packages

Create your admin user under **Authentication → Users → Add user** (email +
password). Anyone with a Supabase auth account can access `/admin`.

### 3. Configure environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (server-only) |
| `NEXT_PUBLIC_SITE_URL` | e.g. `http://localhost:3000` or your domain |
| `PAYMONGO_SECRET_KEY` | PayMongo → Developers → API Keys |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo → Developers → Webhooks |

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Admin lives at http://localhost:3000/admin.

---

## PayMongo setup

1. Create a PayMongo account and grab your **secret key** (`sk_test_…` for
   sandbox).
2. Enable the payment methods you want (GCash, cards, etc.) in the dashboard.
3. Add a **webhook** pointing to `{NEXT_PUBLIC_SITE_URL}/api/webhooks/paymongo`
   subscribed to `checkout_session.payment.paid` (and optionally
   `payment.failed`). Put the signing secret in `PAYMONGO_WEBHOOK_SECRET`.

The checkout flow uses PayMongo **Checkout Sessions**, so PayMongo hosts the
payment page — no card data touches this app. When a payment succeeds, the
webhook marks the booking `paid`.

> **Swapping providers:** payment logic lives behind a small interface in
> `src/lib/payments`. Implement `PaymentProvider` for another gateway, register
> it in `src/lib/payments/index.ts`, and it becomes selectable in admin
> Settings.

---

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add all the environment variables from `.env.example` in the Vercel project
   settings. Set `NEXT_PUBLIC_SITE_URL` to your production URL.
3. Update the PayMongo webhook URL to your production domain.

---

## Project structure

```
src/
  app/
    page.tsx                     Landing page
    book/                        Booking flow + confirmation/cancelled
    api/bookings/                Creates booking + payment checkout
    api/webhooks/paymongo/       Payment webhook receiver
    admin/
      login/                     Auth login (outside dashboard chrome)
      (dashboard)/               Protected admin pages
    actions.ts                   Admin server actions (CRUD)
  components/                    UI: site + booking + admin
  lib/
    supabase/                    browser / server / service-role clients
    payments/                    pluggable provider interface + PayMongo
    data.ts                      server data access
    format.ts, types.ts, auth.ts
supabase/
  migrations/                    schema + storage
  seed.sql                       sample packages
```

## Data model

- **packages** — the coffee-cart offerings (price, duration, inclusions, image)
- **bookings** — event bookings with one or more packages (`packages_snapshot`),
  extra hours, combo discount, venue/city/event-type, status, and a snapshot of
  the grand total
- **payments** — payment attempts per booking (provider ref, method, status)
- **settings** — single row: active provider, enabled methods, business info,
  deposit %, extra-hour price, combo discount, service area

Pricing is computed in one place (`src/lib/pricing.ts`) shared by the client's
live quote and the server's authoritative total, so they can never diverge.

Prices are stored in **centavos** (integers) to avoid floating-point issues.

## Security notes

- Row Level Security is on. Anon users can only read *active* packages and the
  public settings row. All writes and all booking/payment reads go through the
  server using the service-role key (never exposed to the browser).
- `/admin` is guarded by middleware; every admin mutation re-checks the session
  with `requireUser()`.
