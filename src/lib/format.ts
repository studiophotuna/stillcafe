/** Format an amount in centavos as a PHP currency string. */
export function formatMoney(cents: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
  }).format((cents ?? 0) / 100);
}

/** Parse a peso string/number into integer centavos. */
export function toCents(value: string | number): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash",
  card: "Credit / Debit Card",
  grab_pay: "GrabPay",
  paymaya: "Maya",
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}
