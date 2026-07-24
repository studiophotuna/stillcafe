-- ============================================================================
-- BookingCMS — complete database schema (single file)
--
-- This is the ONLY SQL file for the project. All schema changes are merged
-- into this file — do not add separate migration files. Every statement is
-- idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE),
-- so the whole file can be run safely on a fresh database OR re-run on an
-- existing one to bring it up to date.
--
-- Run it in the Supabase SQL Editor (paste and execute) or via the CLI.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- updated_at trigger function (search_path pinned against injection)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- packages : the offerings an admin manages
-- ----------------------------------------------------------------------------
create table if not exists public.packages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  description   text not null default '',
  -- Price stored in centavos (PHP). e.g. 1500000 = ₱15,000.00
  price_cents   integer not null default 0,
  -- Optional deposit required to confirm a booking (centavos). 0 = full payment.
  deposit_cents integer not null default 0,
  duration_hours numeric(4,1) not null default 2,
  max_guests    integer,
  inclusions    text[] not null default '{}',
  image_url     text,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists packages_active_idx on public.packages (is_active, sort_order);

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at before update on public.packages
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- bookings : an event-booking request from a customer
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique not null,
  package_id     uuid references public.packages (id) on delete set null,
  -- snapshot of package details at time of booking; package_name holds a
  -- human-readable combined label and package_price_cents the grand total
  package_name   text not null,
  package_price_cents integer not null default 0,
  package_ids        uuid[] not null default '{}',
  packages_snapshot  jsonb  not null default '[]',
  extra_hours          integer not null default 0,
  extra_hours_cents    integer not null default 0,
  combo_discount_cents integer not null default 0,

  -- customer
  customer_name  text not null,
  customer_email text not null,
  customer_phone text not null,

  -- event
  event_date     date not null,
  event_time     time,
  event_duration_hours numeric(4,1),
  event_location text not null,
  venue_city     text,
  venue_name     text,
  venue_address  text,
  maps_link      text,
  event_type     text,
  timezone       text,
  guest_count    integer,
  notes          text not null default '',

  -- amounts (centavos)
  amount_due_cents  integer not null default 0,
  amount_paid_cents integer not null default 0,

  status         text not null default 'pending'
                 check (status in ('pending','confirmed','paid','completed','cancelled')),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists bookings_status_idx on public.bookings (status, event_date);
create index if not exists bookings_created_idx on public.bookings (created_at desc);

-- Prevent double-booking the same date.
create unique index if not exists bookings_unique_active_date
  on public.bookings (event_date)
  where status in ('confirmed', 'paid', 'completed');

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- payments : payment attempts against a booking
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings (id) on delete cascade,
  provider          text not null default 'paymongo',
  -- e.g. 'gcash', 'card', 'grab_pay', 'paypal'
  method            text,
  amount_cents      integer not null default 0,
  currency          text not null default 'PHP',
  status            text not null default 'pending'
                    check (status in ('pending','paid','failed','refunded','cancelled')),
  -- provider identifiers (checkout session id, order id, etc.)
  provider_ref      text,
  provider_metadata jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists payments_booking_idx on public.payments (booking_id);
create unique index if not exists payments_provider_ref_idx on public.payments (provider_ref) where provider_ref is not null;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- settings : single-row app settings (id = 1)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  id                 integer primary key default 1 check (id = 1),
  payment_provider   text not null default 'paymongo',
  -- which methods the customer can choose at checkout
  payment_methods    text[] not null default array['gcash','card'],
  business_name      text not null default 'My Business',
  business_email     text,
  currency           text not null default 'PHP',
  deposit_percent      integer not null default 50,
  combo_discount_cents integer not null default 250000,
  combo_min_packages   integer not null default 2,
  extra_hour_cents     integer not null default 150000,
  standard_hours       numeric(4,1) not null default 3,
  service_area         text not null default 'Metro Manila',
  service_cities       text[] not null default array[
    'Manila','Makati','Taguig','Pasig','Quezon City','Mandaluyong','San Juan',
    'Pasay','Paranaque','Muntinlupa','Las Pinas','Marikina','Caloocan'
  ]::text[],
  reference_prefix text not null default 'BK',
  min_guests       integer not null default 1,
  max_guests       integer not null default 500,
  event_types      text[] not null default array['Wedding','Birthday','Corporate event','Holiday party','Other'],
  locale           text not null default 'en-US',
  updated_at         timestamptz not null default now()
);

