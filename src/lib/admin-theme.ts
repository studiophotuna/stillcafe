/**
 * The admin panel pins itself to this palette and typography no matter
 * what the user configures for the public site. Modern SaaS look:
 * white surfaces, slate text, blue actions.
 */
export const ADMIN_THEME: Record<string, string | number> = {
  "--color-page-bg": "248 250 252", // slate-50
  "--color-border": "226 232 240", // slate-200
  "--color-accent": "37 99 235", // blue-600
  "--color-text": "15 23 42", // slate-900
  "--color-primary": "37 99 235", // blue-600
  "--color-highlight": "59 130 246", // blue-500
  "--color-surface": "241 245 249", // slate-100
  "--color-card": "255 255 255",
  "--font-display": "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  "--font-body": "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  fontFamily: "var(--font-body)",
  fontWeight: 400,
};
