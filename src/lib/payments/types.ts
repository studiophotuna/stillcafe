import type { PaymentMethod } from "@/lib/types";

export type CreateCheckoutInput = {
  bookingId: string;
  reference: string;
  amountCents: number;
  currency: string;
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  methods: PaymentMethod[];
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = {
  /** URL to redirect the customer to in order to pay. */
  checkoutUrl: string;
  /** Provider-side identifier for this checkout (session/intent id). */
  providerRef: string;
  provider: string;
};

export type WebhookResult = {
  /** Provider reference this event pertains to (checkout session id). */
  providerRef: string | null;
  /** Normalized outcome. */
  status: "paid" | "failed" | "cancelled" | "ignored";
  method?: string | null;
  amountCents?: number;
  raw: unknown;
};

export type CheckoutStatus = {
  /** Normalized payment status for a checkout, fetched live from the provider. */
  status: "paid" | "unpaid" | "expired" | "unknown";
  method?: string | null;
  amountCents?: number;
};

/**
 * A payment provider. Implement this interface to add support for a new
 * gateway; the rest of the app only depends on these methods.
 */
export interface PaymentProvider {
  readonly id: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  verifyAndParseWebhook(
    rawBody: string,
    headers: Record<string, string>
  ): Promise<WebhookResult>;
  /**
   * Fetch the current status of a checkout directly from the provider. Used to
   * confirm payment when the customer returns, so we don't depend solely on the
   * webhook being configured.
   */
  retrieveCheckoutStatus(providerRef: string): Promise<CheckoutStatus>;
}
