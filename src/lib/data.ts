import { createAdminClient } from "@/lib/supabase/admin";
import type { Booking, Package, Payment, Settings } from "@/lib/types";

/**
 * Server-side data access using the service-role client. Import only from
 * server components, server actions, and route handlers.
 */

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
  // Fall back to sane defaults if the row is somehow missing.
  return (
    data ?? {
      id: 1,
      payment_provider: "paymongo",
      payment_methods: ["gcash", "card"],
      business_name: "Still Café",
      business_email: null,
      currency: "PHP",
      deposit_percent: 50,
      combo_discount_cents: 250000,
      combo_min_packages: 2,
      extra_hour_cents: 150000,
      standard_hours: 3,
      service_area: "Metro Manila",
      service_cities: [
        "Manila",
        "Makati",
        "Taguig",
        "Pasig",
        "Quezon City",
        "Mandaluyong",
        "San Juan",
        "Pasay",
        "Paranaque",
        "Muntinlupa",
        "Las Pinas",
        "Marikina",
        "Caloocan",
      ],
      updated_at: new Date().toISOString(),
    }
  );
}

/**
 * Dates that already have a reserved booking (confirmed/paid/completed), so the
 * availability calendar can mark them as unavailable. Only future dates.
 */
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
