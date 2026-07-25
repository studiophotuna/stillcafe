"use client";

import { Fragment, useMemo, useState } from "react";
import Image from "next/image";
import type { FaqItem, Package, PaymentMethod, Settings } from "@/lib/types";
import { formatDate, formatMoney, methodLabel } from "@/lib/format";
import { computeQuote } from "@/lib/pricing";
import { DEFAULT_COPY, interpolate, type SiteCopy } from "@/lib/copy";
import { AvailabilityCalendar } from "./AvailabilityCalendar";

type Props = {
  packages: Package[];
  settings: Settings;
  bookedDates: string[];
  initialPackageSlug?: string;
  policies?: string[];
  wizardFaqs?: FaqItem[];
  copy?: SiteCopy;
  /** Show the live booking summary sidebar (full booking page only). */
  withSummary?: boolean;
};

const DEFAULT_EVENT_TYPES = [
  "Wedding",
  "Birthday",
  "Corporate event",
  "Holiday party",
  "Other",
];

export function BookingWizard({
  packages,
  settings,
  bookedDates,
  initialPackageSlug,
  policies: cmsPolicies,
  wizardFaqs: cmsWizardFaqs,
  copy = DEFAULT_COPY,
  withSummary = false,
}: Props) {
  const STEP_TITLES = copy.step_titles;
  const STEP_INTROS = copy.step_intros;
  const initial = packages.find((p) => p.slug === initialPackageSlug);

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial ? [initial.id] : []
  );
  const [extraHours, setExtraHours] = useState(0);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState("08:00");
  const [venueCity, setVenueCity] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState("");
  const [eventType, setEventType] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(
    settings.payment_methods[0] ?? "gcash"
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const bookedSet = useMemo(() => new Set(bookedDates), [bookedDates]);
  const selectedPackages = useMemo(
    () => packages.filter((p) => selectedIds.includes(p.id)),
    [packages, selectedIds]
  );
  const quote = useMemo(
    () => computeQuote(selectedPackages, extraHours, settings),
    [selectedPackages, extraHours, settings]
  );

  const lastStep = STEP_TITLES.length - 1;

  function togglePackage(id: string) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  function fail(msg: string): boolean {
    setError(msg);
    return false;
  }

  function validate(current: number): boolean {
    setError(null);
    if (current === 2) {
      if (!date) return fail("Please pick a date first.");
      if (bookedSet.has(date))
        return fail("That date is taken. Try another one.");
    }
    if (current === 3 && selectedPackages.length === 0)
      return fail("Pick at least one package to continue.");
    if (current === 4) {
      if (!venueCity) return fail("Which city is your event in?");
      if (!venueName.trim()) return fail("What's the venue called?");
      if (!venueAddress.trim()) return fail("We need the venue address.");
    }
    if (current === 5) {
      if (!name.trim()) return fail("We need your name.");
      if (!/^[0-9+\-\s()]{7,}$/.test(phone.trim()))
        return fail("That doesn't look like a valid number.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return fail("That email doesn't look right.");
      const g = Number(guests);
      if (!g || g < settings.min_guests || g > settings.max_guests)
        return fail(`Guest count should be between ${settings.min_guests} and ${settings.max_guests}.`);
      if (!eventType) return fail("What kind of event is this?");
    }
    if (current === 6 && !terms)
      return fail("Please confirm you've read the details above.");
    return true;
  }

  function next() {
    if (!validate(step)) return;
    setStep((s) => Math.min(s + 1, lastStep));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    for (let s = 2; s <= 6; s++) {
      if (!validate(s)) {
        setStep(s);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_ids: selectedIds,
          extra_hours: extraHours,
          method,
          date,
          time,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          venue_city: venueCity,
          venue_name: venueName,
          venue_address: venueAddress,
          maps_link: mapsLink,
          event_type: eventType,
          guests: Number(guests),
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      window.location.href = json.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
      setSubmitting(false);
    }
  }

  const showQuote = selectedPackages.length > 0 && step >= 3;
  const showInclusions = selectedPackages.length > 0 && step === 3;

  return (
    <div className={withSummary ? "grid items-start gap-5 lg:grid-cols-[1fr_300px]" : "contents"}>
    <div className={withSummary ? "min-w-0" : "contents"}>
    <div className="card overflow-hidden">
      <div className="border-b border-latte/30 px-6 py-5 sm:px-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-espresso/30">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
        <h2 className="mt-1 font-serif text-lg text-espresso sm:text-xl">
          {STEP_TITLES[step]}
        </h2>
      </div>

      <div className="flex items-start px-4 py-3 sm:px-8">
        {STEP_TITLES.map((t, i) => {
          const done = i < step;
          const current = i === step;
          const clickable = i < step;
          return (
            <Fragment key={t}>
              <button
                type="button"
                onClick={() => {
                  if (clickable) {
                    setError(null);
                    setStep(i);
                  }
                }}
                aria-current={current ? "step" : undefined}
                className={`flex shrink-0 flex-col items-center ${
                  clickable ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                    done
                      ? "bg-mocha text-cream"
                      : current
                        ? "border-2 border-maroon bg-card text-maroon"
                        : "border-2 border-latte/50 bg-card text-espresso/30"
                  }`}
                >
                  {done ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={`mt-1.5 hidden w-16 text-center text-[10px] leading-tight sm:block ${
                    current
                      ? "font-medium text-espresso"
                      : done
                        ? "text-espresso/50"
                        : "text-espresso/30"
                  }`}
                >
                  {t}
                </span>
              </button>
              {i < STEP_TITLES.length - 1 && (
                <span
                  className={`mt-3.5 h-0.5 flex-1 rounded-full transition-colors ${
                    i < step ? "bg-mocha" : "bg-latte/40"
                  }`}
                />
              )}
            </Fragment>
          );
        })}
      </div>

      <div className="p-6 sm:p-8">
        <div key={step} className="min-h-[300px] animate-fade-in">
          {step === 0 && <PoliciesStep settings={settings} policies={cmsPolicies} intro={STEP_INTROS[0]} />}
          {step === 1 && <FaqStep settings={settings} wizardFaqs={cmsWizardFaqs} intro={STEP_INTROS[1]} />}
          {step === 2 && (
            <div>
              <p className="mb-4 text-sm text-espresso/45">
                {STEP_INTROS[2]}
              </p>
              <AvailabilityCalendar
                bookedDates={bookedDates}
                selected={date}
                onSelect={setDate}
              />
            </div>
          )}
          {step === 3 && (
            <PackagesStep
              packages={packages}
              selectedIds={selectedIds}
              onToggle={togglePackage}
              extraHours={extraHours}
              onExtraHours={setExtraHours}
              settings={settings}
              quote={quote}
              intro={STEP_INTROS[3]}
            />
          )}
          {step === 4 && (
            <ScheduleStep
              settings={settings}
              date={date}
              time={time}
              onTime={setTime}
              venueCity={venueCity}
              onCity={setVenueCity}
              venueName={venueName}
              onVenueName={setVenueName}
              venueAddress={venueAddress}
              onVenueAddress={setVenueAddress}
              mapsLink={mapsLink}
              onMapsLink={setMapsLink}
              intro={STEP_INTROS[4]}
            />
          )}
          {step === 5 && (
            <ContactStep
              settings={settings}
              name={name}
              onName={setName}
              phone={phone}
              onPhone={setPhone}
              email={email}
              onEmail={setEmail}
              guests={guests}
              onGuests={setGuests}
              eventType={eventType}
              onEventType={setEventType}
              notes={notes}
              onNotes={setNotes}
              intro={STEP_INTROS[5]}
            />
          )}
          {step === 6 && (
            <ConfirmStep
              settings={settings}
              terms={terms}
              onTerms={setTerms}
              method={method}
              methods={settings.payment_methods}
              onMethod={setMethod}
              intro={STEP_INTROS[6]}
              depositNote={copy.deposit_note}
              termsText={copy.terms_text}
            />
          )}
        </div>

        {showQuote && (
          <div className={`mt-6 overflow-hidden rounded-xl border border-latte/30 bg-espresso/[0.03] ${withSummary ? "lg:hidden" : ""}`}>
            <div className="p-5">
              <h4 className="text-xs font-medium text-espresso/35">
                Your estimate
              </h4>
              <ul className="mt-3 space-y-1.5">
                {quote.lines.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-espresso/50">{l.label}</span>
                    <span
                      className={
                        l.amountCents < 0 ? "text-sage" : "text-espresso/70"
                      }
                    >
                      {l.amountCents < 0 ? "-" : ""}
                      {formatMoney(Math.abs(l.amountCents))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between border-t border-latte/30 bg-espresso/[0.02] px-5 py-4">
              <div>
                <span className="text-xs text-espresso/40">
                  {settings.deposit_percent}% deposit
                </span>
                <strong className="ml-3 text-lg font-semibold text-maroon">
                  {formatMoney(quote.depositCents)}
                </strong>
              </div>
              <span className="text-xs text-espresso/30">
                Total: {formatMoney(quote.totalCents)}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || submitting}
            className="btn-secondary w-1/3 py-2.5 disabled:opacity-30"
          >
            Back
          </button>
          {step < lastStep ? (
            <button
              type="button"
              onClick={next}
              className="btn-primary w-2/3 py-2.5"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="btn w-2/3 rounded-lg bg-maroon py-2.5 font-medium text-cream transition-colors hover:bg-mocha disabled:opacity-50"
            >
              {submitting
                ? "Redirecting to payment..."
                : `Pay ${formatMoney(quote.depositCents)} deposit`}
            </button>
          )}
        </div>
      </div>
    </div>

    {showInclusions && (
      <div className="mt-4 animate-fade-in space-y-2 rounded-xl border border-latte/30 bg-sand/20 p-5">
        <h4 className="text-xs font-medium text-espresso/35">
          What&apos;s included
        </h4>
        {selectedPackages.map((p) => (
          <div key={p.id} className="text-xs text-espresso/55">
            <span className="font-medium text-espresso/70">{p.name}</span>
            {p.inclusions.length > 0 && (
              <span> &mdash; {p.inclusions.join(", ")}</span>
            )}
          </div>
        ))}
      </div>
    )}
    </div>

    {withSummary && (
      <aside className="hidden lg:sticky lg:top-24 lg:block">
        <OrderSummary
          selectedPackages={selectedPackages}
          extraHours={extraHours}
          settings={settings}
          quote={quote}
          date={date}
          time={time}
          guests={guests}
          venueCity={venueCity}
          eventType={eventType}
        />
      </aside>
    )}
    </div>
  );
}

function OrderSummary({
  selectedPackages,
  extraHours,
  settings,
  quote,
  date,
  time,
  guests,
  venueCity,
  eventType,
}: {
  selectedPackages: Package[];
  extraHours: number;
  settings: Settings;
  quote: ReturnType<typeof computeQuote>;
  date: string | null;
  time: string;
  guests: string;
  venueCity: string;
  eventType: string;
}) {
  const hasMeta = date || guests || venueCity || eventType;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-latte/30 px-5 py-4">
        <h3 className="font-serif text-base text-espresso">Your booking</h3>
      </div>
      <div className="p-5">
        {selectedPackages.length === 0 ? (
          <p className="text-xs leading-relaxed text-espresso/40">
            Pick a package and your running estimate will appear here.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {selectedPackages.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 text-xs">
                  <span className="text-espresso/70">{p.name}</span>
                  <span className="shrink-0 text-espresso/50">
                    {formatMoney(p.price_cents)}
                  </span>
                </li>
              ))}
              {extraHours > 0 && (
                <li className="flex justify-between gap-3 text-xs">
                  <span className="text-espresso/70">
                    +{extraHours} extra hour{extraHours > 1 ? "s" : ""}
                  </span>
                  <span className="shrink-0 text-espresso/50">
                    {formatMoney(extraHours * settings.extra_hour_cents)}
                  </span>
                </li>
              )}
              {quote.comboDiscountCents > 0 && (
                <li className="flex justify-between gap-3 text-xs">
                  <span className="text-sage">Combo discount</span>
                  <span className="shrink-0 text-sage">
                    -{formatMoney(quote.comboDiscountCents)}
                  </span>
                </li>
              )}
            </ul>
            <div className="mt-3 space-y-1.5 border-t border-latte/30 pt-3">
              <div className="flex justify-between text-xs">
                <span className="text-espresso/50">Total</span>
                <span className="font-medium text-espresso">
                  {formatMoney(quote.totalCents)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-espresso/40">
                  {settings.deposit_percent}% deposit
                </span>
                <strong className="text-base font-semibold text-maroon">
                  {formatMoney(quote.depositCents)}
                </strong>
              </div>
            </div>
          </>
        )}

        {hasMeta && (
          <dl className="mt-4 space-y-1.5 border-t border-latte/30 pt-4 text-xs">
            {date && <SummaryMeta label="Date" value={formatDate(date)} />}
            {date && time && (
              <SummaryMeta label="Time" value={formatTime12(time)} />
            )}
            {guests && <SummaryMeta label="Guests" value={guests} />}
            {venueCity && <SummaryMeta label="City" value={venueCity} />}
            {eventType && <SummaryMeta label="Event" value={eventType} />}
          </dl>
        )}
      </div>
    </div>
  );
}

function SummaryMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-espresso/40">{label}</dt>
      <dd className="text-right font-medium text-espresso/70">{value}</dd>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-latte/30 bg-sand/20 p-4">
      <span className="text-sm leading-relaxed text-espresso/55">
        {children}
      </span>
    </div>
  );
}

function PoliciesStep({
  settings,
  policies,
  intro,
}: {
  settings: Settings;
  policies?: string[];
  intro: string;
}) {
  const items = policies && policies.length > 0
    ? policies
    : [
        `We currently serve {service_area} only.`,
        `A {deposit_percent}% deposit is needed to lock in your date. Without it, the date stays open for others.`,
        `We arrive early to set up and test everything, so you don't have to worry about a thing.`,
        `Everything you need is included — our team handles setup and teardown so you can focus on your guests.`,
      ];

  function interpolate(text: string) {
    return text
      .replace(/\{service_area\}/g, settings.service_area)
      .replace(/\{deposit_percent\}/g, String(settings.deposit_percent));
  }

  return (
    <div>
      <p className="mb-4 text-sm text-espresso/45">{intro}</p>
      <div className="space-y-2.5">
        {items.map((text, i) => (
          <Tip key={i}>{interpolate(text)}</Tip>
        ))}
      </div>
    </div>
  );
}

function FaqStep({
  settings,
  wizardFaqs,
  intro,
}: {
  settings: Settings;
  wizardFaqs?: FaqItem[];
  intro: string;
}) {
  const items: FaqItem[] = wizardFaqs && wizardFaqs.length > 0
    ? wizardFaqs
    : [
        { question: "Does this form confirm my date?", answer: "Not yet. Your date is only locked once the {deposit_percent}% deposit is paid." },
        { question: "How many guests can I have?", answer: "We can handle anywhere from 20 to 500. Just give us your best estimate." },
        { question: "Can I cancel after paying?", answer: "The deposit is non-refundable, but you can move to another available date." },
        { question: "What if we go overtime?", answer: "You can add extra hours during booking, or we can arrange it before your event." },
      ];

  function interpolate(text: string) {
    return text
      .replace(/\{service_area\}/g, settings.service_area)
      .replace(/\{deposit_percent\}/g, String(settings.deposit_percent));
  }

  return (
    <div>
      <p className="mb-4 text-sm text-espresso/45">{intro}</p>
      <div className="space-y-2.5">
        {items.map((faq, i) => (
          <Tip key={i}>
            <strong className="text-espresso/70">{interpolate(faq.question)}</strong>
            <br />
            {interpolate(faq.answer)}
          </Tip>
        ))}
      </div>
    </div>
  );
}

function PackagesStep({
  packages,
  selectedIds,
  onToggle,
  extraHours,
  onExtraHours,
  settings,
  quote,
  intro,
}: {
  packages: Package[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  extraHours: number;
  onExtraHours: (n: number) => void;
  settings: Settings;
  quote: ReturnType<typeof computeQuote>;
  intro: string;
}) {
  return (
    <div>
      <p className="mb-1 text-sm text-espresso/45">{intro}</p>
      {settings.combo_discount_cents > 0 && (
        <p className="mb-4 text-xs text-mocha">
          {formatMoney(settings.combo_discount_cents)} off when you pick{" "}
          {settings.combo_min_packages} or more
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {packages.map((p) => {
          const active = selectedIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className={`group overflow-hidden rounded-xl border-2 text-left transition-all duration-200 ${
                active
                  ? "border-mocha bg-mocha/5 shadow-card"
                  : "border-latte/40 bg-card hover:-translate-y-0.5 hover:border-mocha/30 hover:shadow-card"
              }`}
            >
              {p.image_url && (
                <div className="relative h-36 w-full overflow-hidden bg-sand/30">
                  <Image
                    src={p.image_url}
                    alt={p.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-espresso">
                      {p.name}
                    </span>
                    <span className="mt-1 block text-xs text-espresso/45">
                      {formatMoney(p.price_cents)} &middot; {p.duration_hours}h
                    </span>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] transition-all duration-150 ${
                      active
                        ? "border-mocha bg-mocha text-cream"
                        : "border-latte/60 text-transparent group-hover:border-mocha/40"
                    }`}
                  >
                    ✓
                  </div>
                </div>
                {p.description && (
                  <p className="mt-2 text-[11px] leading-relaxed text-espresso/40">
                    {p.description}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <label className="field-label">Need more time?</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onExtraHours(Math.max(0, extraHours - 1))}
            disabled={extraHours === 0}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-latte/40 text-espresso/50 transition-colors hover:border-mocha/40 hover:text-mocha disabled:opacity-30 disabled:hover:border-latte/40 disabled:hover:text-espresso/50"
          >
            <span className="text-lg leading-none">&minus;</span>
          </button>
          <div className="min-w-[80px] text-center">
            <span className="text-lg font-semibold text-espresso">{extraHours}</span>
            <span className="ml-1.5 text-xs text-espresso/40">
              {extraHours === 1 ? "hour" : "hours"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onExtraHours(Math.min(3, extraHours + 1))}
            disabled={extraHours >= 3}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-latte/40 text-espresso/50 transition-colors hover:border-mocha/40 hover:text-mocha disabled:opacity-30 disabled:hover:border-latte/40 disabled:hover:text-espresso/50"
          >
            <span className="text-lg leading-none">+</span>
          </button>
        </div>
        {extraHours > 0 && (
          <p className="mt-1.5 text-xs text-mocha">
            +{formatMoney(extraHours * settings.extra_hour_cents)}
          </p>
        )}
      </div>
    </div>
  );
}

const inputCls = "field-input";

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

const TIME_PRESETS = ["08:00", "10:00", "14:00", "17:00"];

function formatTime12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function ScheduleStep({
  settings,
  date,
  time,
  onTime,
  venueCity,
  onCity,
  venueName,
  onVenueName,
  venueAddress,
  onVenueAddress,
  mapsLink,
  onMapsLink,
  intro,
}: {
  settings: Settings;
  date: string | null;
  time: string;
  onTime: (v: string) => void;
  venueCity: string;
  onCity: (v: string) => void;
  venueName: string;
  onVenueName: (v: string) => void;
  venueAddress: string;
  onVenueAddress: (v: string) => void;
  mapsLink: string;
  onMapsLink: (v: string) => void;
  intro: string;
}) {
  const isCustom = !TIME_PRESETS.includes(time);
  const [showCustom, setShowCustom] = useState(isCustom && time !== "08:00");

  return (
    <div className="space-y-4">
      <p className="text-sm text-espresso/45">{intro}</p>
      <Field label="Date">
        <input
          type="text"
          readOnly
          value={date ?? ""}
          placeholder="Selected in previous step"
          className={`${inputCls} bg-sand/40`}
        />
      </Field>
      <Field label="Start time">
        <div className="flex flex-wrap gap-2">
          {TIME_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onTime(t); setShowCustom(false); }}
              className={time === t && !showCustom ? "chip-on" : "chip-off"}
            >
              {formatTime12(t)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className={showCustom ? "chip-on" : "chip-off"}
          >
            Custom
          </button>
        </div>
        {showCustom && (
          <input
            type="time"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            className={`${inputCls} mt-2`}
          />
        )}
      </Field>
      <Field label="City">
        {settings.service_cities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {settings.service_cities.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCity(c)}
                className={venueCity === c ? "chip-on" : "chip-off"}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <input
            value={venueCity}
            onChange={(e) => onCity(e.target.value)}
            placeholder="City or town"
            className={inputCls}
          />
        )}
      </Field>
      <Field label="Venue name">
        <input
          value={venueName}
          onChange={(e) => onVenueName(e.target.value)}
          placeholder="e.g. The Grand Ballroom"
          className={inputCls}
        />
      </Field>
      <Field label="Address">
        <input
          value={venueAddress}
          onChange={(e) => onVenueAddress(e.target.value)}
          placeholder="Street address or building"
          className={inputCls}
        />
      </Field>
      <Field label="Google Maps link (optional)">
        <input
          type="url"
          value={mapsLink}
          onChange={(e) => onMapsLink(e.target.value)}
          placeholder="Paste a pin link if you have one"
          className={inputCls}
        />
      </Field>
    </div>
  );
}

function ContactStep({
  settings,
  name,
  onName,
  phone,
  onPhone,
  email,
  onEmail,
  guests,
  onGuests,
  eventType,
  onEventType,
  notes,
  onNotes,
  intro,
}: {
  settings: Settings;
  name: string;
  onName: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  guests: string;
  onGuests: (v: string) => void;
  eventType: string;
  onEventType: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
  intro: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-espresso/45">{intro}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Full name"
            className={inputCls}
          />
        </Field>
        <Field label="Contact number">
          <input
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="09XXXXXXXXX"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="you@email.com"
            className={inputCls}
          />
        </Field>
        <Field label="Estimated guests">
          <input
            type="number"
            min={settings.min_guests}
            max={settings.max_guests}
            value={guests}
            onChange={(e) => onGuests(e.target.value)}
            placeholder="120"
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Type of event">
        <div className="flex flex-wrap gap-2">
          {(settings.event_types?.length ? settings.event_types : DEFAULT_EVENT_TYPES).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onEventType(t)}
              className={eventType === t ? "chip-on" : "chip-off"}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Anything else we should know? (optional)">
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Theme, styling preferences, special requests..."
          className={`${inputCls} h-20 resize-none`}
        />
      </Field>
    </div>
  );
}

function ConfirmStep({
  settings,
  terms,
  onTerms,
  method,
  methods,
  onMethod,
  intro,
  depositNote,
  termsText,
}: {
  settings: Settings;
  terms: boolean;
  onTerms: (v: boolean) => void;
  method: PaymentMethod;
  methods: PaymentMethod[];
  onMethod: (m: PaymentMethod) => void;
  intro: string;
  depositNote: string;
  termsText: string;
}) {
  return (
    <div>
      <p className="mb-5 text-sm text-espresso/45">{intro}</p>

      <div className="mb-5">
        <label className="field-label">Payment method</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMethod(m)}
              className={`rounded-lg border-2 px-3 py-3 text-xs font-medium transition-all duration-150 active:scale-[0.98] ${
                method === m
                  ? "border-mocha bg-mocha/5 text-mocha"
                  : "border-latte/40 bg-card text-espresso/50 hover:border-mocha/30 hover:text-espresso/70"
              }`}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-latte/30 bg-sand/20 p-4 text-xs leading-relaxed text-espresso/50">
        {interpolate(depositNote, {
          deposit_percent: settings.deposit_percent,
          service_area: settings.service_area,
        })}
      </div>

      <label className="flex items-start gap-3 rounded-lg border-2 border-latte/30 bg-card p-4 text-xs text-espresso transition-colors hover:border-latte/50">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => onTerms(e.target.checked)}
          className="mt-0.5 accent-mocha"
        />
        <span className="leading-relaxed text-espresso/55">{termsText}</span>
      </label>
    </div>
  );
}
