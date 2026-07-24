export function formatMoney(
  cents: number,
  currency = "PHP",
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format((cents ?? 0) / 100);
}

export function toCents(value: string | number): number {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatDate(dateStr: string, locale = "en-US"): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, {
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
  link: "Payment Link",
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}
