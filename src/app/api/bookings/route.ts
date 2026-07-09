import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/data";
import { getPaymentProvider } from "@/lib/payments";
import { generateReference } from "@/lib/reference";
import { computeQuote } from "@/lib/pricing";
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
    return bad("Invalid request.");
  }

  const {
    package_ids,
    extra_hours,
    method,
    date,
    time,
    venue_city,
    venue_name,
    venue_address,
    maps_link,
    event_type,
    guests,
    customer_name,
    customer_phone,
    customer_email,
    notes,
  } = payload ?? {};

  // ---- validate ----
  if (!Array.isArray(package_ids) || package_ids.length === 0)
    return bad("Please select at least one package.");
  if (!date) return bad("Missing event date.");
  if (!venue_city) return bad("Missing city.");
  if (!venue_name?.trim()) return bad("Missing venue name.");
  if (!venue_address?.trim()) return bad("Missing venue address.");
  if (!customer_name?.trim()) return bad("Missing name.");
  if (!/^[0-9+\-\s()]{7,}$/.test((customer_phone ?? "").trim()))
    return bad("Invalid contact number.");
  if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email))
    return bad("Invalid email.");
  const guestCount = Number(guests);
  if (!guestCount || guestCount < 20 || guestCount > 500)
    return bad("Estimated guests must be between 20 and 500.");
  if (!event_type) return bad("Missing event type.");

  const supabase = createAdminClient();

  // ---- ensure the date is still available ----
  const { data: clash } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_date", date)
    .in("status", ["confirmed", "paid", "completed"])
    .limit(1);
  if (clash && clash.length > 0)
    return bad("Sorry, that date was just booked. Please choose another.");

  // ---- load packages (server-trusted pricing) ----
  const { data: pkgs, error: pkgErr } = await supabase
    .from("packages")
    .select("*")
    .in("id", package_ids)
    .eq("is_active", true);

  if (pkgErr) return bad("Could not load packages.", 500);
  if (!pkgs || pkgs.length === 0)
    return bad("Selected packages are unavailable.");

  const settings = await getSettings();
  const quote = computeQuote(pkgs, Number(extra_hours) || 0, settings);

  const chosenMethod: PaymentMethod = settings.payment_methods.includes(method)
    ? method
    : (settings.payment_methods[0] ?? "gcash");

  const reference = generateReference();
  const combinedName = pkgs.map((p) => p.name).join(" + ");
  const snapshot = pkgs.map((p) => ({
    id: p.id,
    name: p.name,
    price_cents: p.price_cents,
  }));
  const totalHours =
    pkgs.reduce((max, p) => Math.max(max, Number(p.duration_hours)), 0) +
    (Number(extra_hours) || 0);

  // ---- create booking ----
  const { data: booking, error: bookErr } = await supabase
    .from("bookings")
    .insert({
      reference,
      package_id: pkgs[0].id,
      package_ids: pkgs.map((p) => p.id),
      packages_snapshot: snapshot,
      package_name: combinedName,
      package_price_cents: quote.totalCents,
      extra_hours: Number(extra_hours) || 0,
      extra_hours_cents: quote.extraHoursCents,
      combo_discount_cents: quote.comboDiscountCents,
      customer_name: customer_name.trim(),
      customer_email: (customer_email ?? "").trim(),
      customer_phone: customer_phone.trim(),
      event_date: date,
      event_time: time || null,
      event_duration_hours: totalHours,
      event_location: `${venue_name.trim()}, ${venue_address.trim()}, ${venue_city}`,
      venue_city,
      venue_name: venue_name.trim(),
      venue_address: venue_address.trim(),
      maps_link: maps_link || null,
      event_type,
      guest_count: guestCount,
      notes: (notes ?? "").trim(),
      amount_due_cents: quote.depositCents,
      status: "pending",
    })
    .select("*")
    .single();

  if (bookErr || !booking) {
    return bad("Could not create booking. Please try again.", 500);
  }

  // ---- create payment + provider checkout for the deposit ----
  try {
    const provider = getPaymentProvider(settings.payment_provider);
    const checkout = await provider.createCheckout({
      bookingId: booking.id,
      reference: booking.reference,
      amountCents: quote.depositCents,
      currency: settings.currency,
      description: `Still Café deposit — ${combinedName} (${booking.reference})`,
      customerName: booking.customer_name,
      customerEmail: booking.customer_email || "noreply@example.com",
      customerPhone: booking.customer_phone,
      methods: [chosenMethod],
      successUrl: `${siteUrl()}/book/confirmation?ref=${booking.reference}`,
      cancelUrl: `${siteUrl()}/book/cancelled?ref=${booking.reference}`,
    });

    await supabase.from("payments").insert({
      booking_id: booking.id,
      provider: checkout.provider,
      method: chosenMethod,
      amount_cents: quote.depositCents,
      currency: settings.currency,
      status: "pending",
      provider_ref: checkout.providerRef,
    });

    revalidatePath("/admin", "layout");
    revalidatePath("/book");

    return NextResponse.json({
      reference: booking.reference,
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (e) {
    await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking.id);
    const message = e instanceof Error ? e.message : "Could not start payment.";
    return bad(message, 502);
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
