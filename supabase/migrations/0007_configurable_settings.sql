-- Make guest limits, event types, reference prefix, and locale configurable.

alter table public.settings
  add column if not exists reference_prefix text not null default 'BK',
  add column if not exists min_guests       integer not null default 1,
  add column if not exists max_guests       integer not null default 500,
  add column if not exists event_types      text[] not null default array['Wedding','Birthday','Corporate event','Holiday party','Other'],
  add column if not exists locale           text not null default 'en-US';

-- Store the customer's timezone alongside event time.
alter table public.bookings
  add column if not exists timezone text;

-- Add a partial unique index to prevent double-booking the same date.
create unique index if not exists bookings_unique_active_date
  on public.bookings (event_date)
  where status in ('confirmed', 'paid', 'completed');
