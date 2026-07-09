import type { PaymentProvider } from "./types";
import { paymongoProvider } from "./paymongo";

const PROVIDERS: Record<string, PaymentProvider> = {
  paymongo: paymongoProvider,
};

/**
 * Resolve a payment provider by id. Defaults to PayMongo. Add new providers to
 * the map above and they become selectable from admin settings.
 */
export function getPaymentProvider(id?: string | null): PaymentProvider {
  const provider = PROVIDERS[id ?? "paymongo"];
  if (!provider) {
    throw new Error(`Unknown payment provider: ${id}`);
  }
  return provider;
}

export const availableProviders = Object.keys(PROVIDERS);
