import type { PaymentProvider, ProviderKeys } from "./types";
import { createPaymongoProvider } from "./paymongo";
import { createStripeProvider } from "./stripe";
import { getActivePaymentConfig } from "@/lib/data";

type ProviderFactory = (keys: ProviderKeys) => PaymentProvider;

const FACTORIES: Record<string, ProviderFactory> = {
  paymongo: createPaymongoProvider,
  stripe: createStripeProvider,
};

export const availableProviders = Object.keys(FACTORIES);

export async function getPaymentProviderFromConfig(): Promise<PaymentProvider> {
  const config = await getActivePaymentConfig();
  if (config?.secret_key) {
    const factory = FACTORIES[config.provider];
    if (factory) {
      return factory({
        secretKey: config.secret_key,
        publicKey: config.public_key ?? undefined,
        webhookSecret: config.webhook_secret ?? undefined,
      });
    }
  }
  return createPaymongoProvider({
    secretKey: process.env.PAYMONGO_SECRET_KEY ?? "",
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
  });
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
  return factory({ secretKey: "" });
}

export async function getWebhookProvider(providerId: string): Promise<PaymentProvider> {
  const config = await getActivePaymentConfig();
  if (config?.provider === providerId && config.secret_key) {
    const factory = FACTORIES[providerId];
    if (factory) {
      return factory({
        secretKey: config.secret_key,
        publicKey: config.public_key ?? undefined,
        webhookSecret: config.webhook_secret ?? undefined,
      });
    }
  }
  return getPaymentProvider(providerId);
}
