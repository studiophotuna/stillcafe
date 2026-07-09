-- Still Café — coffee cart booking system
-- Initial schema: packages, bookings, payments, settings

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- packages : the coffee-cart offerings an admin manages
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- bookings : an event-booking request from a customer
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique not null,
  package_id     uuid references public.packages (id) on delete set null,
  -- snapshot of package details at time of booking
  package_name   text not null,
  package_price_cents integer not null default 0,

  -- customer
  customer_name  text not null,
  customer_email text not null,
  customer_phone text not null,

  -- event
  event_date     date not null,
  event_time     time,
  event_duration_hours numeric(4,1),
  event_location text not null,
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

-- ---------------------------------------------------------------------------
-- payments : payment attempts against a booking (via a provider like PayMongo)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings (id) on delete cascade,
  provider          text not null default 'paymongo',
  -- e.g. 'gcash', 'card', 'grab_pay'
  method            text,
  amount_cents      integer not null default 0,
  currency          text not null default 'PHP',
  status            text not null default 'pending'
                    check (status in ('pending','paid','failed','refunded','cancelled')),
  -- provider identifiers (checkout session id, payment id, etc.)
  provider_ref      text,
  provider_metadata jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists payments_booking_idx on public.payments (booking_id);
create unique index if not exists payments_provider_ref_idx on public.payments (provider_ref) where provider_ref is not null;

-- ---------------------------------------------------------------------------
-- settings : single-row app settings (active payment provider, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                 integer primary key default 1 check (id = 1),
  payment_provider   text not null default 'paymongo',
  -- which methods the customer can choose at checkout
  payment_methods    text[] not null default array['gcash','card'],
  business_name      text not null default 'Still Café',
  business_email     text,
  currency           text not null default 'PHP',
  updated_at         timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at before update on public.packages
  for each row execute function public.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Public (anon) users may:
--   * read active packages
--   * read the public settings row
-- Everything else (writes, reading bookings/payments) is denied to anon/auth
-- and performed only by the server using the service-role key, which bypasses
-- RLS. Admin dashboard reads/writes go through server actions/route handlers
-- using the service role. This keeps customer data private by default.
-- ---------------------------------------------------------------------------
alter table public.packages enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.settings enable row level security;

drop policy if exists "packages public read" on public.packages;
create policy "packages public read" on public.packages
  for select using (is_active = true);

drop policy if exists "settings public read" on public.settings;
create policy "settings public read" on public.settings
  for select using (true);
