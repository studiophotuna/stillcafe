import crypto from "crypto";
import type {
  CheckoutResult,
  CheckoutStatus,
  CreateCheckoutInput,
  PaymentProvider,
  WebhookResult,
} from "./types";

const PAYMONGO_API = "https://api.paymongo.com/v1";

/** Map our internal method ids to PayMongo payment_method_types. */
const METHOD_MAP: Record<string, string> = {
  gcash: "gcash",
  card: "card",
  grab_pay: "grab_pay",
  paymaya: "paymaya",
};

function authHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("Missing PAYMONGO_SECRET_KEY env var.");
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

/**
 * PayMongo provider. Uses Checkout Sessions, which natively support GCash,
 * cards, GrabPay and Maya and host the payment page for us.
 * Docs: https://developers.paymongo.com/reference/checkout-session-resource
 */
export const paymongoProvider: PaymentProvider = {
  id: "paymongo",

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const methodTypes = input.methods
      .map((m) => METHOD_MAP[m])
      .filter(Boolean);

    const body = {
      data: {
        attributes: {
          reference_number: input.reference,
          description: input.description,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          cancel_url: input.cancelUrl,
          success_url: input.successUrl,
          payment_method_types: methodTypes.length ? methodTypes : ["gcash"],
          line_items: [
            {
              name: input.description,
              quantity: 1,
              amount: input.amountCents,
              currency: input.currency,
            },
          ],
          billing: {
            name: input.customerName,
            email: input.customerEmail,
            phone: input.customerPhone,
          },
          metadata: {
            booking_id: input.bookingId,
            reference: input.reference,
          },
        },
      },
    };

    const res = await fetch(`${PAYMONGO_API}/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) {
      const detail =
        json?.errors?.[0]?.detail ?? `PayMongo error (${res.status})`;
      throw new Error(detail);
    }

    return {
      provider: "paymongo",
      providerRef: json.data.id,
      checkoutUrl: json.data.attributes.checkout_url,
    };
  },

  async retrieveCheckoutStatus(providerRef: string): Promise<CheckoutStatus> {
    const res = await fetch(
      `${PAYMONGO_API}/checkout_sessions/${providerRef}`,
      {
        headers: { Authorization: authHeader() },
      }
    );
    const json = await res.json();
    if (!res.ok) {
      return { status: "unknown" };
    }
    const attrs = json?.data?.attributes ?? {};
    const payments: any[] = attrs.payments ?? [];
    const paid = payments.find((p) => p?.attributes?.status === "paid");
    if (paid) {
      return {
        status: "paid",
        method: paid.attributes?.source?.type ?? null,
        amountCents: paid.attributes?.amount,
      };
    }
    if (attrs.status === "expired") return { status: "expired" };
    return { status: "unpaid" };
  },

  async verifyAndParseWebhook(
    rawBody: string,
    headers: Record<string, string>
  ): Promise<WebhookResult> {
    verifySignature(rawBody, headers["paymongo-signature"] ?? "");

    const event = JSON.parse(rawBody);
    const type: string = event?.data?.attributes?.type ?? "";
    const resource = event?.data?.attributes?.data ?? {};
    const attrs = resource?.attributes ?? {};

    // For checkout-session-based flows PayMongo emits checkout_session events;
    // for direct payments it emits payment.paid / payment.failed.
    const checkoutId: string | null =
      attrs?.checkout_session_id ??
      attrs?.metadata?.checkout_session_id ??
      resource?.id ??
      null;

    const payments = attrs?.payments ?? [];
    const firstPayment = payments[0]?.attributes ?? {};
    const method: string | null =
      firstPayment?.source?.type ?? attrs?.source?.type ?? null;
    const amountCents: number | undefined =
      firstPayment?.amount ?? attrs?.amount;

    let status: WebhookResult["status"] = "ignored";
    if (type === "checkout_session.payment.paid" || type === "payment.paid") {
      status = "paid";
    } else if (type === "payment.failed") {
      status = "failed";
    }

    return {
      providerRef: checkoutId,
      status,
      method,
      amountCents,
      raw: event,
    };
  },
};

function verifySignature(rawBody: string, signatureHeader: string): void {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  // If no secret configured, skip verification (dev/test). Warn loudly.
  if (!secret) {
    console.warn(
      "[paymongo] PAYMONGO_WEBHOOK_SECRET not set — skipping signature verification."
    );
    return;
  }
  // Header format: t=timestamp,te=test_sig,li=live_sig
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    })
  );
  const timestamp = parts["t"];
  const provided = parts["li"] || parts["te"];
  if (!timestamp || !provided) {
    throw new Error("Invalid PayMongo signature header.");
  }
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("PayMongo signature verification failed.");
  }
}
