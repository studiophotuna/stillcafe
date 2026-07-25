"use server";

import { getBookingByReference } from "@/lib/data";

export type BookingStatusView = {
  reference: string;
  package_name: string;
  event_date: string;
  event_time: string | null;
  event_location: string;
  event_type: string | null;
  guest_count: number | null;
  customer_name: string;
  status: string;
  package_price_cents: number;
  amount_due_cents: number;
  amount_paid_cents: number;
};

/**
 * Public booking lookup used by the Check Status slide-over. Returns only
 * the safe, customer-facing fields (no contact details), or null.
 */
export async function lookupBookingStatus(
  refInput: string
): Promise<BookingStatusView | null> {
  const ref = (refInput || "").trim().toUpperCase();
  if (!ref) return null;

  const b = await getBookingByReference(ref).catch(() => null);
  if (!b) return null;

  return {
    reference: b.reference,
    package_name: b.package_name,
    event_date: b.event_date,
    event_time: b.event_time,
    event_location: b.event_location,
    event_type: b.event_type,
    guest_count: b.guest_count,
    customer_name: b.customer_name,
    status: b.status,
    package_price_cents: b.package_price_cents,
    amount_due_cents: b.amount_due_cents,
    amount_paid_cents: b.amount_paid_cents,
  };
}
