# BookingCMS Setup Guide

A white-label event booking system built with Next.js, Supabase, and Tailwind CSS.

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)
- A [Vercel](https://vercel.com) account (free tier works) or any Node.js host
- A payment provider account: [Stripe](https://stripe.com), [PayPal](https://paypal.com), or [PayMongo](https://paymongo.com)
- (Optional) A [Resend](https://resend.com) account for email notifications (free tier: 100 emails/day)

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Service Role Key** (Settings > API)
3. Note your **Anon Key** (Settings > API)

## 2. Run the Database Schema

The entire database lives in **one file**. In the Supabase SQL Editor (or via
CLI), run:

```
supabase/schema.sql
```

The file is fully idempotent (`IF NOT EXISTS` / `ON CONFLICT` guards), so it
works on a fresh project and can be re-run any time to bring an existing
database up to date. All future schema changes are merged into this same
file — there are no separate migration files.

## 3. Create Storage Buckets

In Supabase Storage, create two **public** buckets:

- `package-images` — for package photos
- `site-assets` — for logo and background images

Make both buckets public:

```sql
-- Run in SQL Editor
CREATE POLICY "Public read" ON storage.objects FOR SELECT USING (bucket_id IN ('package-images', 'site-assets'));
CREATE POLICY "Auth upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id IN ('package-images', 'site-assets'));
```

## 4. Set Up Authentication

1. Go to Authentication > Settings in Supabase
2. Enable **Email** sign-in (disable "Confirm email" for simplicity)
3. Create your admin user: Authentication > Users > Add User

## 5. Deploy to Vercel

1. Push this repo to your GitHub account
2. Import the repo in [Vercel](https://vercel.com/new)
3. Set the following environment variables:

| Variable | Value | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Yes |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL (e.g. `https://yourdomain.com`) | Yes |
| `RESEND_API_KEY` | Your Resend API key | No |
| `EMAIL_FROM` | Sender email (e.g. `bookings@yourdomain.com`) | No |

4. Deploy

## 6. Configure Your Business

1. Go to `yourdomain.com/admin/login` and sign in
2. **Settings** — Set your business name, email, pricing rules, guest limits, event types
3. **Site** — Customize branding: logo, colors, hero text, background images, FAQs, policies
4. **Packages** — Add your service packages with pricing and images
5. **Settings > Payment Providers** — Enter your Stripe, PayPal, or PayMongo keys

## 7. Set Up Payments

### PayMongo

1. Get API keys from [PayMongo Dashboard](https://dashboard.paymongo.com)
2. In admin Settings > Payment Providers, enter:
   - **Public Key**: `pk_live_...`
   - **Secret Key**: `sk_live_...`
   - **Webhook Secret**: Create a webhook in PayMongo pointing to `yourdomain.com/api/webhooks/paymongo`
3. Toggle "Active"

### Stripe

1. Get API keys from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. In admin Settings > Payment Providers, enter:
   - **Public Key**: `pk_live_...`
   - **Secret Key**: `sk_live_...`
   - **Webhook Secret**: Create a webhook in Stripe pointing to `yourdomain.com/api/webhooks/stripe` (listen for `checkout.session.completed`)
3. Toggle "Active"

### PayPal

1. Create a REST API app at [PayPal Developer](https://developer.paypal.com) > Apps & Credentials
2. In admin Settings > Payment Providers, enter:
   - **Client ID** and **Secret** from your app
   - **Webhook ID**: Create a webhook pointing to `yourdomain.com/api/webhooks/paypal` (subscribe to payment capture events)
   - Choose **Sandbox** or **Live**
3. Toggle "Active"

You can keep several providers active at once — each checkout method is routed
to the first active provider that supports it.

## 8. Email Notifications (Optional)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain or use their test domain
3. Get your API key and add `RESEND_API_KEY` to Vercel env vars
4. Set `EMAIL_FROM` to your verified sender address
5. Redeploy

Emails are sent automatically when:
- A customer makes a new booking (confirmation to customer + notification to admin)
- An admin changes a booking status (update to customer)

If `RESEND_API_KEY` is not set, the system works fine without emails.

## Customization

### Colors

All colors are configurable in admin Site settings. The 7 theme colors are:
- **Primary** — buttons, active states, calendar selection
- **Accent** — links, secondary actions
- **Page background** — main background color
- **Text** — body text
- **Surface** — cards, panels
- **Border** — dividers, input borders
- **Highlight** — emphasis, tags

### Content

Everything is editable in the admin panel:
- Brand name, tagline, description
- Logo and background images
- Booking page hero text
- Sidebar content and FAQs
- Footer text and policies
- Event types, guest limits, service area

### Currency & Locale

Set in Settings. The locale affects how currency and dates are formatted throughout the site.

## Architecture

- **Framework**: Next.js 14 (App Router, Server Components)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/password)
- **Storage**: Supabase Storage (images)
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Payments**: Stripe, PayPal, or PayMongo (configurable; several can be active, with per-method routing)
- **Emails**: Resend (optional)
- **Hosting**: Vercel (recommended) or any Node.js host

## Support

If you have questions about setup, open an issue on the repository.