-- Columns for databases created before this consolidated file existed.
alter table public.settings
  add column if not exists deposit_percent      integer not null default 50,
  add column if not exists combo_discount_cents integer not null default 250000,
  add column if not exists combo_min_packages   integer not null default 2,
  add column if not exists extra_hour_cents     integer not null default 150000,
  add column if not exists standard_hours       numeric(4,1) not null default 3,
  add column if not exists service_area         text not null default 'Metro Manila',
  add column if not exists service_cities       text[] not null default array[
    'Manila','Makati','Taguig','Pasig','Quezon City','Mandaluyong','San Juan',
    'Pasay','Paranaque','Muntinlupa','Las Pinas','Marikina','Caloocan'
  ]::text[],
  add column if not exists reference_prefix text not null default 'BK',
  add column if not exists min_guests       integer not null default 1,
  add column if not exists max_guests       integer not null default 500,
  add column if not exists event_types      text[] not null default array['Wedding','Birthday','Corporate event','Holiday party','Other'],
  add column if not exists locale           text not null default 'en-US';

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- site_content : single-row CMS content (id = 1) — branding, background,
-- theme, typography, navigation pages, booking copy
-- ----------------------------------------------------------------------------
create table if not exists public.site_content (
  id integer primary key default 1 check (id = 1),

  -- branding
  logo_url          text,
  brand_name        text not null default 'My Business',
  tagline           text not null default 'Your tagline here',
  description       text not null default 'Welcome to our business. We provide quality services for your events and special occasions. Professional setup, great experience, no hassle on your end.',
  cta_text          text not null default 'Book Now',
  footer_tagline    text not null default 'Available for bookings',
  copyright_text    text not null default '© My Business',

  -- background
  bg_mode           text not null default 'carousel' check (bg_mode in ('carousel', 'static')),
  bg_images         text[] not null default '{}',
  bg_static_image   text,
  bg_overlay_color  text not null default '#5c1f1a',
  bg_overlay_opacity integer not null default 80,

  -- booking page hero (legacy, kept for compatibility)
  booking_hero_label    text not null default 'Event Booking',
  booking_hero_title    text not null default 'Let''s get your event booked',
  booking_hero_subtitle text not null default 'Pick a date, choose your setup, and we''ll handle the rest. Takes about 5 minutes.',

  -- booking sidebar (legacy, kept for compatibility)
  sidebar_title       text not null default 'What you get',
  sidebar_description text not null default 'A complete professional setup for your event. We handle everything from start to finish so you can focus on your guests.',
  sidebar_faqs        jsonb not null default '[]'::jsonb,

  -- wizard policies (Good to know step)
  policies text[] not null default array[
    'We currently serve {service_area} only.',
    'A {deposit_percent}% deposit is needed to lock in your date. Without it, the date stays open for others.',
    'We arrive early to set up and test everything, so you don''t have to worry about a thing.',
    'You get a full professional setup and all the equipment. Setup and teardown are included.'
  ]::text[],

  -- wizard FAQs (Quick FAQ step)
  wizard_faqs jsonb not null default '[
    {"question": "Does this form confirm my date?", "answer": "Not yet. Your date is only locked once the {deposit_percent}% deposit is paid."},
    {"question": "How many guests can I have?", "answer": "We can handle anywhere from 20 to 500. Just give us your best estimate."},
    {"question": "Can I cancel after paying?", "answer": "The deposit is non-refundable, but you can move to another available date."},
    {"question": "What if we go overtime?", "answer": "You can add extra hours during booking, or we can arrange it before your event."}
  ]'::jsonb,

  -- theme colors
  color_primary     text not null default '#5c1f1a',
  color_accent      text not null default '#6f4e37',
  color_page_bg     text not null default '#faf6f0',
  color_text        text not null default '#2c1e14',
  color_surface     text not null default '#f0e6d8',
  color_border      text not null default '#e8ddd0',
  color_highlight   text not null default '#c08457',
  color_card        text not null default '#ffffff',

  -- social links
  social_instagram text not null default '',
  social_facebook  text not null default '',
  social_tiktok    text not null default '',

  -- typography
  font_display     text not null default 'DM Serif Display',
  font_body        text not null default 'DM Sans',
  font_size_base   integer not null default 16,
  font_weight_body integer not null default 400,

  -- landing page navigation pages (label + slide-over panel content)
  nav_pages jsonb not null default '[
    {"label": "About", "title": "About us", "content": "We bring a full mobile espresso bar to your event. Premium beans, a friendly barista, and a setup that looks as good as the coffee tastes.", "sections": []},
    {"label": "FAQ", "title": "Frequently asked questions", "content": "", "sections": [
      {"heading": "How far in advance should I book?", "body": "As early as possible - popular dates fill up fast."},
      {"heading": "Do you need power at the venue?", "body": "One standard outlet is enough for our setup."}
    ]}
  ]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columns for databases created before this consolidated file existed.
