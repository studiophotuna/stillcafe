import crypto from "crypto";
import type {
  CheckoutResult,
  CheckoutStatus,
  CreateCheckoutInput,
  PaymentProvider,
  ProviderKeys,
  WebhookResult,
} from "./types";

const STRIPE_API = "https://api.stripe.com/v1";

export function createStripeProvider(keys: ProviderKeys): PaymentProvider {
  function authHeader(): string {
    if (!keys.secretKey) throw new Error("Stripe secret key is not configured.");
    return "Bearer " + keys.secretKey;
  }

  return {
    id: "stripe",

    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
      const params = new URLSearchParams();
      params.set("mode", "payment");
      params.set("success_url", input.successUrl);
      params.set("cancel_url", input.cancelUrl);
      params.set("client_reference_id", input.bookingId);
      params.set("customer_email", input.customerEmail || "");
      params.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
      params.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
      params.set("line_items[0][price_data][product_data][name]", input.description);
      params.set("line_items[0][quantity]", "1");
      params.set("payment_method_types[]", "card");
      params.set("metadata[booking_id]", input.bookingId);
      params.set("metadata[reference]", input.reference);

      const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const json = await res.json();
      if (!res.ok) {
        const detail = json?.error?.message ?? `Stripe error (${res.status})`;
        throw new Error(detail);
      }

      return {
        provider: "stripe",
        providerRef: json.id,
        checkoutUrl: json.url,
      };
    },

    async retrieveCheckoutStatus(providerRef: string): Promise<CheckoutStatus> {
      const res = await fetch(
        `${STRIPE_API}/checkout/sessions/${providerRef}`,
        { headers: { Authorization: authHeader() } }
      );
      const json = await res.json();
      if (!res.ok) return { status: "unknown" };

      if (json.payment_status === "paid") {
        return {
          status: "paid",
          method: "card",
          amountCents: json.amount_total,
        };
      }
      if (json.status === "expired") return { status: "expired" };
      return { status: "unpaid" };
    },

    async verifyAndParseWebhook(
      rawBody: string,
      headers: Record<string, string>
    ): Promise<WebhookResult> {
      const webhookSecret = keys.webhookSecret;
      if (!webhookSecret) {
        throw new Error("Webhook secret is not configured. Configure it in admin settings to process webhooks.");
      }
      verifyStripeSignature(rawBody, headers["stripe-signature"] ?? "", webhookSecret);

      const event = JSON.parse(rawBody);
      const type: string = event?.type ?? "";
      const obj = event?.data?.object ?? {};

      const sessionId: string | null = obj?.id ?? null;
      const method: string | null = obj?.payment_method_types?.[0] ?? "card";
      const amountCents: number | undefined = obj?.amount_total;

      let status: WebhookResult["status"] = "ignored";
      if (type === "checkout.session.completed" && obj?.payment_status === "paid") {
        status = "paid";
      } else if (type === "checkout.session.expired") {
        status = "failed";
      }

      return { providerRef: sessionId, status, method, amountCents, raw: event };
    },
  };
}

function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): void {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, ...v] = kv.split("=");
      return [k.trim(), v.join("=")];
    })
  );
  const timestamp = parts["t"];
  const provided = parts["v1"];
  if (!timestamp || !provided) {
    throw new Error("Invalid Stripe signature header.");
  }
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Stripe signature verification failed.");
  }
}
