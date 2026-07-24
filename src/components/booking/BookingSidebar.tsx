import type { FaqItem, Settings } from "@/lib/types";

type Props = {
  settings: Settings;
  sidebarTitle?: string;
  sidebarDescription?: string;
  sidebarFaqs?: FaqItem[];
};

export function BookingSidebar({
  settings,
  sidebarTitle,
  sidebarDescription,
  sidebarFaqs,
}: Props) {
  const title = sidebarTitle || "What you get";
  const description =
    sidebarDescription ||
    "A full mobile espresso bar, premium beans, a friendly barista, and all the gear — we're small, but we're intentional. Setup and cleanup are on us.";

  const faqs: FaqItem[] =
    sidebarFaqs && sidebarFaqs.length > 0
      ? sidebarFaqs
      : [
          {
            question: "Does this form lock in my date?",
            answer: `Not yet. Your date is reserved once the ${settings.deposit_percent}% deposit goes through.`,
          },
          {
            question: "When do you show up?",
            answer:
              "We arrive 1–2 hours early to set everything up and test the equipment.",
          },
          {
            question: "How do I pay?",
            answer:
              "The deposit is paid online (GCash or card). The remaining balance is due on or before the event day.",
          },
        ];

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="border-b border-latte/30 px-5 py-4">
          <h3 className="font-serif text-base text-espresso">
            {title}
          </h3>
        </div>
        <div className="space-y-3 p-5 text-sm text-espresso/60">
          <p>{description}</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between rounded-lg bg-sand/30 px-3 py-2.5">
              <span className="text-espresso/35">Service area</span>
              <span className="font-medium text-espresso/70">
                {settings.service_area}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-sand/30 px-3 py-2.5">
              <span className="text-espresso/35">Standard hours</span>
              <span className="font-medium text-espresso/70">
                {settings.standard_hours} hours
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-sand/30 px-3 py-2.5">
              <span className="text-espresso/35">Deposit to reserve</span>
              <span className="font-medium text-espresso/70">
                {settings.deposit_percent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-medium text-espresso/70">
          Common questions
        </h3>
        <ul className="mt-3 space-y-2.5">
          {faqs.map((faq, i) => (
            <SidebarFaqItem key={i} q={faq.question}>
              {faq.answer}
            </SidebarFaqItem>
          ))}
        </ul>
      </div>

      {settings.business_email && (
        <div className="card p-5">
          <p className="text-sm font-medium text-espresso/60">
            Questions before booking?
          </p>
          <p className="mt-1 text-xs text-espresso/35">
            Drop us a line &mdash; we&apos;re happy to help.
          </p>
          <p className="mt-2 text-xs font-medium text-mocha">
            {settings.business_email}
          </p>
        </div>
      )}
    </div>
  );
}

function SidebarFaqItem({
  q,
  children,
}: {
  q: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg bg-sand/20 p-3 text-xs">
      <p className="font-medium text-espresso/70">{q}</p>
      <p className="mt-0.5 leading-relaxed text-espresso/45">{children}</p>
    </li>
  );
}
