"use client";

import { useMemo, useState } from "react";
import type { Package, PaymentMethod, Settings } from "@/lib/types";
import { formatMoney, methodLabel } from "@/lib/format";

type Props = {
  packages: Package[];
  settings: Settings;
  initialPackageSlug?: string;
};

type EventDetails = {
  event_date: string;
  event_time: string;
  event_location: string;
  guest_count: string;
};

type CustomerDetails = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
};

const STEP_LABELS = ["Package", "Event", "Details", "Review"];

export function BookingFlow({
  packages,
  settings,
  initialPackageSlug,
}: Props) {
  const initialPkg =
    packages.find((p) => p.slug === initialPackageSlug) ?? null;

  const [step, setStep] = useState(initialPkg ? 1 : 0);
  const [selected, setSelected] = useState<Package | null>(initialPkg);
  const [event, setEvent] = useState<EventDetails>({
    event_date: "",
    event_time: "",
    event_location: "",
    guest_count: "",
  });
  const [customer, setCustomer] = useState<CustomerDetails>({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    notes: "",
  });
  const [method, setMethod] = useState<PaymentMethod>(
    settings.payment_methods[0] ?? "gcash"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dueCents = useMemo(() => {
    if (!selected) return 0;
    return selected.deposit_cents > 0
      ? selected.deposit_cents
      : selected.price_cents;
  }, [selected]);

  const payingDeposit = !!selected && selected.deposit_cents > 0;

  function next() {
    setError(null);
    setStep((s) => Math.min(s + 1, 3));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function validateEvent(): boolean {
    if (!event.event_date) return fail("Please choose an event date.");
    if (!event.event_location.trim())
      return fail("Please enter the event location.");
    if (
      selected?.max_guests &&
      event.guest_count &&
      Number(event.guest_count) > selected.max_guests
    ) {
      return fail(
        `This package serves up to ${selected.max_guests} guests. Please pick a larger package or reduce guest count.`
      );
    }
    return true;
  }

  function validateCustomer(): boolean {
    if (!customer.customer_name.trim()) return fail("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.customer_email))
      return fail("Please enter a valid email address.");
    if (!customer.customer_phone.trim())
      return fail("Please enter a contact number.");
    return true;
  }

  function fail(msg: string): boolean {
    setError(msg);
    return false;
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: selected.id,
          method,
          ...event,
          guest_count: event.guest_count ? Number(event.guest_count) : null,
          ...customer,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Something went wrong. Please try again.");
      }
      // Hand off to the payment provider's hosted checkout.
      window.location.href = json.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Stepper step={step} />

      <div className="mt-8">
        {step === 0 && (
          <PackageStep
            packages={packages}
            selected={selected}
            onSelect={(p) => {
              setSelected(p);
              next();
            }}
          />
        )}

        {step === 1 && selected && (
          <EventStep
            value={event}
            pkg={selected}
            onChange={setEvent}
          />
        )}

        {step === 2 && (
          <CustomerStep value={customer} onChange={setCustomer} />
        )}

        {step === 3 && selected && (
          <ReviewStep
            pkg={selected}
            event={event}
            customer={customer}
            methods={settings.payment_methods}
            method={method}
            onMethod={setMethod}
            dueCents={dueCents}
            payingDeposit={payingDeposit}
          />
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Nav buttons */}
      {step > 0 && (
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            className="btn-secondary"
            disabled={submitting}
          >
            Back
          </button>

          {step === 1 && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => validateEvent() && next()}
            >
              Continue
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => validateCustomer() && next()}
            >
              Review booking
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className="btn-primary"
              onClick={submit}
              disabled={submitting}
            >
              {submitting
                ? "Redirecting to payment…"
                : `Pay ${formatMoney(dueCents)} & book`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                active
                  ? "bg-mocha text-cream"
                  : done
                    ? "bg-caramel text-cream"
                    : "bg-latte text-espresso/60"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <span
              className={`hidden text-sm sm:inline ${
                active ? "font-semibold text-espresso" : "text-espresso/50"
              }`}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div className="mx-1 hidden h-px flex-1 bg-latte sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PackageStep({
  packages,
  selected,
  onSelect,
}: {
  packages: Package[];
  selected: Package | null;
  onSelect: (p: Package) => void;
}) {
  return (
    <div>
      <h2 className="font-serif text-xl font-semibold text-espresso">
        Choose your package
      </h2>
      <div className="mt-4 space-y-3">
        {packages.map((p) => {
          const isSel = selected?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={`card flex w-full items-start gap-4 p-5 text-left transition hover:border-mocha ${
                isSel ? "border-mocha ring-2 ring-mocha/20" : ""
              }`}
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-latte/70 text-2xl">
                ☕
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-lg font-semibold text-espresso">
                    {p.name}
                  </h3>
                  <span className="font-semibold text-espresso">
                    {formatMoney(p.price_cents)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-espresso/70">{p.description}</p>
                <div className="mt-2 text-xs text-espresso/50">
                  {p.duration_hours}h
                  {p.max_guests ? ` · up to ${p.max_guests} guests` : ""}
                  {p.deposit_cents > 0
                    ? ` · ${formatMoney(p.deposit_cents)} deposit`
                    : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventStep({
  value,
  pkg,
  onChange,
}: {
  value: EventDetails;
  pkg: Package;
  onChange: (v: EventDetails) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  return (
    <div>
      <h2 className="font-serif text-xl font-semibold text-espresso">
        Event details
      </h2>
      <p className="mt-1 text-sm text-espresso/60">
        For your <strong>{pkg.name}</strong> booking.
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className="field-label">Event date</label>
          <input
            type="date"
            min={today}
            className="field-input"
            value={value.event_date}
            onChange={(e) =>
              onChange({ ...value, event_date: e.target.value })
            }
          />
        </div>
        <div>
          <label className="field-label">Start time</label>
          <input
            type="time"
            className="field-input"
            value={value.event_time}
            onChange={(e) =>
              onChange({ ...value, event_time: e.target.value })
            }
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Event location</label>
          <input
            type="text"
            placeholder="Venue name and address"
            className="field-input"
            value={value.event_location}
            onChange={(e) =>
              onChange({ ...value, event_location: e.target.value })
            }
          />
        </div>
        <div>
          <label className="field-label">
            Guest count{" "}
            {pkg.max_guests ? (
              <span className="text-espresso/40">(max {pkg.max_guests})</span>
            ) : null}
          </label>
          <input
            type="number"
            min={1}
            placeholder="e.g. 80"
            className="field-input"
            value={value.guest_count}
            onChange={(e) =>
              onChange({ ...value, guest_count: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}

function CustomerStep({
  value,
  onChange,
}: {
  value: CustomerDetails;
  onChange: (v: CustomerDetails) => void;
}) {
  return (
    <div>
      <h2 className="font-serif text-xl font-semibold text-espresso">
        Your details
      </h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Full name</label>
          <input
            type="text"
            className="field-input"
            value={value.customer_name}
            onChange={(e) =>
              onChange({ ...value, customer_name: e.target.value })
            }
          />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input
            type="email"
            className="field-input"
            value={value.customer_email}
            onChange={(e) =>
              onChange({ ...value, customer_email: e.target.value })
            }
          />
        </div>
        <div>
          <label className="field-label">Contact number</label>
          <input
            type="tel"
            placeholder="09XX XXX XXXX"
            className="field-input"
            value={value.customer_phone}
            onChange={(e) =>
              onChange({ ...value, customer_phone: e.target.value })
            }
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">
            Notes <span className="text-espresso/40">(optional)</span>
          </label>
          <textarea
            rows={4}
            placeholder="Special requests, menu preferences, setup notes…"
            className="field-input"
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  pkg,
  event,
  customer,
  methods,
  method,
  onMethod,
  dueCents,
  payingDeposit,
}: {
  pkg: Package;
  event: EventDetails;
  customer: CustomerDetails;
  methods: PaymentMethod[];
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  dueCents: number;
  payingDeposit: boolean;
}) {
  return (
    <div>
      <h2 className="font-serif text-xl font-semibold text-espresso">
        Review &amp; pay
      </h2>

      <div className="mt-5 card divide-y divide-latte">
        <Row label="Package" value={pkg.name} />
        <Row label="Total price" value={formatMoney(pkg.price_cents)} />
        <Row
          label="Date"
          value={
            event.event_date +
            (event.event_time ? ` at ${event.event_time}` : "")
          }
        />
        <Row label="Location" value={event.event_location} />
        {event.guest_count && (
          <Row label="Guests" value={event.guest_count} />
        )}
        <Row label="Name" value={customer.customer_name} />
        <Row label="Email" value={customer.customer_email} />
        <Row label="Phone" value={customer.customer_phone} />
        {customer.notes && <Row label="Notes" value={customer.notes} />}
      </div>

      <div className="mt-6">
        <label className="field-label">Payment method</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMethod(m)}
              className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
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

      <div className="mt-6 rounded-xl bg-latte/50 p-5">
        <div className="flex items-center justify-between">
          <span className="text-espresso/70">
            {payingDeposit ? "Deposit due now" : "Amount due now"}
          </span>
          <span className="text-2xl font-semibold text-espresso">
            {formatMoney(dueCents)}
          </span>
        </div>
        {payingDeposit && (
          <p className="mt-2 text-xs text-espresso/60">
            The remaining balance of{" "}
            {formatMoney(pkg.price_cents - dueCents)} is settled before or on
            the event day.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6 px-5 py-3 text-sm">
      <span className="text-espresso/60">{label}</span>
      <span className="text-right font-medium text-espresso">{value}</span>
    </div>
  );
}
