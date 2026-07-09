import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/data";
import { getPaymentProvider } from "@/lib/payments";
import { generateReference } from "@/lib/reference";
import type { PaymentMethod } from "@/lib/types";

export const runtime = "nodejs";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

export async function POST(req: Request) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    package_id,
    method,
    event_date,
    event_time,
    event_location,
    guest_count,
    customer_name,
    customer_email,
    customer_phone,
    notes,
  } = payload ?? {};

  // ---- validate ----
  if (!package_id) return bad("Missing package.");
  if (!event_date) return bad("Missing event date.");
  if (!event_location?.trim()) return bad("Missing event location.");
  if (!customer_name?.trim()) return bad("Missing name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email ?? ""))
    return bad("Invalid email.");
  if (!customer_phone?.trim()) return bad("Missing contact number.");

  const supabase = createAdminClient();

  // ---- load package (server-trusted pricing) ----
  const { data: pkg, error: pkgErr } = await supabase
    .from("packages")
    .select("*")
    .eq("id", package_id)
    .eq("is_active", true)
    .maybeSingle();

  if (pkgErr) return bad("Could not load package.", 500);
  if (!pkg) return bad("Selected package is unavailable.");

  if (pkg.max_guests && guest_count && Number(guest_count) > pkg.max_guests) {
    return bad(`This package serves up to ${pkg.max_guests} guests.`);
  }

  const settings = await getSettings();
  const chosenMethod: PaymentMethod = settings.payment_methods.includes(method)
    ? method
    : settings.payment_methods[0] ?? "gcash";

  const dueCents = pkg.deposit_cents > 0 ? pkg.deposit_cents : pkg.price_cents;
  const reference = generateReference();

  // ---- create booking ----
  const { data: booking, error: bookErr } = await supabase
    .from("bookings")
    .insert({
      reference,
      package_id: pkg.id,
      package_name: pkg.name,
      package_price_cents: pkg.price_cents,
      customer_name: customer_name.trim(),
      customer_email: customer_email.trim(),
      customer_phone: customer_phone.trim(),
      event_date,
      event_time: event_time || null,
      event_duration_hours: pkg.duration_hours,
      event_location: event_location.trim(),
      guest_count: guest_count ? Number(guest_count) : null,
      notes: (notes ?? "").trim(),
      amount_due_cents: dueCents,
      status: "pending",
    })
    .select("*")
    .single();

  if (bookErr || !booking) {
    return bad("Could not create booking. Please try again.", 500);
  }

  // ---- create payment + provider checkout ----
  try {
    const provider = getPaymentProvider(settings.payment_provider);
    const checkout = await provider.createCheckout({
      bookingId: booking.id,
      reference: booking.reference,
      amountCents: dueCents,
      currency: settings.currency,
      description: `Still Café — ${pkg.name} (${booking.reference})`,
      customerName: booking.customer_name,
      customerEmail: booking.customer_email,
      customerPhone: booking.customer_phone,
      methods: [chosenMethod],
      successUrl: `${siteUrl()}/book/confirmation?ref=${booking.reference}`,
      cancelUrl: `${siteUrl()}/book/cancelled?ref=${booking.reference}`,
    });

    await supabase.from("payments").insert({
      booking_id: booking.id,
      provider: checkout.provider,
      method: chosenMethod,
      amount_cents: dueCents,
      currency: settings.currency,
      status: "pending",
      provider_ref: checkout.providerRef,
    });

    return NextResponse.json({
      reference: booking.reference,
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (e) {
    // Roll the booking back to a clean state so it isn't left orphaned.
    await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking.id);
    const message =
      e instanceof Error ? e.message : "Could not start payment.";
    return bad(message, 502);
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
