import { getSettings, getPaymentConfigs } from "@/lib/data";
import { getMethodRouting } from "@/lib/payments";
import { saveSettings } from "@/app/admin/actions";
import { PaymentConfigEditor } from "@/components/admin/PaymentConfigEditor";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALL_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "gcash", label: "GCash" },
  { id: "card", label: "Credit / Debit Card" },
  { id: "grab_pay", label: "GrabPay" },
  { id: "paymaya", label: "Maya" },
  { id: "paypal", label: "PayPal" },
];

const PROVIDER_NAMES: Record<string, string> = {
  paymongo: "PayMongo",
  stripe: "Stripe",
  paypal: "PayPal",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const [settings, rawConfigs, routing] = await Promise.all([
    getSettings(),
    getPaymentConfigs(),
    getMethodRouting(ALL_METHODS.map((m) => m.id)),
  ]);

  const paymentConfigs = rawConfigs.map((c) => ({
    id: c.id,
    provider: c.provider,
    display_name: c.display_name,
    is_active: c.is_active,
    supported_methods: c.supported_methods,
    has_public_key: !!c.public_key,
    has_secret_key: !!c.secret_key,
    has_webhook_secret: !!c.webhook_secret,
    mode:
      typeof (c.config as Record<string, unknown> | null)?.mode === "string"
        ? String((c.config as Record<string, unknown>).mode)
        : undefined,
  }));

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-2xl text-espresso">Settings</h1>
      <p className="mt-1 text-sm text-espresso/45">
        Configure your business, pricing, and payment options.
      </p>

      {searchParams.saved && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Settings saved.
        </div>
      )}
      {searchParams.error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {searchParams.error}
        </div>
      )}

      <form action={saveSettings} className="mt-6 items-start gap-6 lg:flex">
        <div className="min-w-0 flex-1 space-y-5">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-latte/30 px-6 py-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-espresso/40">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <h2 className="font-serif text-base text-espresso">Business</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Business name</label>
                <input
                  name="business_name"
                  defaultValue={settings.business_name}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Contact email</label>
                <input
                  name="business_email"
                  type="email"
                  defaultValue={settings.business_email ?? ""}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Service area</label>
                <input
                  name="service_area"
                  defaultValue={settings.service_area}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Standard coverage (hours)</label>
                <input
                  name="standard_hours"
                  type="number"
                  step="0.5"
                  min="1"
                  defaultValue={settings.standard_hours}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Booking reference prefix</label>
                <input
                  name="reference_prefix"
                  maxLength={5}
                  defaultValue={settings.reference_prefix ?? "BK"}
                  placeholder="BK"
                  className="field-input font-mono uppercase"
                />
                <p className="mt-1 text-xs text-espresso/35">
                  Up to 5 characters, e.g. BK-A3X9P2
                </p>
              </div>
              <div>
                <label className="field-label">Locale</label>
                <select
                  name="locale"
                  defaultValue={settings.locale ?? "en-US"}
                  className="field-input"
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="en-PH">English (PH)</option>
                  <option value="fil-PH">Filipino</option>
                  <option value="ja-JP">Japanese</option>
                  <option value="ko-KR">Korean</option>
                  <option value="zh-CN">Chinese (Simplified)</option>
                </select>
                <p className="mt-1 text-xs text-espresso/35">
                  Affects currency and date formatting
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-latte/30 px-6 py-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-espresso/40">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <h2 className="font-serif text-base text-espresso">
              Guest limits &amp; event types
            </h2>
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Minimum guests</label>
                <input
                  name="min_guests"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue={settings.min_guests ?? 1}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Maximum guests</label>
                <input
                  name="max_guests"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue={settings.max_guests ?? 500}
                  className="field-input"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Event types</label>
                <textarea
                  name="event_types"
                  rows={5}
                  defaultValue={(settings.event_types ?? ["Wedding", "Birthday", "Corporate event", "Other"]).join("\n")}
                  className="field-input resize-none"
                />
                <p className="mt-1 text-xs text-espresso/35">
                  One per line. Shown as chip options on the booking form.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-latte/30 px-6 py-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-espresso/40">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <h2 className="font-serif text-base text-espresso">Pricing rules</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Deposit (%)</label>
                <input
                  name="deposit_percent"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={settings.deposit_percent}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Extra hour price</label>
                <input
                  name="extra_hour_price"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={settings.extra_hour_cents / 100}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Combo discount</label>
                <input
                  name="combo_discount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={settings.combo_discount_cents / 100}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">
                  Min. packages for combo discount
                </label>
                <input
                  name="combo_min_packages"
                  type="number"
                  min="1"
                  defaultValue={settings.combo_min_packages}
                  className="field-input"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-latte/30 px-6 py-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-espresso/40">
              <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <h2 className="font-serif text-base text-espresso">Checkout methods</h2>
          </div>
          <div className="p-6">
            <p className="mb-4 text-sm text-espresso/45">
              Choose which payment methods customers can use at checkout. Each
              method is routed to the first active provider that supports it.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_METHODS.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border-2 border-latte/40 px-4 py-3 text-sm transition-colors hover:border-mocha/30"
                >
                  <input
                    type="checkbox"
                    name="payment_methods"
                    value={m.id}
                    defaultChecked={settings.payment_methods.includes(m.id)}
                    className="h-4 w-4 rounded border-latte accent-mocha"
                  />
                  <span className="flex-1">{m.label}</span>
                  {routing[m.id] ? (
                    <span className="rounded bg-sand/60 px-1.5 py-0.5 text-[10px] text-espresso/45">
                      via {PROVIDER_NAMES[routing[m.id]!] ?? routing[m.id]}
                    </span>
                  ) : (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-500">
                      no provider
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        </div>

        {/* Save rail: follows scroll on desktop, docks to bottom on mobile */}
        <div className="sticky bottom-4 z-10 mt-5 lg:bottom-auto lg:top-24 lg:mt-0 lg:w-52 lg:shrink-0">
          <div className="card p-4 shadow-elevated lg:shadow-card">
            <button
              type="submit"
              className="btn-primary flex w-full items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              Save settings
            </button>
            <p className="mt-2 hidden text-center text-[11px] text-espresso/35 lg:block">
              Applies immediately across the site
            </p>
          </div>
        </div>
      </form>

      <div className="mt-10">
        <h2 className="font-serif text-xl text-espresso">
          Payment providers
        </h2>
        <p className="mt-1 text-sm text-espresso/45">
          Configure your payment gateway keys. You can activate several
          providers — each checkout method goes to the first active provider
          that supports it.
        </p>
        <div className="mt-4">
          <PaymentConfigEditor configs={paymentConfigs} />
        </div>
      </div>
    </div>
  );
}
