"use client";

import { useState } from "react";
import { savePaymentConfig } from "@/app/admin/actions";

type SafePaymentConfig = {
  id: string;
  provider: string;
  display_name: string;
  is_active: boolean;
  supported_methods: string[];
  has_public_key: boolean;
  has_secret_key: boolean;
  has_webhook_secret: boolean;
};

export function PaymentConfigEditor({
  configs,
}: {
  configs: SafePaymentConfig[];
}) {
  return (
    <div className="space-y-4">
      {configs.map((config) => (
        <ProviderCard key={config.id} config={config} />
      ))}
    </div>
  );
}

function ProviderCard({ config }: { config: SafePaymentConfig }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(config.is_active);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("id", config.id);
      await savePaymentConfig(fd);
      setMessage("Saved!");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-serif text-base text-espresso">
            {config.display_name}
          </span>
          {config.is_active && (
            <span className="rounded bg-maroon/10 px-2 py-0.5 text-[11px] uppercase text-maroon">
              Active
            </span>
          )}
          {!config.is_active && config.has_secret_key && (
            <span className="rounded bg-sand px-2 py-0.5 text-[11px] uppercase text-espresso/40">
              Configured
            </span>
          )}
          {!config.has_secret_key && (
            <span className="rounded bg-sand px-2 py-0.5 text-[11px] uppercase text-espresso/30">
              Not configured
            </span>
          )}
        </div>
        <span className="text-espresso/30">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="border-t border-latte/40 px-6 py-5">
          <div className="space-y-4">
            <div>
              <label className="field-label">Public key</label>
              <input
                name="public_key"
                type="text"
                placeholder={
                  config.has_public_key
                    ? "Leave blank to keep current key"
                    : config.provider === "paymongo"
                      ? "pk_test_..."
                      : "pk_test_..."
                }
                className="field-input font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-espresso/40">
                {config.provider === "paymongo"
                  ? "Your PayMongo public key (starts with pk_test_ or pk_live_)"
                  : "Your Stripe publishable key (starts with pk_test_ or pk_live_)"}
              </p>
            </div>
            <div>
              <label className="field-label">Secret key</label>
              <input
                name="secret_key"
                type="password"
                placeholder={
                  config.has_secret_key
                    ? "Leave blank to keep current key"
                    : config.provider === "paymongo"
                      ? "sk_test_..."
                      : "sk_test_..."
                }
                className="field-input font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-espresso/40">
                {config.provider === "paymongo"
                  ? "Your PayMongo secret key (starts with sk_test_ or sk_live_)"
                  : "Your Stripe secret key (starts with sk_test_ or sk_live_)"}
              </p>
            </div>
            <div>
              <label className="field-label">Webhook secret</label>
              <input
                name="webhook_secret"
                type="password"
                placeholder={
                  config.has_webhook_secret
                    ? "Leave blank to keep current key"
                    : "whsec_..."
                }
                className="field-input font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-espresso/40">
                Webhook URL:{" "}
                <code className="rounded bg-sand/50 px-1 py-0.5">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/webhooks/${config.provider}`
                    : `/api/webhooks/${config.provider}`}
                </code>
              </p>
            </div>
            <div>
              <label className="field-label">Supported methods</label>
              <p className="text-xs text-espresso/50">
                {config.supported_methods.join(", ") || "None"}
              </p>
            </div>
            <label className="flex items-center gap-2.5 rounded-lg border border-latte px-4 py-3">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={config.is_active}
                className="h-4 w-4 rounded border-latte"
              />
              <span className="text-sm font-medium text-espresso">
                Set as active provider
              </span>
            </label>
            <p className="text-[11px] text-espresso/40">
              Only one provider can be active at a time. Activating this will
              deactivate any other provider.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {message && (
              <span
                className={`text-sm font-medium ${
                  message === "Saved!" ? "text-green-600" : "text-red-600"
                }`}
              >
                {message}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
