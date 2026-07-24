import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Booking,
  Package,
  Payment,
  PaymentConfig,
  Settings,
  SiteContent,
} from "@/lib/types";

export async function getActivePackages(): Promise<Package[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAllPackages(): Promise<Package[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPackageBySlug(slug: string): Promise<Package | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPackageById(id: string): Promise<Package | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBookingByReference(
  reference: string
): Promise<Booking | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAllBookings(): Promise<Booking[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPaymentsForBooking(
  bookingId: string
): Promise<Payment[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSettings(): Promise<Settings> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (
    data ?? {
      id: 1,
      payment_provider: "paymongo",
      payment_methods: ["gcash", "card"],
      business_name: "My Business",
      business_email: null,
      currency: "PHP",
      deposit_percent: 50,
      combo_discount_cents: 250000,
      combo_min_packages: 2,
      extra_hour_cents: 150000,
      standard_hours: 3,
      service_area: "Metro Manila",
      service_cities: [],
      reference_prefix: "BK",
      min_guests: 1,
      max_guests: 500,
      event_types: ["Wedding", "Birthday", "Corporate event", "Other"],
      locale: "en-US",
      updated_at: new Date().toISOString(),
    }
  );
}

export async function getSiteContent(): Promise<SiteContent> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("site_content")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  const fallback: SiteContent = {
    id: 1,
    logo_url: null,
    brand_name: "My Business",
    tagline: "Your tagline here",
    description: "Welcome to our business.",
    cta_text: "Book Now",
    footer_tagline: "Available for bookings",
    copyright_text: "© My Business",
    bg_mode: "carousel",
    bg_images: [],
    bg_static_image: null,
    bg_overlay_color: "#5c1f1a",
    bg_overlay_opacity: 80,
    booking_hero_label: "Event Booking",
    booking_hero_title: "Let’s get your event booked",
    booking_hero_subtitle:
      "Pick a date, choose your setup, and we’ll handle the rest.",
    sidebar_title: "What you get",
    sidebar_description: "A complete professional setup for your event.",
    sidebar_faqs: [
      { question: "Does this form lock in my date?", answer: "Not yet. Your date is reserved once the deposit goes through." },
      { question: "When do you show up?", answer: "We arrive early to set everything up and test the equipment." },
      { question: "How do I pay?", answer: "The deposit is paid online. The remaining balance is due on or before the event day." },
    ],
    policies: [
      "We currently serve {service_area} only.",
      "A {deposit_percent}% deposit is needed to lock in your date.",
    ],
    wizard_faqs: [
      { question: "Does this form confirm my date?", answer: "Not yet. Your date is only locked once the {deposit_percent}% deposit is paid." },
      { question: "How many guests can I have?", answer: "We can handle anywhere from 20 to 500." },
      { question: "Can I cancel after paying?", answer: "The deposit is non-refundable, but you can move to another available date." },
      { question: "What if we go overtime?", answer: "You can add extra hours during booking, or we can arrange it before your event." },
    ],
    color_primary: "#5c1f1a",
    color_accent: "#6f4e37",
    color_page_bg: "#faf6f0",
    color_text: "#2c1e14",
    color_surface: "#f0e6d8",
    color_border: "#e8ddd0",
    color_highlight: "#c08457",
    color_card: "#ffffff",
    social_instagram: "",
    social_facebook: "",
    social_tiktok: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!data) return fallback;
  return { ...fallback, ...data };
}

export async function getPaymentConfigs(): Promise<PaymentConfig[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payment_configs")
    .select("*")
    .order("provider", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getActivePaymentConfig(): Promise<PaymentConfig | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payment_configs")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBookedDates(): Promise<string[]> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("bookings")
    .select("event_date")
    .in("status", ["confirmed", "paid", "completed"])
    .gte("event_date", today);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.event_date as string)));
}
