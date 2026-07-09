import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments";
import type { Booking } from "@/lib/types";

/**
 * Confirm a booking's payment by asking the provider directly for the current
 * checkout status, and persist the result. This is the fallback used when the
 * customer returns from the hosted checkout, so payment is recorded even if the
 * webhook isn't configured or is delayed. Safe to call repeatedly (idempotent).
 */
export async function syncBookingPayment(
  reference: string
): Promise<Booking | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  const booking = data as Booking | null;
  if (!booking) return null;
  if (booking.status === "paid" || booking.status === "completed") {
    return booking;
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false });

  const payment = (payments ?? []).find((p) => p.provider_ref) ?? null;
  if (!payment?.provider_ref) return booking;

  try {
    const provider = getPaymentProvider(payment.provider);
    const result = await provider.retrieveCheckoutStatus(payment.provider_ref);

    if (result.status === "paid") {
      await supabase
        .from("payments")
        .update({ status: "paid", method: result.method ?? payment.method })
        .eq("id", payment.id);

      const paidCents = result.amountCents ?? payment.amount_cents;
      await supabase
        .from("bookings")
        .update({ status: "paid", amount_paid_cents: paidCents })
        .eq("id", booking.id);

      revalidatePath("/admin", "layout");

      return { ...booking, status: "paid", amount_paid_cents: paidCents };
    }
  } catch (e) {
    console.error("[syncBookingPayment] failed:", e);
  }

  return booking;
}
