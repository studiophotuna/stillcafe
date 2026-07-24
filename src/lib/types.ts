export type Package = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  deposit_cents: number;
  duration_hours: number;
  max_guests: number | null;
  inclusions: string[];
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "paid"
  | "completed"
  | "cancelled";

export type PackageSnapshot = {
  id: string;
  name: string;
  price_cents: number;
};

export type Booking = {
  id: string;
  reference: string;
  package_id: string | null;
  package_ids: string[];
  packages_snapshot: PackageSnapshot[];
  package_name: string;
  package_price_cents: number;
  extra_hours: number;
  extra_hours_cents: number;
  combo_discount_cents: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  event_date: string;
  event_time: string | null;
  event_duration_hours: number | null;
  event_location: string;
  venue_city: string | null;
  venue_name: string | null;
  venue_address: string | null;
  maps_link: string | null;
  event_type: string | null;
  timezone: string | null;
  guest_count: number | null;
  notes: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
};

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "cancelled";

export type Payment = {
  id: string;
  booking_id: string;
  provider: string;
  method: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  provider_ref: string | null;
  provider_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PaymentMethod = "gcash" | "card" | "grab_pay" | "paymaya" | "link";

export type PaymentConfig = {
  id: string;
  provider: string;
  display_name: string;
  public_key: string | null;
  secret_key: string | null;
  webhook_secret: string | null;
  is_active: boolean;
  supported_methods: string[];
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type NavPageSection = {
  heading: string;
  body: string;
};

export type NavPage = {
  label: string;
  title: string;
  content: string;
  sections?: NavPageSection[];
};

export type SiteContent = {
  id: number;
  logo_url: string | null;
  brand_name: string;
  tagline: string;
  description: string;
  cta_text: string;
  footer_tagline: string;
  copyright_text: string;
  bg_mode: "carousel" | "static";
  bg_images: string[];
  bg_static_image: string | null;
  bg_overlay_color: string;
  bg_overlay_opacity: number;
  booking_hero_label: string;
  booking_hero_title: string;
  booking_hero_subtitle: string;
  sidebar_title: string;
  sidebar_description: string;
  sidebar_faqs: FaqItem[];
  policies: string[];
  wizard_faqs: FaqItem[];
  color_primary: string;
  color_accent: string;
  color_page_bg: string;
  color_text: string;
  color_surface: string;
  color_border: string;
  color_highlight: string;
  color_card: string;
  social_instagram: string;
  social_facebook: string;
  social_tiktok: string;
  font_display: string;
  font_body: string;
  font_size_base: number;
  font_weight_body: number;
  nav_pages: NavPage[];
  created_at: string;
  updated_at: string;
};

export type Settings = {
  id: number;
  payment_provider: string;
  payment_methods: PaymentMethod[];
  business_name: string;
  business_email: string | null;
  currency: string;
  deposit_percent: number;
  combo_discount_cents: number;
  combo_min_packages: number;
  extra_hour_cents: number;
  standard_hours: number;
  service_area: string;
  service_cities: string[];
  reference_prefix: string;
  min_guests: number;
  max_guests: number;
  event_types: string[];
  locale: string;
  updated_at: string;
};
