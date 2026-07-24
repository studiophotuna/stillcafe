import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebhookProvider } from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

  const provider = await getWebhookProvider("stripe");

  let result;
  try {
    result = await provider.verifyAndParseWebhook(rawBody, headers);
  } catch (e) {
    console.error("[stripe webhook] verification failed:", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (result.status === "ignored" || !result.providerRef) {
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("provider_ref", result.providerRef)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ received: true });
  }

  if (result.status === "paid") {
    await supabase
      .from("payments")
      .update({
        status: "paid",
        method: result.method ?? payment.method,
        provider_metadata: result.raw as Record<string, unknown>,
      })
      .eq("id", payment.id);

    await supabase
      .from("bookings")
      .update({
        status: "paid",
        amount_paid_cents: result.amountCents ?? payment.amount_cents,
      })
      .eq("id", payment.booking_id);

    revalidatePath("/admin", "layout");
  } else if (result.status === "failed") {
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
  }

  return NextResponse.json({ received: true });
}
