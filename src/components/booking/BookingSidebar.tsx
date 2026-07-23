import type { Settings } from "@/lib/types";

export function BookingSidebar({ settings }: { settings: Settings }) {
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="border-b border-latte bg-sand/50 px-5 py-4">
          <h3 className="text-sm font-semibold text-espresso">
            What you get
          </h3>
        </div>
        <div className="space-y-3 p-5 text-[14px] leading-relaxed text-espresso/50">
          <p>
            A full mobile espresso bar, premium beans, a friendly barista, and
            all the gear — we&apos;re small, but we&apos;re intentional.
            Setup and cleanup are on us.
          </p>
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between rounded-lg bg-sand/50 px-3 py-2.5">
              <span className="text-espresso/35">Service area</span>
              <span className="font-medium text-espresso">
                {settings.service_area}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-sand/50 px-3 py-2.5">
              <span className="text-espresso/35">Standard hours</span>
              <span className="font-medium text-espresso">
                {settings.standard_hours} hours
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-sand/50 px-3 py-2.5">
              <span className="text-espresso/35">Deposit to reserve</span>
              <span className="font-medium text-espresso">
                {settings.deposit_percent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-espresso">
          Common questions
        </h3>
        <ul className="mt-3 space-y-3">
          <FaqItem q="Does this form lock in my date?">
            Not yet. Your date is reserved once the {settings.deposit_percent}%
            deposit goes through.
          </FaqItem>
          <FaqItem q="When do you show up?">
            We arrive 1–2 hours early to set everything up and test the
            equipment.
          </FaqItem>
          <FaqItem q="How do I pay?">
            The deposit is paid online (GCash or card). The remaining balance is
            due on or before the event day.
          </FaqItem>
        </ul>
      </div>

      {settings.business_email && (
        <div className="rounded-2xl border border-latte bg-sand/40 p-5">
          <p className="text-sm font-medium text-espresso/60">
            Questions before booking?
          </p>
          <p className="mt-1 text-[13px] text-espresso/35">
            Drop us a line — we&apos;re happy to help.
          </p>
          <p className="mt-2 text-[13px] font-medium text-maroon">
            {settings.business_email}
          </p>
        </div>
      )}
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
    <li className="rounded-lg bg-sand/40 p-3 text-[13px]">
      <p className="font-medium text-espresso">{q}</p>
      <p className="mt-1 leading-relaxed text-espresso/40">{children}</p>
    </li>
  );
}
