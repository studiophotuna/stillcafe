import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAllBookings } from "@/lib/data";

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookings = await getAllBookings();

  const headers = [
    "Reference",
    "Status",
    "Customer Name",
    "Email",
    "Phone",
    "Package",
    "Event Date",
    "Event Time",
    "Timezone",
    "Event Type",
    "Location",
    "Guest Count",
    "Amount Due",
    "Amount Paid",
    "Notes",
    "Created At",
  ];

  const rows = bookings.map((b) => [
    b.reference,
    b.status,
    b.customer_name,
    b.customer_email,
    b.customer_phone,
    b.package_name,
    b.event_date,
    b.event_time ?? "",
    b.timezone ?? "",
    b.event_type ?? "",
    b.event_location,
    String(b.guest_count ?? ""),
    (b.amount_due_cents / 100).toFixed(2),
    (b.amount_paid_cents / 100).toFixed(2),
    b.notes ?? "",
    b.created_at,
  ]);

  const csv =
    headers.map(escapeCsv).join(",") +
    "\n" +
    rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

  const date = new Date().toISOString().split("T")[0];

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${date}.csv"`,
    },
  });
}