alter table public.site_content
  add column if not exists color_primary     text not null default '#5c1f1a',
  add column if not exists color_accent      text not null default '#6f4e37',
  add column if not exists color_page_bg     text not null default '#faf6f0',
  add column if not exists color_text        text not null default '#2c1e14',
  add column if not exists color_surface     text not null default '#f0e6d8',
  add column if not exists color_border      text not null default '#e8ddd0',
  add column if not exists color_highlight   text not null default '#c08457',
  add column if not exists color_card        text not null default '#ffffff',
  add column if not exists social_instagram  text not null default '',
  add column if not exists social_facebook   text not null default '',
  add column if not exists social_tiktok     text not null default '',
  add column if not exists font_display      text not null default 'DM Serif Display',
  add column if not exists font_body         text not null default 'DM Sans',
  add column if not exists font_size_base    integer not null default 16,
  add column if not exists font_weight_body  integer not null default 400,
  add column if not exists nav_pages         jsonb not null default '[
    {"label": "About", "title": "About us", "content": "We bring a full mobile espresso bar to your event. Premium beans, a friendly barista, and a setup that looks as good as the coffee tastes.", "sections": []},
    {"label": "FAQ", "title": "Frequently asked questions", "content": "", "sections": [
      {"heading": "How far in advance should I book?", "body": "As early as possible - popular dates fill up fast."},
      {"heading": "Do you need power at the venue?", "body": "One standard outlet is enough for our setup."}
    ]}
  ]'::jsonb;

insert into public.site_content (id) values (1) on conflict (id) do nothing;

drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- payment_configs : one row per payment provider. Multiple providers can be
-- active at once; each checkout method is routed to the first active
-- provider that supports it.
-- ----------------------------------------------------------------------------
create table if not exists public.payment_configs (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null unique,
  display_name   text not null,
  public_key     text,
  secret_key     text,
  webhook_secret text,
  is_active      boolean not null default false,
  supported_methods text[] not null default '{}',
  config         jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists payment_configs_set_updated_at on public.payment_configs;
create trigger payment_configs_set_updated_at before update on public.payment_configs
  for each row execute function public.set_updated_at();

-- seed provider rows (inactive until keys are entered)
insert into public.payment_configs (provider, display_name, supported_methods, config)
values
  ('paymongo', 'PayMongo', array['gcash','card','grab_pay','paymaya'], '{}'::jsonb),
  ('stripe',   'Stripe',   array['card'],                              '{}'::jsonb),
  ('paypal',   'PayPal',   array['paypal'],                            '{"mode": "sandbox"}'::jsonb)
on conflict (provider) do nothing;

-- ----------------------------------------------------------------------------
-- Storage buckets (public read via public URLs; writes are server-side with
-- the service-role key). No broad SELECT policy on storage.objects: that
-- would let clients list bucket contents, which isn't needed.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('package-images', 'package-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "package images public read" on storage.objects;

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Public (anon) users may:
--   * read active packages
--   * read the public settings row
--   * read the site content row
-- Everything else (writes, reading bookings/payments/payment_configs) is
-- denied to anon/auth and performed only by the server using the
-- service-role key, which bypasses RLS.
-- ----------------------------------------------------------------------------
alter table public.packages enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.settings enable row level security;
alter table public.site_content enable row level security;
alter table public.payment_configs enable row level security;

drop policy if exists "packages public read" on public.packages;
create policy "packages public read" on public.packages
  for select using (is_active = true);

drop policy if exists "settings public read" on public.settings;
create policy "settings public read" on public.settings
  for select using (true);

drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read" on public.site_content
  for select using (true);

-- bookings, payments, payment_configs: RLS enabled with no policies =
-- all anon/authenticated access denied; service-role only.
