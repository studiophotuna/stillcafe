-- CMS-managed site content: branding, background, booking section text.
-- Single-row pattern (id = 1) matching the settings table.

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

  -- booking page hero
  booking_hero_label    text not null default 'Event Booking',
  booking_hero_title    text not null default 'Let''s get your event booked',
  booking_hero_subtitle text not null default 'Pick a date, choose your setup, and we''ll handle the rest. Takes about 5 minutes.',

  -- booking sidebar
  sidebar_title       text not null default 'What you get',
  sidebar_description text not null default 'A complete professional setup for your event. We handle everything from start to finish so you can focus on your guests.',
  sidebar_faqs        jsonb not null default '[
    {"question": "Does this form lock in my date?", "answer": "Not yet. Your date is reserved once the deposit goes through."},
    {"question": "When do you show up?", "answer": "We arrive early to set everything up and test the equipment."},
    {"question": "How do I pay?", "answer": "The deposit is paid online. The remaining balance is due on or before the event day."}
  ]'::jsonb,

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

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.site_content (id) values (1) on conflict (id) do nothing;

-- RLS: public read, server-only write
alter table public.site_content enable row level security;

drop policy if exists "site_content public read" on public.site_content;
create policy "site_content public read" on public.site_content
  for select using (true);

-- updated_at trigger
drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

-- Storage bucket for site assets (logo, background images)
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;
