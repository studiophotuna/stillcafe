import type { Settings } from "@/lib/types";

export function BookingSidebar({ settings }: { settings: Settings }) {
  const highlights = [
    {
      icon: "○",
      label: "Service Area",
      value: `${settings.service_area} only`,
    },
    {
      icon: "○",
      label: "Coverage",
      value: `${settings.standard_hours} hours standard`,
    },
    {
      icon: "○",
      label: "Deposit",
      value: `${settings.deposit_percent}% to reserve`,
    },
    {
      icon: "○",
      label: "Confirmation",
      value: settings.business_email ?? "Via email",
    },
  ];

  return (
    <div className="space-y-5">
      {/* What's included */}
      <div className="card overflow-hidden">
        <div className="bg-espresso px-5 py-4">
          <h3 className="font-serif text-base font-semibold text-cream">
            What&apos;s included
          </h3>
          <p className="mt-0.5 text-[11px] text-cream/40">
            Every booking with {settings.business_name}
          </p>
        </div>
        <div className="divide-y divide-latte/40 px-5">
          {highlights.map((h) => (
            <div key={h.label} className="flex items-center gap-3 py-3.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sand text-[10px] font-bold text-mocha">
                {h.icon}
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-espresso/40">
                  {h.label}
                </span>
                <span className="block text-xs font-medium text-espresso">
                  {h.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="card p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-espresso/50">
          Quick FAQ
        </h3>
        <ul className="mt-3.5 space-y-3">
          <FaqItem q="Does this form confirm my slot?">
            No — a slot is only locked after your {settings.deposit_percent}%
            deposit is verified.
          </FaqItem>
          <FaqItem q="When do you arrive?">
            Typically 1&ndash;2 hours before your event start for setup and
            testing.
          </FaqItem>
          <FaqItem q="How are payments made?">
            The deposit is paid online via GCash or card to reserve your date.
            Balance is due on or before the event day.
          </FaqItem>
        </ul>
      </div>

      {/* Contact nudge */}
      <div className="rounded-2xl border border-caramel/15 bg-caramel/5 p-5">
        <p className="text-xs font-semibold text-espresso/70">
          Have a question?
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-espresso/50">
          Reach our team if you have special venue or equipment requirements
          before booking.
        </p>
        {settings.business_email && (
          <p className="mt-2 text-[11px] font-medium text-caramel">
            {settings.business_email}
          </p>
        )}
      </div>
    </div>
  );
}

function FaqItem({
  q,
  children,
}: {
  q: string;
  children: React.ReactNode;
}) {
  return (
    <li className="text-xs">
      <p className="font-semibold text-espresso">{q}</p>
      <p className="mt-0.5 leading-relaxed text-espresso/50">{children}</p>
    </li>
  );
}
