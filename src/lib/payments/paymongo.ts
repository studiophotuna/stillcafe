import crypto from "crypto";
import type {
  CheckoutResult,
  CheckoutStatus,
  CreateCheckoutInput,
  PaymentProvider,
  ProviderKeys,
  WebhookResult,
} from "./types";

const PAYMONGO_API = "https://api.paymongo.com/v1";

const METHOD_MAP: Record<string, string> = {
  gcash: "gcash",
  card: "card",
  grab_pay: "grab_pay",
  paymaya: "paymaya",
};

export function createPaymongoProvider(keys: ProviderKeys): PaymentProvider {
  function authHeader(): string {
    if (!keys.secretKey) throw new Error("PayMongo secret key is not configured.");
    return "Basic " + Buffer.from(keys.secretKey + ":").toString("base64");
  }

  return {
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
        { headers: { Authorization: authHeader() } }
      );
      const json = await res.json();
      if (!res.ok) return { status: "unknown" };

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
      const webhookSecret = keys.webhookSecret;
      if (!webhookSecret) {
        throw new Error("Webhook secret is not configured. Configure it in admin settings to process webhooks.");
      }
      verifySignature(rawBody, headers["paymongo-signature"] ?? "", webhookSecret);

      const event = JSON.parse(rawBody);
      const type: string = event?.data?.attributes?.type ?? "";
      const resource = event?.data?.attributes?.data ?? {};
      const attrs = resource?.attributes ?? {};

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

      return { providerRef: checkoutId, status, method, amountCents, raw: event };
    },
  };
}

function verifySignature(rawBody: string, signatureHeader: string, secret: string): void {
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
