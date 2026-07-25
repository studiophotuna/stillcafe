-- Optional sample packages so a fresh install isn't empty. Edit or delete
-- these from the admin (Packages) once you've added your own. Prices are in
-- the smallest currency unit (e.g. cents) — 15000 = 150.00.
insert into public.packages (name, slug, description, price_cents, deposit_cents, duration_hours, max_guests, inclusions, sort_order)
values
  (
    'Essentials',
    'essentials',
    'A great starting package for smaller events. Replace this description with what you actually offer.',
    15000, 5000, 3, 50,
    array['On-site staff','Everything you need for the day','Setup & teardown'],
    1
  ),
  (
    'Signature',
    'signature',
    'Our most popular option for weddings and larger gatherings. Describe what makes it special.',
    28000, 10000, 4, 120,
    array['Expanded service','A custom touch for your event','Extended coverage','Setup & teardown'],
    2
  ),
  (
    'Premium',
    'premium',
    'The full experience for bigger events and all-day coverage. Tell customers why it is worth it.',
    35000, 15000, 6, 200,
    array['Full-service package','Priority scheduling','All-day coverage','Setup & teardown'],
    3
  )
on conflict (slug) do nothing;
