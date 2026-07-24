"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  mode?: string;
};

const COPY: Record<
  string,
  {
    publicLabel: string;
    publicHint: string;
    publicPlaceholder: string;
    secretLabel: string;
    secretHint: string;
    secretPlaceholder: string;
    webhookLabel: string;
    webhookHint: string;
    webhookPlaceholder: string;
  }
> = {
  paymongo: {
    publicLabel: "Public key",
    publicHint: "Your PayMongo public key (starts with pk_test_ or pk_live_)",
    publicPlaceholder: "pk_test_...",
    secretLabel: "Secret key",
    secretHint: "Your PayMongo secret key (starts with sk_test_ or sk_live_)",
    secretPlaceholder: "sk_test_...",
    webhookLabel: "Webhook secret",
    webhookHint: "From your PayMongo webhook settings",
    webhookPlaceholder: "whsk_...",
  },
  stripe: {
    publicLabel: "Publishable key",
    publicHint: "Your Stripe publishable key (starts with pk_test_ or pk_live_)",
    publicPlaceholder: "pk_test_...",
    secretLabel: "Secret key",
    secretHint: "Your Stripe secret key (starts with sk_test_ or sk_live_)",
    secretPlaceholder: "sk_test_...",
    webhookLabel: "Signing secret",
    webhookHint: "From your Stripe webhook endpoint settings",
    webhookPlaceholder: "whsec_...",
  },
  paypal: {
    publicLabel: "Client ID",
    publicHint: "From your PayPal developer dashboard (REST API app)",
    publicPlaceholder: "AXxxxx...",
    secretLabel: "Secret",
    secretHint: "The Secret for the same REST API app",
    secretPlaceholder: "EXxxxx...",
    webhookLabel: "Webhook ID",
    webhookHint: "The ID of the webhook you created in the PayPal dashboard",
    webhookPlaceholder: "5GP02458WK...",
  },
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
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(config.is_active);

  const copy = COPY[config.provider] ?? COPY.paymongo;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("id", config.id);
      const res = await savePaymentConfig(fd);
      if (res?.ok) {
        setMessage("Saved!");
        // Pull fresh server props so status badges reflect what was stored.
        router.refresh();
      } else {
        setMessage(res?.error ?? "Save failed");
      }
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
          {config.provider === "paypal" && config.mode && (
            <span
              className={`rounded px-2 py-0.5 text-[11px] uppercase ${
                config.mode === "live"
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {config.mode}
            </span>
          )}
        </div>
        <span className="text-espresso/30">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="border-t border-latte/40 px-6 py-5">
          <div className="space-y-4">
            {config.provider === "paypal" && (
              <div>
                <label className="field-label">Environment</label>
                <select
                  name="paypal_mode"
                  defaultValue={config.mode ?? "sandbox"}
                  className="field-input"
                >
                  <option value="sandbox">Sandbox (testing)</option>
                  <option value="live">Live</option>
                </select>
                <p className="mt-1 text-[11px] text-espresso/40">
                  Use Sandbox with sandbox credentials while testing; switch to
                  Live with live credentials to accept real payments.
                </p>
              </div>
            )}
            <div>
              <label className="field-label">{copy.publicLabel}</label>
              <input
                name="public_key"
                type="text"
                placeholder={
                  config.has_public_key
                    ? "Leave blank to keep current value"
                    : copy.publicPlaceholder
                }
                className="field-input font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-espresso/40">
                {copy.publicHint}
                {config.has_public_key && (
                  <span className="ml-1 text-green-600">✓ set</span>
                )}
              </p>
            </div>
            <div>
              <label className="field-label">{copy.secretLabel}</label>
              <input
                name="secret_key"
                type="password"
                placeholder={
                  config.has_secret_key
                    ? "Leave blank to keep current value"
                    : copy.secretPlaceholder
                }
                className="field-input font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-espresso/40">
                {copy.secretHint}
                {config.has_secret_key && (
                  <span className="ml-1 text-green-600">✓ set</span>
                )}
              </p>
            </div>
            <div>
              <label className="field-label">{copy.webhookLabel}</label>
              <input
                name="webhook_secret"
                type="password"
                placeholder={
                  config.has_webhook_secret
                    ? "Leave blank to keep current value"
                    : copy.webhookPlaceholder
                }
                className="field-input font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-espresso/40">
                {copy.webhookHint}
                {config.has_webhook_secret && (
                  <span className="ml-1 text-green-600">✓ set</span>
                )}
                {" · "}Webhook URL:{" "}
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
                Active
              </span>
            </label>
            <p className="text-[11px] text-espresso/40">
              Multiple providers can be active at once — each checkout method
              is routed to the first active provider that supports it.
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
