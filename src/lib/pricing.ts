import type { Package, Settings } from "@/lib/types";

export type QuoteLine = { label: string; amountCents: number };

export type Quote = {
  lines: QuoteLine[];
  packagesCents: number;
  extraHoursCents: number;
  comboDiscountCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
};

/**
 * Compute a booking quote from the selected packages and extra hours.
 * Shared by the client (live estimate) and the server (authoritative total),
 * so pricing can never diverge between what a customer sees and what they pay.
 */
export function computeQuote(
  selected: Pick<Package, "name" | "price_cents">[],
  extraHours: number,
  settings: Settings
): Quote {
  const lines: QuoteLine[] = [];

  const packagesCents = selected.reduce((sum, p) => sum + p.price_cents, 0);
  for (const p of selected) {
    lines.push({ label: p.name, amountCents: p.price_cents });
  }

  const hours = Math.max(0, Math.floor(extraHours || 0));
  const extraHoursCents = hours * settings.extra_hour_cents;
  if (hours > 0) {
    lines.push({
      label: `Extra coverage (+${hours}h)`,
      amountCents: extraHoursCents,
    });
  }

  const comboDiscountCents =
    selected.length >= settings.combo_min_packages
      ? settings.combo_discount_cents
      : 0;
  if (comboDiscountCents > 0) {
    lines.push({
      label: `Combo discount (${selected.length} packages)`,
      amountCents: -comboDiscountCents,
    });
  }

  const totalCents = Math.max(
    0,
    packagesCents + extraHoursCents - comboDiscountCents
  );
  const depositCents = Math.round((totalCents * settings.deposit_percent) / 100);
  const balanceCents = totalCents - depositCents;

  return {
    lines,
    packagesCents,
    extraHoursCents,
    comboDiscountCents,
    totalCents,
    depositCents,
    balanceCents,
  };
}
