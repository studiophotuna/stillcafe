-- Theme color customization and multi-provider payment support.

-- ---- theme colors on site_content ----
alter table public.site_content
  add column if not exists color_primary     text not null default '#5c1f1a',
  add column if not exists color_accent      text not null default '#6f4e37',
  add column if not exists color_page_bg     text not null default '#faf6f0',
  add column if not exists color_text        text not null default '#2c1e14',
  add column if not exists color_surface     text not null default '#f0e6d8',
  add column if not exists color_border      text not null default '#e8ddd0',
  add column if not exists color_highlight   text not null default '#c08457';

-- ---- payment_configs: one row per provider ----
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

alter table public.payment_configs enable row level security;

drop trigger if exists payment_configs_set_updated_at on public.payment_configs;
create trigger payment_configs_set_updated_at before update on public.payment_configs
  for each row execute function public.set_updated_at();

-- seed provider rows (inactive until keys are entered)
insert into public.payment_configs (provider, display_name, supported_methods)
values
  ('paymongo', 'PayMongo', array['gcash','card','grab_pay','paymaya']),
  ('stripe',   'Stripe',   array['card'])
on conflict (provider) do nothing;
