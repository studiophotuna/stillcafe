/** Curated Google Fonts the admin can pick from. Names double as CSS family names. */

export const DISPLAY_FONTS = [
  "DM Serif Display",
  "Playfair Display",
  "Cormorant Garamond",
  "Lora",
  "Libre Baskerville",
  "Fraunces",
  "Marcellus",
  "Italiana",
] as const;

export const BODY_FONTS = [
  "DM Sans",
  "Inter",
  "Poppins",
  "Montserrat",
  "Work Sans",
  "Karla",
  "Jost",
  "Nunito Sans",
] as const;

export const DEFAULT_DISPLAY_FONT = "DM Serif Display";
export const DEFAULT_BODY_FONT = "DM Sans";

export function sanitizeDisplayFont(name: string | null | undefined): string {
  return DISPLAY_FONTS.includes((name ?? "") as (typeof DISPLAY_FONTS)[number])
    ? (name as string)
    : DEFAULT_DISPLAY_FONT;
}

export function sanitizeBodyFont(name: string | null | undefined): string {
  return BODY_FONTS.includes((name ?? "") as (typeof BODY_FONTS)[number])
    ? (name as string)
    : DEFAULT_BODY_FONT;
}

/**
 * One stylesheet link per family so a bad request can never take the
 * others down. Body fonts load the weights the UI actually uses;
 * display fonts only need regular. The default DM pair is always
 * included because the admin panel pins itself to it.
 */
export function googleFontLinks(display: string, body: string): string[] {
  const links = new Map<string, string>();
  const add = (family: string, weights?: string) => {
    const name = family.replace(/ /g, "+");
    links.set(
      family,
      `https://fonts.googleapis.com/css2?family=${name}${
        weights ? `:wght@${weights}` : ""
      }&display=swap`
    );
  };
  add(DEFAULT_BODY_FONT, "300;400;500;700");
  add(DEFAULT_DISPLAY_FONT);
  add(sanitizeBodyFont(body), "300;400;500;700");
  add(sanitizeDisplayFont(display));
  return [...links.values()];
}
