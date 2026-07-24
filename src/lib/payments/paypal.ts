import type {
  CheckoutResult,
  CheckoutStatus,
  CreateCheckoutInput,
  PaymentProvider,
  ProviderKeys,
  WebhookResult,
} from "./types";

const LIVE_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";

/**
 * PayPal provider using the Orders v2 API.
 * - public_key  = PayPal Client ID
 * - secret_key  = PayPal Secret
 * - webhook_secret = PayPal Webhook ID (used for signature verification)
 * - options.mode = "sandbox" | "live"
 */
export function createPaypalProvider(keys: ProviderKeys): PaymentProvider {
  const base = keys.options?.mode === "live" ? LIVE_API : SANDBOX_API;

  async function accessToken(): Promise<string> {
    if (!keys.publicKey || !keys.secretKey) {
      throw new Error(
        "PayPal Client ID and Secret are not configured. Add them in admin settings."
      );
    }
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${keys.publicKey}:${keys.secretKey}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const json = await res.json();
    if (!res.ok || !json.access_token) {
      throw new Error(
        json?.error_description ?? `PayPal auth failed (${res.status})`
      );
    }
    return json.access_token;
  }

  async function api(
    path: string,
    init?: { method?: string; body?: unknown }
  ): Promise<{ ok: boolean; status: number; json: any }> {
    const token = await accessToken();
    const res = await fetch(`${base}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    return { ok: res.ok, status: res.status, json };
  }

  function captureStatus(order: any): CheckoutStatus | null {
    const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
    if (order?.status === "COMPLETED" || capture?.status === "COMPLETED") {
      const value = capture?.amount?.value;
      return {
        status: "paid",
        method: "paypal",
        amountCents: value ? Math.round(parseFloat(value) * 100) : undefined,
      };
    }
    return null;
  }

  return {
    id: "paypal",

    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
      const { ok, status, json } = await api("/v2/checkout/orders", {
        method: "POST",
        body: {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: input.bookingId,
              custom_id: input.reference,
              description: input.description.slice(0, 127),
              amount: {
                currency_code: input.currency.toUpperCase(),
                value: (input.amountCents / 100).toFixed(2),
              },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING",
                return_url: input.successUrl,
                cancel_url: input.cancelUrl,
              },
            },
          },
        },
      });

      if (!ok) {
        const detail =
          json?.details?.[0]?.description ??
          json?.message ??
          `PayPal error (${status})`;
        throw new Error(detail);
      }

      const links: { rel: string; href: string }[] = json.links ?? [];
      const approve =
        links.find((l) => l.rel === "payer-action") ??
        links.find((l) => l.rel === "approve");
      if (!approve) throw new Error("PayPal did not return an approval link.");

      return {
        provider: "paypal",
        providerRef: json.id,
        checkoutUrl: approve.href,
      };
    },

    async retrieveCheckoutStatus(providerRef: string): Promise<CheckoutStatus> {
      const { ok, json } = await api(`/v2/checkout/orders/${providerRef}`);
      if (!ok) return { status: "unknown" };

      const done = captureStatus(json);
      if (done) return done;

      // Buyer approved but funds not captured yet (we capture on return).
      if (json.status === "APPROVED") {
        const cap = await api(`/v2/checkout/orders/${providerRef}/capture`, {
          method: "POST",
          body: {},
        });
        const captured = captureStatus(cap.json);
        if (captured) return captured;
        return { status: "unpaid" };
      }

      if (json.status === "VOIDED" || json.status === "EXPIRED") {
        return { status: "expired" };
      }
      return { status: "unpaid" };
    },

    async verifyAndParseWebhook(
      rawBody: string,
      headers: Record<string, string>
    ): Promise<WebhookResult> {
      const webhookId = keys.webhookSecret;
      if (!webhookId) {
        throw new Error(
          "PayPal Webhook ID is not configured. Add it in admin settings to process webhooks."
        );
      }

      const event = JSON.parse(rawBody);
      const { ok, json } = await api(
        "/v1/notifications/verify-webhook-signature",
        {
          method: "POST",
          body: {
            auth_algo: headers["paypal-auth-algo"],
            cert_url: headers["paypal-cert-url"],
            transmission_id: headers["paypal-transmission-id"],
            transmission_sig: headers["paypal-transmission-sig"],
            transmission_time: headers["paypal-transmission-time"],
            webhook_id: webhookId,
            webhook_event: event,
          },
        }
      );
      if (!ok || json.verification_status !== "SUCCESS") {
        throw new Error("PayPal webhook signature verification failed.");
      }

      const type: string = event?.event_type ?? "";
      const resource = event?.resource ?? {};

      if (type === "PAYMENT.CAPTURE.COMPLETED") {
        const orderId =
          resource?.supplementary_data?.related_ids?.order_id ?? null;
        const value = resource?.amount?.value;
        return {
          providerRef: orderId,
          status: "paid",
          method: "paypal",
          amountCents: value ? Math.round(parseFloat(value) * 100) : undefined,
          raw: event,
        };
      }
      if (
        type === "PAYMENT.CAPTURE.DENIED" ||
        type === "PAYMENT.CAPTURE.DECLINED"
      ) {
        const orderId =
          resource?.supplementary_data?.related_ids?.order_id ?? null;
        return { providerRef: orderId, status: "failed", raw: event };
      }

      return { providerRef: null, status: "ignored", raw: event };
    },
  };
}
