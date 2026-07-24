"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { FaqItem, Package, PaymentMethod, Settings } from "@/lib/types";
import { formatMoney, methodLabel } from "@/lib/format";
import { computeQuote } from "@/lib/pricing";
import { AvailabilityCalendar } from "./AvailabilityCalendar";

type Props = {
  packages: Package[];
  settings: Settings;
  bookedDates: string[];
  initialPackageSlug?: string;
  policies?: string[];
  wizardFaqs?: FaqItem[];
};

const STEP_TITLES = [
  "Good to know",
  "Quick FAQ",
  "Pick a date",
  "Choose your setup",
  "Event details",
  "Your info",
  "Review & pay",
];

export function BookingWizard({
  packages,
  settings,
  bookedDates,
  initialPackageSlug,
  policies,
  wizardFaqs,
}: Props) {
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

  const eventTypes = settings.event_types?.length
    ? settings.event_types
    : ["Wedding", "Birthday", "Corporate event", "Other"];

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
      if (!g || g < (settings.min_guests ?? 20) || g > (settings.max_guests ?? 500))
        return fail(`Guest count should be between ${settings.min_guests ?? 20} and ${settings.max_guests ?? 500}.`);
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

  function interpolate(text: string): string {
    return text
      .replace(/\{service_area\}/g, settings.service_area)
      .replace(/\{deposit_percent\}/g, String(settings.deposit_percent));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-espresso/8 bg-white shadow-card">
      {/* Header */}
      <div className="border-b border-espresso/8 px-6 py-5 sm:px-8">
        <p className="text-[10px] uppercase tracking-[0.2em] text-espresso/30">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
        <h2 className="mt-1 font-serif text-xl text-espresso">
          {STEP_TITLES[step]}
        </h2>
      </div>

      {/* Progress */}
      <div className="flex gap-0 bg-sand/30">
        {STEP_TITLES.map((t, i) => (
          <div key={t} className="flex-1">
            <div
              className={`h-0.5 transition-all duration-500 ${
                i < step
                  ? "bg-mocha"
                  : i === step
                    ? "bg-espresso"
                    : "bg-transparent"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="p-6 sm:p-8">
        <div className="min-h-[300px]">
          {step === 0 && (
            <PoliciesStep
              settings={settings}
              policies={policies}
              interpolate={interpolate}
            />
          )}
          {step === 1 && (
            <FaqStep
              settings={settings}
              wizardFaqs={wizardFaqs}
              interpolate={interpolate}
            />
          )}
          {step === 2 && (
            <div>
              <p className="mb-4 text-sm text-espresso/45">
                Dates that are crossed out are already taken.
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
            />
          )}
          {step === 5 && (
            <ContactStep
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
              eventTypes={eventTypes}
              notes={notes}
              onNotes={setNotes}
              settings={settings}
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
            />
          )}
        </div>

        {showQuote && (
          <div className="mt-6 overflow-hidden rounded-xl border border-espresso/8 bg-espresso text-cream">
            <div className="p-5">
              <h4 className="text-[10px] uppercase tracking-[0.15em] text-cream/40">
                Your estimate
              </h4>
              <ul className="mt-3 space-y-1.5">
                {quote.lines.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-cream/50">{l.label}</span>
                    <span
                      className={
                        l.amountCents < 0 ? "text-caramel" : "text-cream/80"
                      }
                    >
                      {l.amountCents < 0 ? "-" : ""}
                      {formatMoney(Math.abs(l.amountCents))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between border-t border-cream/10 bg-cream/5 px-5 py-4">
              <div>
                <span className="text-[10px] uppercase tracking-[0.1em] text-cream/40">
                  {settings.deposit_percent}% deposit
                </span>
                <strong className="ml-3 text-lg font-bold text-caramel">
                  {formatMoney(quote.depositCents)}
                </strong>
              </div>
              <span className="text-xs text-cream/30">
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
            className="w-1/3 rounded-full border border-espresso/15 bg-white px-4 py-3 text-xs font-medium text-espresso/50 transition hover:border-espresso/30 hover:text-espresso disabled:opacity-30"
          >
            Back
          </button>
          {step < lastStep ? (
            <button
              type="button"
              onClick={next}
              className="w-2/3 rounded-full bg-espresso px-4 py-3 text-xs font-semibold text-cream transition hover:bg-mocha active:scale-[0.98]"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="w-2/3 rounded-full bg-sage px-4 py-3 text-xs font-semibold text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting
                ? "Redirecting to payment..."
                : `Pay ${formatMoney(quote.depositCents)} deposit`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-espresso/8 bg-sand/30 p-4">
      <span className="text-sm leading-relaxed text-espresso/60">
        {children}
      </span>
    </div>
  );
}

function PoliciesStep({
  settings,
  policies,
  interpolate,
}: {
  settings: Settings;
  policies?: string[];
  interpolate: (s: string) => string;
}) {
  const items = policies?.length
    ? policies
    : [
        `We currently serve ${settings.service_area} only.`,
        `A ${settings.deposit_percent}% deposit is needed to lock in your date.`,
        "We show up early to set up and test everything.",
        "You get a full professional setup. Setup and teardown are included.",
      ];

  return (
    <div>
      <p className="mb-4 text-sm text-espresso/45">
        A few things worth knowing before you fill this out.
      </p>
      <div className="space-y-3">
        {items.map((item, i) => (
          <Tip key={i}>
            <span dangerouslySetInnerHTML={{ __html: interpolate(item) }} />
          </Tip>
        ))}
      </div>
    </div>
  );
}

function FaqStep({
  settings,
  wizardFaqs,
  interpolate,
}: {
  settings: Settings;
  wizardFaqs?: FaqItem[];
  interpolate: (s: string) => string;
}) {
  const items = wizardFaqs?.length
    ? wizardFaqs
    : [
        { question: "Does this form confirm my date?", answer: `Not yet. Your date is only locked once the ${settings.deposit_percent}% deposit is paid.` },
        { question: "How many guests can I have?", answer: "We can handle anywhere from 20 to 500. Just give us your best estimate." },
        { question: "Can I cancel after paying?", answer: "The deposit is non-refundable, but you can move to another available date." },
        { question: "What if we go overtime?", answer: "You can add extra hours during booking, or we can arrange it before your event." },
      ];

  return (
    <div>
      <p className="mb-4 text-sm text-espresso/45">
        Answers to things people usually ask.
      </p>
      <div className="space-y-3">
        {items.map((faq, i) => (
          <Tip key={i}>
            <strong className="text-espresso">{interpolate(faq.question)}</strong>
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
}: {
  packages: Package[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  extraHours: number;
  onExtraHours: (n: number) => void;
  settings: Settings;
  quote: ReturnType<typeof computeQuote>;
}) {
  return (
    <div>
      <p className="mb-1 text-sm text-espresso/45">
        Pick one or combine a few.
      </p>
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
              className={`group overflow-hidden rounded-xl border text-left transition-all duration-200 ${
                active
                  ? "border-espresso/30 bg-sand/40 shadow-sm"
                  : "border-espresso/8 bg-white hover:border-espresso/20"
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
                    <span className="block text-sm font-semibold text-espresso">
                      {p.name}
                    </span>
                    <span className="mt-1 block text-xs text-espresso/40">
                      {formatMoney(p.price_cents)} &middot; {p.duration_hours}h
                    </span>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 text-[10px] ${
                      active
                        ? "border-espresso bg-espresso text-cream"
                        : "border-espresso/20 text-transparent group-hover:border-espresso/40"
                    }`}
                  >
                    ✓
                  </div>
                </div>
                {p.description && (
                  <p className="mt-2 text-[11px] leading-relaxed text-espresso/35">
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
        <select
          value={extraHours}
          onChange={(e) => onExtraHours(Number(e.target.value))}
          className="field-input"
        >
          <option value={0}>No extra hours</option>
          {[1, 2, 3].map((h) => (
            <option key={h} value={h}>
              +{h} hour{h > 1 ? "s" : ""} (
              {formatMoney(h * settings.extra_hour_cents)})
            </option>
          ))}
        </select>
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-5 space-y-2 rounded-lg border border-espresso/8 bg-sand/30 p-4">
          <h4 className="text-[10px] uppercase tracking-[0.1em] text-espresso/35">
            What&apos;s included
          </h4>
          {packages
            .filter((p) => selectedIds.includes(p.id))
            .map((p) => (
              <div key={p.id} className="text-xs text-espresso/55">
                <span className="font-semibold text-espresso">{p.name}</span>
                {p.inclusions.length > 0 && (
                  <span> — {p.inclusions.join(", ")}</span>
                )}
              </div>
            ))}
        </div>
      )}
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
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-espresso/45">
        Where and when is the event?
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <input
            type="time"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="City">
        <select
          value={venueCity}
          onChange={(e) => onCity(e.target.value)}
          className={inputCls}
        >
          <option value="">Select city</option>
          {settings.service_cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Venue name">
        <input
          value={venueName}
          onChange={(e) => onVenueName(e.target.value)}
          placeholder="e.g. The Blue Leaf Events Pavilion"
          className={inputCls}
        />
      </Field>
      <Field label="Address">
        <input
          value={venueAddress}
          onChange={(e) => onVenueAddress(e.target.value)}
          placeholder="Street, barangay, or building"
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
  eventTypes,
  notes,
  onNotes,
  settings,
}: {
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
  eventTypes: string[];
  notes: string;
  onNotes: (v: string) => void;
  settings: Settings;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-espresso/45">
        So we know who to coordinate with.
      </p>
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
            min={settings.min_guests ?? 20}
            max={settings.max_guests ?? 500}
            value={guests}
            onChange={(e) => onGuests(e.target.value)}
            placeholder="120"
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Type of event">
        <select
          value={eventType}
          onChange={(e) => onEventType(e.target.value)}
          className={inputCls}
        >
          <option value="">Select one</option>
          {eventTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
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
}: {
  settings: Settings;
  terms: boolean;
  onTerms: (v: boolean) => void;
  method: PaymentMethod;
  methods: PaymentMethod[];
  onMethod: (m: PaymentMethod) => void;
}) {
  return (
    <div>
      <p className="mb-5 text-sm text-espresso/45">
        Almost there. Pick how you&apos;d like to pay the deposit.
      </p>

      <div className="mb-5">
        <label className="field-label">Payment method</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMethod(m)}
              className={`rounded-lg border px-3 py-3 text-xs font-medium transition-all duration-200 ${
                method === m
                  ? "border-espresso/30 bg-sand/40 text-espresso shadow-sm"
                  : "border-espresso/8 bg-white text-espresso/50 hover:border-espresso/20"
              }`}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-espresso/8 bg-sand/30 p-4 text-xs leading-relaxed text-espresso/50">
        You&apos;re paying {settings.deposit_percent}% now to lock your date. The
        rest is due on or before the event day. We&apos;ll send a confirmation
        to your email.
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-espresso/10 bg-white p-4 text-xs text-espresso transition hover:border-espresso/20">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => onTerms(e.target.checked)}
          className="mt-0.5 accent-espresso"
        />
        <span className="leading-relaxed text-espresso/55">
          I&apos;ve read the service area, cancellation, and setup info above and
          I&apos;m good to go.
        </span>
      </label>
    </div>
  );
}
