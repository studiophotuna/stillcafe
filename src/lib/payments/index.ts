import type { PaymentProvider, ProviderKeys } from "./types";
import type { PaymentConfig, PaymentMethod } from "@/lib/types";
import { createPaymongoProvider } from "./paymongo";
import { createStripeProvider } from "./stripe";
import { createPaypalProvider } from "./paypal";
import {
  getActivePaymentConfigs,
  getPaymentConfigByProvider,
} from "@/lib/data";

type ProviderFactory = (keys: ProviderKeys) => PaymentProvider;

const FACTORIES: Record<string, ProviderFactory> = {
  paymongo: createPaymongoProvider,
  stripe: createStripeProvider,
  paypal: createPaypalProvider,
};

export const availableProviders = Object.keys(FACTORIES);

function fromConfig(config: PaymentConfig): PaymentProvider | null {
  const factory = FACTORIES[config.provider];
  if (!factory || !config.secret_key) return null;
  return factory({
    secretKey: config.secret_key,
    publicKey: config.public_key ?? undefined,
    webhookSecret: config.webhook_secret ?? undefined,
    options: config.config ?? {},
  });
}

/**
 * Per-method routing: multiple providers can be active at once, and each
 * checkout method is served by the first active provider that supports it
 * (falling back to any active provider, then to env-configured PayMongo).
 */
export async function getProviderForMethod(
  method: PaymentMethod
): Promise<PaymentProvider> {
  const configs = await getActivePaymentConfigs();
  const usable = configs.filter((c) => c.secret_key && FACTORIES[c.provider]);

  const match =
    usable.find((c) => (c.supported_methods ?? []).includes(method)) ??
    usable[0];

  if (match) {
    const provider = fromConfig(match);
    if (provider) return provider;
  }

  return createPaymongoProvider({
    secretKey: process.env.PAYMONGO_SECRET_KEY ?? "",
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
  });
}

/**
 * Resolve which provider id would serve each method. Used by the admin
 * settings page to show routing hints next to the checkout methods.
 */
export async function getMethodRouting(
  methods: PaymentMethod[]
): Promise<Record<string, string | null>> {
  const configs = await getActivePaymentConfigs();
  const usable = configs.filter((c) => c.secret_key && FACTORIES[c.provider]);
  const routing: Record<string, string | null> = {};
  for (const m of methods) {
    const match =
      usable.find((c) => (c.supported_methods ?? []).includes(m)) ??
      usable[0] ??
      null;
    routing[m] = match ? match.provider : null;
  }
  return routing;
}

export function getPaymentProvider(id?: string | null): PaymentProvider {
  const providerId = id ?? "paymongo";
  const factory = FACTORIES[providerId];
  if (!factory) throw new Error(`Unknown payment provider: ${id}`);

  if (providerId === "paymongo") {
    return factory({
      secretKey: process.env.PAYMONGO_SECRET_KEY ?? "",
      webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    });
  }
  if (providerId === "stripe") {
    return factory({
      secretKey: process.env.STRIPE_SECRET_KEY ?? "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    });
  }
  if (providerId === "paypal") {
    return factory({
      secretKey: process.env.PAYPAL_SECRET ?? "",
      publicKey: process.env.PAYPAL_CLIENT_ID,
      webhookSecret: process.env.PAYPAL_WEBHOOK_ID,
      options: { mode: process.env.PAYPAL_MODE ?? "sandbox" },
    });
  }
  return factory({ secretKey: "" });
}

/**
 * Provider used to verify/handle a webhook or re-check a checkout. Looks up
 * the stored config for that provider id (active or not, so past payments
 * can still be synced), falling back to env-configured keys.
 */
export async function getWebhookProvider(
  providerId: string
): Promise<PaymentProvider> {
  const config = await getPaymentConfigByProvider(providerId);
  if (config) {
    const provider = fromConfig(config);
    if (provider) return provider;
  }
  return getPaymentProvider(providerId);
}
