import { getSettings } from "@/lib/data";
import { saveSettings } from "@/app/admin/actions";
import { availableProviders } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALL_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "gcash", label: "GCash" },
  { id: "card", label: "Credit / Debit Card" },
  { id: "grab_pay", label: "GrabPay" },
  { id: "paymaya", label: "Maya" },
];

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-2xl font-semibold text-espresso">
        Settings
      </h1>

      <form action={saveSettings} className="mt-6 space-y-6">
        <div className="card p-6">
          <h2 className="font-serif text-lg font-semibold text-espresso">
            Business
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-serif text-lg font-semibold text-espresso">
            Pricing rules
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <label className="field-label">Extra hour price (₱)</label>
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
              <label className="field-label">Combo discount (₱)</label>
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

        <div className="card p-6">
          <h2 className="font-serif text-lg font-semibold text-espresso">
            Payments
          </h2>
          <p className="mt-1 text-sm text-espresso/60">
            Choose your payment provider and which methods customers can use at
            checkout.
          </p>

          <div className="mt-4">
            <label className="field-label">Payment provider</label>
            <select
              name="payment_provider"
              defaultValue={settings.payment_provider}
              className="field-input"
            >
              {availableProviders.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p === "paymongo" ? "PayMongo" : p}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-espresso/50">
              PayMongo supports GCash, cards, GrabPay and Maya. Add more
              providers in <code>src/lib/payments</code>.
            </p>
          </div>

          <div className="mt-5">
            <span className="field-label">Enabled payment methods</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ALL_METHODS.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border border-latte px-3 py-2.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="payment_methods"
                    value={m.id}
                    defaultChecked={settings.payment_methods.includes(m.id)}
                    className="h-4 w-4 rounded border-latte"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary">
          Save settings
        </button>
      </form>
    </div>
  );
}
