-- Sample coffee-cart packages for local development / first run.
insert into public.packages (name, slug, description, price_cents, deposit_cents, duration_hours, max_guests, inclusions, sort_order)
values
  (
    'The Espresso Bar',
    'espresso-bar',
    'Our signature mobile espresso bar for intimate gatherings. A barista, a beautiful cart, and unlimited handcrafted espresso drinks.',
    1500000, 500000, 3, 50,
    array['1 professional barista','Unlimited espresso-based drinks','Choice of dairy & plant milks','Cups, lids & napkins','Setup & teardown'],
    1
  ),
  (
    'The Celebration Cart',
    'celebration-cart',
    'Perfect for weddings and larger events. Two baristas keep the queue moving with specialty drinks and a custom menu board.',
    2800000, 1000000, 4, 120,
    array['2 professional baristas','Custom signature drink','Unlimited espresso & brewed coffee','Iced & hot options','Branded menu board','Setup & teardown'],
    2
  ),
  (
    'The Corporate Brew',
    'corporate-brew',
    'Keep your team caffeinated. A half-day cart service tailored for offices, conferences, and corporate activations.',
    3500000, 1500000, 6, 200,
    array['2 professional baristas','Full espresso & drip menu','Company-branded cups (optional)','Morning & afternoon service','Setup & teardown'],
    3
  )
on conflict (slug) do nothing;
