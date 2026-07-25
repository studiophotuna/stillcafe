/**
 * Editable UI copy (labels, headings, prompts) stored in the site_content.copy
 * JSONB column. Everything here is admin-editable; DEFAULT_COPY is the
 * fallback so a blank field renders the original wording. Use resolveCopy() to
 * merge stored values over the defaults, and interpolate() for {placeholder}
 * substitution (e.g. {deposit_percent}).
 */

export type SiteCopy = {
  // landing
  nav_book_now: string;
  drawer_title: string;
  label_back: string;
  label_check_status: string;
  // booking wizard — 7 entries each, one per step
  step_titles: string[];
  step_intros: string[];
  deposit_note: string;
  terms_text: string;
  // result pages
  confirmation_paid_title: string;
  confirmation_paid_subtitle: string;
  confirmation_pending_title: string;
  confirmation_pending_subtitle: string;
  cancelled_title: string;
  cancelled_subtitle: string;
  status_title: string;
  status_intro: string;
};

export const DEFAULT_COPY: SiteCopy = {
  nav_book_now: "Book Now",
  drawer_title: "Book your date",
  label_back: "Back",
  label_check_status: "Check status",
  step_titles: [
    "Good to know",
    "Quick FAQ",
    "Pick a date",
    "Choose your setup",
    "Event details",
    "Your info",
    "Review & pay",
  ],
  step_intros: [
    "A few things worth knowing before you fill this out.",
    "Answers to things people usually ask.",
    "Dates that are crossed out are already taken.",
    "Pick one or combine a few.",
    "Where and when is the event?",
    "So we know who to coordinate with.",
    "Almost there. Pick how you'd like to pay the deposit.",
  ],
  deposit_note:
    "You're paying {deposit_percent}% now to lock your date. The rest is due on or before the event day. Save your booking reference after payment.",
  terms_text:
    "I've read the service area, cancellation, and setup info above and I'm good to go.",
  confirmation_paid_title: "You're all set!",
  confirmation_paid_subtitle: "Payment received — your date is locked in.",
  confirmation_pending_title: "Thanks for booking!",
  confirmation_pending_subtitle:
    "We got your booking. If you just paid, give it a moment to update.",
  cancelled_title: "Payment cancelled",
  cancelled_subtitle:
    "No worries — you weren't charged. You can start a new booking whenever you're ready.",
  status_title: "Check your booking",
  status_intro: "Enter the reference number from your booking confirmation.",
};

const STRING_KEYS: (keyof SiteCopy)[] = [
  "nav_book_now",
  "drawer_title",
  "label_back",
  "label_check_status",
  "deposit_note",
  "terms_text",
  "confirmation_paid_title",
  "confirmation_paid_subtitle",
  "confirmation_pending_title",
  "confirmation_pending_subtitle",
  "cancelled_title",
  "cancelled_subtitle",
  "status_title",
  "status_intro",
];

/** Merge stored copy over defaults; blank/missing values fall back. */
export function resolveCopy(raw: unknown): SiteCopy {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const result = { ...DEFAULT_COPY };

  for (const key of STRING_KEYS) {
    const v = r[key];
    if (typeof v === "string" && v.trim()) {
      (result[key] as string) = v;
    }
  }

  const mergeArr = (key: "step_titles" | "step_intros") => {
    const stored = r[key];
    if (Array.isArray(stored)) {
      result[key] = DEFAULT_COPY[key].map((def, i) => {
        const v = stored[i];
        return typeof v === "string" && v.trim() ? v : def;
      });
    }
  };
  mergeArr("step_titles");
  mergeArr("step_intros");

  return result;
}

/** Replace {name} tokens with values; unknown tokens are left as-is. */
export function interpolate(
  text: string,
  vars: Record<string, string | number>
): string {
  return text.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`
  );
}
