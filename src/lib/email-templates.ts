import type { Booking, Settings } from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/format";

function layout(brandName: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="text-align:center;margin-bottom:24px">
      <strong style="font-size:18px;color:#2c1e14">${brandName}</strong>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e8ddd0">
      ${body}
    </div>
    <div style="text-align:center;margin-top:24px;font-size:12px;color:#999">
      &copy; ${new Date().getFullYear()} ${brandName}
    </div>
  </div>
</body>
</html>`;
}

export function bookingConfirmationEmail(
  booking: Booking,
  settings: Settings
): { subject: string; html: string } {
  const subject = `Booking ${booking.reference} — ${settings.business_name}`;
  const html = layout(
    settings.business_name,
    `
    <h2 style="margin:0 0 8px;font-size:20px;color:#2c1e14">Booking received</h2>
    <p style="margin:0 0 20px;color:#666;font-size:14px">
      Thank you, ${booking.customer_name}. Here are your booking details.
    </p>
    <table style="width:100%;font-size:14px;color:#2c1e14" cellpadding="0" cellspacing="0">
      <tr><td style="padding:8px 0;color:#999">Reference</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:bold">${booking.reference}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Package</td><td style="padding:8px 0;text-align:right">${booking.package_name}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Date</td><td style="padding:8px 0;text-align:right">${formatDate(booking.event_date, settings.locale)}</td></tr>
      ${booking.event_time ? `<tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Time</td><td style="padding:8px 0;text-align:right">${booking.event_time}</td></tr>` : ""}
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Location</td><td style="padding:8px 0;text-align:right">${booking.event_location}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatMoney(booking.package_price_cents, settings.currency, settings.locale)}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Deposit paid</td><td style="padding:8px 0;text-align:right">${formatMoney(booking.amount_paid_cents, settings.currency, settings.locale)}</td></tr>
    </table>
    <p style="margin:24px 0 0;padding:16px;background:#f9f5ef;border-radius:8px;font-size:13px;color:#666">
      Save your reference number <strong>${booking.reference}</strong> for your records.
      ${booking.amount_paid_cents < booking.package_price_cents ? `The remaining balance of ${formatMoney(booking.package_price_cents - booking.amount_paid_cents, settings.currency, settings.locale)} is due on or before the event day.` : ""}
    </p>
    `
  );
  return { subject, html };
}

export function bookingStatusEmail(
  booking: Booking,
  settings: Settings,
  newStatus: string
): { subject: string; html: string } {
  const statusMessages: Record<string, string> = {
    confirmed: "Your booking has been confirmed. Your date is locked in.",
    paid: "We've received your payment. You're all set.",
    completed: "Your event has been marked as completed. Thank you for choosing us.",
    cancelled: "Your booking has been cancelled. If this was unexpected, please get in touch.",
  };

  const message = statusMessages[newStatus] || `Your booking status has been updated to ${newStatus}.`;
  const subject = `Booking ${booking.reference} — ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;

  const html = layout(
    settings.business_name,
    `
    <h2 style="margin:0 0 8px;font-size:20px;color:#2c1e14">Booking update</h2>
    <p style="margin:0 0 20px;color:#666;font-size:14px">
      Hi ${booking.customer_name}, ${message}
    </p>
    <table style="width:100%;font-size:14px;color:#2c1e14" cellpadding="0" cellspacing="0">
      <tr><td style="padding:8px 0;color:#999">Reference</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:bold">${booking.reference}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Package</td><td style="padding:8px 0;text-align:right">${booking.package_name}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Date</td><td style="padding:8px 0;text-align:right">${formatDate(booking.event_date, settings.locale)}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Status</td><td style="padding:8px 0;text-align:right;font-weight:bold">${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}</td></tr>
    </table>
    ${settings.business_email ? `<p style="margin:24px 0 0;font-size:13px;color:#999">Questions? Reply to <a href="mailto:${settings.business_email}" style="color:#6f4e37">${settings.business_email}</a></p>` : ""}
    `
  );
  return { subject, html };
}

export function adminNewBookingEmail(
  booking: Booking,
  settings: Settings
): { subject: string; html: string } {
  const subject = `New booking: ${booking.reference} — ${booking.customer_name}`;
  const html = layout(
    settings.business_name,
    `
    <h2 style="margin:0 0 8px;font-size:20px;color:#2c1e14">New booking received</h2>
    <table style="width:100%;font-size:14px;color:#2c1e14" cellpadding="0" cellspacing="0">
      <tr><td style="padding:8px 0;color:#999">Reference</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:bold">${booking.reference}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Customer</td><td style="padding:8px 0;text-align:right">${booking.customer_name}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Email</td><td style="padding:8px 0;text-align:right">${booking.customer_email}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Phone</td><td style="padding:8px 0;text-align:right">${booking.customer_phone}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Package</td><td style="padding:8px 0;text-align:right">${booking.package_name}</td></tr>
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Date</td><td style="padding:8px 0;text-align:right">${formatDate(booking.event_date, settings.locale)}</td></tr>
      ${booking.event_time ? `<tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Time</td><td style="padding:8px 0;text-align:right">${booking.event_time}</td></tr>` : ""}
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Location</td><td style="padding:8px 0;text-align:right">${booking.event_location}</td></tr>
      ${booking.event_type ? `<tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Event type</td><td style="padding:8px 0;text-align:right">${booking.event_type}</td></tr>` : ""}
      ${booking.guest_count ? `<tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Guests</td><td style="padding:8px 0;text-align:right">${booking.guest_count}</td></tr>` : ""}
      <tr style="border-top:1px solid #f0e6d8"><td style="padding:8px 0;color:#999">Deposit</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatMoney(booking.amount_due_cents, settings.currency, settings.locale)}</td></tr>
    </table>
    ${booking.notes ? `<p style="margin:16px 0 0;padding:12px;background:#f9f5ef;border-radius:8px;font-size:13px;color:#666"><strong>Notes:</strong> ${booking.notes}</p>` : ""}
    `
  );
  return { subject, html };
}
