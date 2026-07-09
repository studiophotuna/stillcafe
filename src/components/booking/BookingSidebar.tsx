import Link from "next/link";
import type { Settings } from "@/lib/types";

export function BookingSidebar({ settings }: { settings: Settings }) {
  const highlights = [
    {
      icon: "📍",
      label: "Service Area",
      value: `${settings.service_area} only`,
    },
    {
      icon: "⏱",
      label: "Standard Coverage",
      value: `${settings.standard_hours} hours + overtime options`,
    },
    {
      icon: "₱",
      label: "Deposit Required",
      value: `${settings.deposit_percent}% non-refundable downpayment`,
    },
    {
      icon: "✉",
      label: "Confirmation via",
      value: settings.business_email ?? "email",
    },
  ];

  return (
    <div className="space-y-6">
      {/* What to expect */}
      <div className="card space-y-4 bg-white p-6">
        <h3 className="font-serif text-lg font-bold text-espresso">
          What to expect
        </h3>
        <p className="text-xs leading-relaxed text-espresso/70">
          {settings.business_name} brings a beautiful mobile espresso bar and a
          friendly barista directly to your {settings.service_area} venue.
        </p>
        <div className="space-y-3 pt-1">
          {highlights.map((h) => (
            <div
              key={h.label}
              className="flex items-center gap-3 rounded-xl border border-latte bg-cream/40 p-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mocha/10 text-sm text-mocha">
                {h.icon}
              </div>
              <div className="text-xs">
                <span className="block text-[9px] font-bold uppercase text-espresso/50">
                  {h.label}
                </span>
                <span className="font-bold text-espresso">{h.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick FAQ */}
      <div className="card space-y-4 bg-white p-6">
        <h3 className="font-serif text-base font-bold text-espresso">
          Quick FAQ
        </h3>
        <ul className="space-y-3 text-xs text-espresso/70">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-caramel">?</span>
            <span>
              <strong className="text-espresso">
                Does this form confirm my slot?
              </strong>{" "}
              No — a slot is only locked after your {settings.deposit_percent}%
              deposit is verified.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-caramel">?</span>
            <span>
              <strong className="text-espresso">When do you arrive?</strong>{" "}
              Typically 1–2 hours before your event start for setup and testing.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-caramel">?</span>
            <span>
              <strong className="text-espresso">How are payments made?</strong>{" "}
              The deposit is paid online via GCash or card to reserve your date.
            </span>
          </li>
        </ul>
      </div>

      {/* Support */}
      <div className="rounded-2xl border border-mocha/20 bg-mocha/5 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-mocha">
          🎧 Have a question?
        </div>
        <p className="mt-2 text-xs text-espresso/70">
          Reach our team before booking if you have special venue or equipment
          requirements.
        </p>
        <Link
          href="/"
          className="btn mt-3 w-full border border-mocha/30 py-2.5 text-xs font-extrabold uppercase text-mocha hover:bg-mocha/10"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
