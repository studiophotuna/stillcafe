-- Extend schema to support the multi-step booking wizard:
-- multiple packages, extra hours, combo discount, detailed venue fields,
-- event type, and percentage-based deposits.

-- ---- bookings ----
alter table public.bookings
  add column if not exists package_ids        uuid[] not null default '{}',
  add column if not exists packages_snapshot  jsonb  not null default '[]',
  add column if not exists extra_hours         integer not null default 0,
  add column if not exists extra_hours_cents   integer not null default 0,
  add column if not exists combo_discount_cents integer not null default 0,
  add column if not exists venue_city          text,
  add column if not exists venue_name          text,
  add column if not exists venue_address       text,
  add column if not exists maps_link           text,
  add column if not exists event_type          text;

-- package_id may now be null when multiple packages are chosen; the combined
-- list lives in packages_snapshot / package_ids. package_name holds a
-- human-readable combined label and package_price_cents holds the grand total.

-- ---- settings ----
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
  ]::text[];
