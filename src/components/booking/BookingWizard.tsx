"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Package, PaymentMethod, Settings } from "@/lib/types";
import { formatMoney, methodLabel } from "@/lib/format";
import { computeQuote } from "@/lib/pricing";
import { AvailabilityCalendar } from "./AvailabilityCalendar";

type Props = {
  packages: Package[];
  settings: Settings;
  bookedDates: string[];
  initialPackageSlug?: string;
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

const EVENT_TYPES = [
  "Wedding",
  "Birthday",
  "Corporate event",
  "Baptism",
  "Holiday party",
  "Other",
];

export function BookingWizard({
  packages,
  settings,
  bookedDates,
  initialPackageSlug,
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
      if (!g || g < 20 || g > 500)
        return fail("Guest count should be between 20 and 500.");
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

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="border-b border-latte bg-sand/50 px-6 py-5 sm:px-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl text-espresso">
            {STEP_TITLES[step]}
          </h2>
          <span className="text-[12px] font-medium text-espresso/25">
            {step + 1} / {STEP_TITLES.length}
          </span>
        </div>

        {/* Step indicator */}
        <div className="mt-4 flex gap-1">
          {STEP_TITLES.map((t, i) => (
            <div key={t} className="flex-1">
              <div
                className={`h-1 rounded-full transition-all duration-500 ${
                  i < step
                    ? "bg-maroon"
                    : i === step
                      ? "bg-maroon/60"
                      : "bg-espresso/8"
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-6 sm:p-8">
        <div className="min-h-[300px]">
          {step === 0 && <PoliciesStep settings={settings} />}
          {step === 1 && <FaqStep settings={settings} />}
          {step === 2 && (
            <div>
              <p className="mb-4 text-sm text-espresso/40">
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
              notes={notes}
              onNotes={setNotes}
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
          <div className="mt-6 overflow-hidden rounded-xl border border-espresso/10 bg-espresso">
            <div className="p-5">
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-cream/30">
                Your estimate
              </h4>
              <ul className="mt-3 space-y-2">
                {quote.lines.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span className="text-cream/45">{l.label}</span>
                    <span
                      className={
                        l.amountCents < 0 ? "text-caramel" : "text-cream/70"
                      }
                    >
                      {l.amountCents < 0 ? "-" : ""}
                      {formatMoney(Math.abs(l.amountCents))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between border-t border-cream/8 px-5 py-4">
              <div>
                <span className="text-[11px] text-cream/30">
                  {settings.deposit_percent}% deposit
                </span>
                <strong className="ml-2 text-xl font-semibold text-caramel">
                  {formatMoney(quote.depositCents)}
                </strong>
              </div>
              <span className="text-[12px] text-cream/25">
                Total: {formatMoney(quote.totalCents)}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || submitting}
            className="btn-secondary w-1/3 py-3"
          >
            Back
          </button>
          {step < lastStep ? (
            <button
              type="button"
              onClick={next}
              className="btn-primary w-2/3 py-3 font-semibold"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="btn w-2/3 rounded-lg bg-sage py-3 font-semibold text-white shadow-soft transition hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
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

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-latte bg-white p-4">
      <span className="text-[14px] leading-relaxed text-espresso/55">
        {children}
      </span>
    </div>
  );
}

function PoliciesStep({ settings }: { settings: Settings }) {
  return (
    <div>
      <p className="mb-4 text-sm text-espresso/40">
        A few things worth knowing before you fill this out.
      </p>
      <div className="space-y-3">
        <InfoCard>
          We currently serve <strong className="text-espresso">
            {settings.service_area}
          </strong> only.
        </InfoCard>
        <InfoCard>
          A <strong className="text-espresso">{settings.deposit_percent}% deposit</strong> is
          needed to lock in your date. Without it, the date stays open for
          others.
        </InfoCard>
        <InfoCard>
          We show up <strong className="text-espresso">1–2 hours early</strong> to
          set up and test everything, so you don&apos;t have to worry about a
          thing.
        </InfoCard>
        <InfoCard>
          You get a full mobile espresso bar, premium beans, a barista, and all
          the equipment. Setup and teardown are included.
        </InfoCard>
      </div>
    </div>
  );
}

function FaqStep({ settings }: { settings: Settings }) {
  return (
    <div>
      <p className="mb-4 text-sm text-espresso/40">
        Answers to things people usually ask.
      </p>
      <div className="space-y-3">
        <InfoCard>
          <strong className="text-espresso">Does this form confirm my date?</strong>
          <br />
          Not yet. Your date is only locked once the {settings.deposit_percent}%
          deposit is paid.
        </InfoCard>
        <InfoCard>
          <strong className="text-espresso">How many guests can I have?</strong>
          <br />
          We can handle anywhere from 20 to 500. Just give us your best estimate.
        </InfoCard>
        <InfoCard>
          <strong className="text-espresso">Can I cancel after paying?</strong>
          <br />
          The deposit is non-refundable, but you can move to another available
          date.
        </InfoCard>
        <InfoCard>
          <strong className="text-espresso">What if we go overtime?</strong>
          <br />
          You can add extra hours during booking, or we can arrange it before your
          event.
        </InfoCard>
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
      <p className="mb-1 text-sm text-espresso/40">
        Pick one or combine a few.
      </p>
      {settings.combo_discount_cents > 0 && (
        <p className="mb-4 text-[13px] text-mocha">
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
              className={`group overflow-hidden rounded-xl border-2 text-left transition-all duration-150 ${
                active
                  ? "border-maroon bg-maroon/[0.03] shadow-soft"
                  : "border-latte bg-white hover:border-espresso/20 hover:shadow-soft"
              }`}
            >
              {p.image_url && (
                <div className="relative h-36 w-full overflow-hidden bg-sand">
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
                    <span className="mt-1 block text-[13px] text-espresso/40">
                      {formatMoney(p.price_cents)} · {p.duration_hours}h
                    </span>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-[10px] transition-all duration-150 ${
                      active
                        ? "border-maroon bg-maroon text-cream"
                        : "border-espresso/15 text-transparent group-hover:border-espresso/25"
                    }`}
                  >
                    ✓
                  </div>
                </div>
                {p.description && (
                  <p className="mt-2 text-[12px] leading-relaxed text-espresso/35">
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
        <div className="mt-5 space-y-2 rounded-xl border border-latte bg-sand/40 p-5">
          <h4 className="text-[12px] font-medium uppercase tracking-wider text-espresso/30">
            What&apos;s included
          </h4>
          {packages
            .filter((p) => selectedIds.includes(p.id))
            .map((p) => (
              <div key={p.id} className="text-[13px] text-espresso/55">
                <span className="font-medium text-espresso">{p.name}</span>
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
      <p className="text-sm text-espresso/40">
        Where and when is the event?
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date">
          <input
            type="text"
            readOnly
            value={date ?? ""}
            placeholder="Selected in previous step"
            className={`${inputCls} bg-sand/50`}
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
  notes,
  onNotes,
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
  notes: string;
  onNotes: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-espresso/40">
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
            min={20}
            max={500}
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
          {EVENT_TYPES.map((t) => (
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
      <p className="mb-5 text-sm text-espresso/40">
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
              className={`rounded-lg border-2 px-3 py-3 text-[13px] font-medium transition-all duration-150 ${
                method === m
                  ? "border-maroon bg-maroon/[0.03] text-maroon"
                  : "border-latte bg-white text-espresso/40 hover:border-espresso/20 hover:text-espresso/60"
              }`}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-latte bg-sand/40 p-5 text-[13px] leading-relaxed text-espresso/45">
        You&apos;re paying {settings.deposit_percent}% now to lock your date. The
        rest is due on or before the event day. We&apos;ll send a confirmation
        to your email.
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-latte bg-white p-5 text-[13px] text-espresso transition hover:border-espresso/15">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => onTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-latte accent-maroon"
        />
        <span className="leading-relaxed text-espresso/50">
          I&apos;ve read the service area, cancellation, and setup info above and
          I&apos;m good to go.
        </span>
      </label>
    </div>
  );
}
