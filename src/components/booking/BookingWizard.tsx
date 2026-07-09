"use client";

import { useMemo, useState } from "react";
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
  "Before you book",
  "Booking FAQ",
  "Choose date",
  "Packages",
  "Event schedule",
  "Contact",
  "Confirm",
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
      if (!date) return fail("Please select an event date.");
      if (bookedSet.has(date))
        return fail("That date is already booked. Please choose another.");
    }
    if (current === 3 && selectedPackages.length === 0)
      return fail("Please select at least one package.");
    if (current === 4) {
      if (!venueCity) return fail("Please select your city.");
      if (!venueName.trim()) return fail("Please enter the venue name.");
      if (!venueAddress.trim()) return fail("Please enter the venue address.");
    }
    if (current === 5) {
      if (!name.trim()) return fail("Please enter your full name.");
      if (!/^[0-9+\-\s()]{7,}$/.test(phone.trim()))
        return fail("Please enter a valid contact number.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return fail("Please enter a valid email address.");
      const g = Number(guests);
      if (!g || g < 20 || g > 500)
        return fail("Estimated guests must be between 20 and 500.");
      if (!eventType) return fail("Please select the type of event.");
    }
    if (current === 6 && !terms)
      return fail("Please confirm you've read and understood the terms.");
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
    <div className="overflow-hidden rounded-3xl border border-latte bg-white shadow-sm">
      {/* Dark header */}
      <div className="relative overflow-hidden bg-espresso p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-mocha/30 via-transparent to-caramel/10" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold leading-tight text-cream">
              Request a booking quote
            </h2>
            <p className="mt-1 text-xs text-cream/60">
              Read the rules, pick a date, and configure your cart in one flow.
            </p>
          </div>
          <div className="hidden shrink-0 grid-cols-2 gap-2 sm:grid">
            <Stat value={`${settings.standard_hours} hrs`} label="Standard" />
            <Stat value={`${settings.deposit_percent}%`} label="Deposit" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 sm:p-8">
        {/* Progress dots */}
        <div className="mb-6 grid grid-cols-7 gap-2">
          {STEP_TITLES.map((t, i) => (
            <div key={t} className="flex flex-col items-center gap-1">
              <div
                className={`h-2 w-full rounded-full ${
                  i < step
                    ? "bg-caramel"
                    : i === step
                      ? "bg-mocha"
                      : "bg-latte"
                }`}
              />
              <span
                className={`hidden text-[9px] font-bold uppercase sm:block ${
                  i === step ? "text-mocha" : "text-espresso/40"
                }`}
              >
                {t}
              </span>
            </div>
          ))}
        </div>

        <div className="min-h-[280px] space-y-4">
          {step === 0 && <PoliciesStep settings={settings} />}
          {step === 1 && <FaqStep settings={settings} />}
          {step === 2 && (
            <div>
              <StepTitle>1. Choose an available date</StepTitle>
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

        {/* Live quote summary */}
        {showQuote && (
          <div
            className="mt-4 space-y-3 rounded-xl border border-espresso/10 bg-espresso p-4 text-cream"
            aria-live="polite"
          >
            <h4 className="border-b border-cream/15 pb-2 text-sm font-bold">
              Estimated Total
            </h4>
            <ul className="space-y-1 text-xs">
              {quote.lines.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span className="text-cream/70">{l.label}</span>
                  <span
                    className={l.amountCents < 0 ? "text-caramel" : "text-cream"}
                  >
                    {l.amountCents < 0 ? "−" : ""}
                    {formatMoney(Math.abs(l.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t border-cream/15 pt-2 font-bold">
              <span className="text-xs">Estimated invoice</span>
              <strong className="text-2xl text-caramel">
                {formatMoney(quote.totalCents)}
              </strong>
            </div>
            <div className="flex items-baseline justify-between text-xs text-cream/70">
              <span>{settings.deposit_percent}% deposit due now</span>
              <span className="font-bold text-cream">
                {formatMoney(quote.depositCents)}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-xs font-bold text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={back}
            disabled={step === 0 || submitting}
            className="btn w-1/3 border border-latte py-3 font-extrabold text-espresso hover:bg-cream disabled:opacity-40"
          >
            Back
          </button>
          {step < lastStep ? (
            <button
              type="button"
              onClick={next}
              className="btn-primary w-2/3 py-3 font-extrabold"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="btn w-2/3 bg-sage py-3 font-extrabold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting
                ? "Redirecting to payment…"
                : `Reserve & pay ${formatMoney(quote.depositCents)} deposit`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-cream/10 bg-cream/5 p-3 text-center">
      <strong className="block text-base font-bold text-cream">{value}</strong>
      <span className="text-[10px] text-cream/50">{label}</span>
    </div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-espresso">
      {children}
    </h4>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-latte bg-cream/40 p-3">
      <strong className="block text-espresso">{title}</strong>
      <span className="text-espresso/70">{children}</span>
    </div>
  );
}

function PoliciesStep({ settings }: { settings: Settings }) {
  return (
    <div>
      <StepTitle>Before you book</StepTitle>
      <div className="space-y-3 text-xs text-espresso/70">
        <InfoCard title={`${settings.service_area} Area`}>
          {settings.business_name} currently services {settings.service_area}{" "}
          bookings exclusively.
        </InfoCard>
        <InfoCard title={`${settings.deposit_percent}% Block Deposit`}>
          A {settings.deposit_percent}% reservation fee is required before a date
          is blocked on the public calendar.
        </InfoCard>
        <InfoCard title="Setup Time">
          We typically arrive 1 to 2 hours before the event start time for
          assembly and testing.
        </InfoCard>
      </div>
    </div>
  );
}

function FaqStep({ settings }: { settings: Settings }) {
  return (
    <div>
      <StepTitle>Booking FAQ</StepTitle>
      <div className="space-y-3 text-xs text-espresso/70">
        <InfoCard title="Does this form confirm my reservation?">
          No. Reservation is secured only after the {settings.deposit_percent}%
          deposit is paid and verified.
        </InfoCard>
        <InfoCard title="How many guests can I input?">
          Expected headcount from 20 to 500 can be validated for smooth cart
          operations.
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
      <StepTitle>2. Select packages and coverage</StepTitle>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold text-espresso/70">
          Select one or more packages
        </p>
        <p className="text-[10px] font-bold text-mocha">
          Combo discount: {formatMoney(settings.combo_discount_cents)} off when{" "}
          {settings.combo_min_packages}+ selected
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {packages.map((p) => {
          const active = selectedIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? "border-mocha bg-mocha/10 ring-1 ring-mocha/30"
                  : "border-latte bg-white hover:border-mocha/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-espresso">{p.name}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                    active
                      ? "border-mocha bg-mocha text-cream"
                      : "border-latte text-transparent"
                  }`}
                >
                  ✓
                </span>
              </div>
              <div className="mt-1 text-xs text-espresso/60">
                {formatMoney(p.price_cents)} · {p.duration_hours}h
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-xs font-extrabold uppercase text-espresso">
          Extra hours
        </label>
        <select
          value={extraHours}
          onChange={(e) => onExtraHours(Number(e.target.value))}
          className="w-full rounded-xl border border-latte px-4 py-3 text-xs outline-none focus:border-mocha"
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

      <div className="mt-4 space-y-1.5 rounded-xl border border-latte bg-cream/40 p-4">
        {quote.lines.length === 0 ? (
          <h4 className="text-sm font-bold text-espresso">
            Select packages to see inclusions
          </h4>
        ) : (
          <>
            <h4 className="text-sm font-bold text-espresso">Your selection</h4>
            {packages
              .filter((p) => selectedIds.includes(p.id))
              .map((p) => (
                <div key={p.id} className="text-xs text-espresso/70">
                  <span className="font-bold text-espresso">{p.name}</span>
                  {p.inclusions.length > 0 && (
                    <span> — {p.inclusions.join(", ")}</span>
                  )}
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-extrabold uppercase text-espresso">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-latte px-4 py-3 text-xs outline-none focus:border-mocha";

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
      <StepTitle>3. Event schedule</StepTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date of event">
          <input
            type="text"
            readOnly
            value={date ?? ""}
            placeholder="Select on calendar (Step 1)"
            className={`${inputCls} bg-cream/60`}
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
      <Field label={`${settings.service_area} city`}>
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
          placeholder="Example: The Blue Leaf Events Pavilion"
          className={inputCls}
        />
      </Field>
      <Field label="Full venue address">
        <input
          value={venueAddress}
          onChange={(e) => onVenueAddress(e.target.value)}
          placeholder="Street, barangay, or building"
          className={inputCls}
        />
      </Field>
      <Field label="Google Maps Link (Optional)">
        <input
          type="url"
          value={mapsLink}
          onChange={(e) => onMapsLink(e.target.value)}
          placeholder="Optional pinned location url"
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
      <StepTitle>4. Contact and event details</StepTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full Name">
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Contact Number">
          <input
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="09XXXXXXXXX"
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email Address">
          <input
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Estimated Guests">
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
      <Field label="Type of Event">
        <select
          value={eventType}
          onChange={(e) => onEventType(e.target.value)}
          className={inputCls}
        >
          <option value="">Select event type</option>
          {EVENT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Event Theme / Notes">
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Tell us about your event theme, styling, and any special requests…"
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
      <StepTitle>5. Confirm understanding</StepTitle>
      <label className="flex items-start gap-2.5 text-xs font-bold text-espresso">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => onTerms(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I have read and understood the service area restrictions, cancellation
          rules, setup times, and overtime parameters.
        </span>
      </label>

      <div className="mt-4">
        <label className="mb-2 block text-xs font-extrabold uppercase text-espresso">
          Deposit payment method
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMethod(m)}
              className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                method === m
                  ? "border-mocha bg-mocha/10 text-mocha"
                  : "border-latte bg-white text-espresso/70 hover:border-mocha/40"
              }`}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-latte bg-cream/40 p-3 text-xs font-medium leading-relaxed text-espresso/70">
        The {settings.deposit_percent}% deposit is paid securely online to
        reserve your date. The balance is payable on or before the event day
        unless coordinated otherwise. A confirmation will be sent to your email.
      </div>
    </div>
  );
}
