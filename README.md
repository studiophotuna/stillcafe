# Booking CMS — Event & Service Booking System

A complete, self-hosted booking website for any appointment- or event-based
business — catering, photography, mobile bars, rentals, salons, planners, and
more. Customers browse your packages, pick a date, and pay a deposit online. A
full admin panel lets you run everything without touching code: branding,
colors, fonts, page text, packages, bookings, and payments.

Built with **Next.js (App Router)**, **Supabase** (Postgres + Auth + Storage),
and **Tailwind CSS**. Deploys to **Vercel** (free tier works).

---

## Features

**Customer**
- Full-screen landing page with your logo, tagline, background photo/carousel,
  and social links
- A guided **booking flow** in a slide-over panel: policies → FAQ →
  availability calendar (booked dates disabled) → multi-select packages + extra
  hours → event details → contact → review & pay
- A **live "Your booking" summary** with the running total and deposit due
- Online **deposit payment** with a hosted, secure checkout
- **Check status** slide-over so customers can look up their booking anytime
- Booking confirmation with a reference number (optional email receipts)

**Admin** (`/admin`, secure email/password login)
- Overview with booking stats, upcoming events, and recent activity
- Bookings list and calendar with status management
- **Packages** with image upload
- **Site editor** — fully white-label with no code:
  - Branding (logo, tagline, copyright), background, social links
  - Theme colors, fonts, per-element text sizes, bold/italic
  - Editable page copy (buttons, wizard step titles, confirmation text) and
    navigation pages
- **Settings** — business info, deposit %, extra-hour price, combo discount,
  guest limits, event types, currency & locale, checkout methods
- **Payments** — Stripe, PayPal, and PayMongo, each configurable in the admin,
  with per-method routing (multiple providers can be active at once)

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Set up Supabase

Create a free project at [supabase.com](https://supabase.com), open the **SQL
Editor**, and run:

1. `supabase/schema.sql` — the complete database in one idempotent file
   (tables, columns, security policies, triggers, storage buckets). Safe to
   run on a fresh project and safe to re-run later.
2. `supabase/seed.sql` — *(optional)* three sample packages so the site isn't
   empty on first run. Edit or delete them from the admin.

Create your admin login under **Authentication → Users → Add user** (email +
password). Anyone with a Supabase auth account here can sign in to `/admin`.

### 3. Configure environment

Copy `.env.example` to `.env.local` and fill in the required values (Supabase
keys + your site URL). Payment keys are optional here — the recommended place
to enter them is the admin panel.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. The admin lives at http://localhost:3000/admin.

---

## Payments

Configure providers in **Admin → Settings → Payment providers** — no code or
env vars required. Enter your keys for **Stripe**, **PayPal**, and/or
**PayMongo**, mark the ones you want active, and choose which checkout methods
customers can use. Each method is routed to the first active provider that
supports it, so you can run more than one gateway at once.

For each provider, add a webhook in its dashboard pointing to
`{your-site}/api/webhooks/<provider>` (e.g. `/api/webhooks/stripe`) and paste
the signing secret / webhook ID into the admin. Checkout is always hosted by
the provider, so no card data touches this app.

> **Adding a provider:** payment logic lives behind a small interface in
> `src/lib/payments`. Implement `PaymentProvider` for another gateway and
> register it in `src/lib/payments/index.ts`.

---

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add the environment variables from `.env.example` (Supabase keys +
   `NEXT_PUBLIC_SITE_URL` set to your production URL) in the Vercel project
   settings.
3. Point each payment provider's webhook at your production domain.

---

## Customizing it for your business

Almost everything is editable from **Admin → Site** and **Admin → Settings** —
no code changes needed:

- Business name, logo, tagline, colors, fonts, and page text
- Packages, pricing, deposit %, currency, guest limits, event types
- Service cities (leave empty to let customers type their own city)

---

## Project structure

```
src/
  app/
    page.tsx                     Landing page
    book/                        Booking flow + confirmation / cancelled / status
    api/bookings/                Creates booking + payment checkout
    api/webhooks/<provider>/     Payment webhook receivers
    admin/                       Login + protected dashboard + server actions
  components/                    UI: landing + booking + admin
  lib/
    supabase/                    browser / server / service-role clients
    payments/                    pluggable provider interface (Stripe/PayPal/PayMongo)
    copy.ts, text-sizes.ts, text-styles.ts, fonts.ts   white-label helpers
    data.ts, pricing.ts, format.ts, types.ts, auth.ts
supabase/
  schema.sql                     complete schema in one idempotent file
  seed.sql                       optional sample packages
```

## Notes

- Pricing is computed in one place (`src/lib/pricing.ts`) shared by the
  customer's live quote and the server's authoritative total, so they can never
  diverge. Prices are stored as integers in the smallest currency unit.
- **Security:** Row Level Security is on. Anonymous visitors can only read
  active packages and public site content; all writes and all booking/payment
  reads go through the server using the service-role key, which is never exposed
  to the browser. `/admin` is guarded by middleware and every admin action
  re-checks the session.
