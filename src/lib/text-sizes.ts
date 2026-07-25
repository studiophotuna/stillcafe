/**
 * Per-element landing-page text sizes, stored in site_content.text_sizes.
 * Values are em multipliers applied on top of the master landing font size
 * (content.font_size_landing), so raising the master scales everything while
 * these fine-tune each element relative to it. resolveTextSizes() merges
 * stored values over the defaults and clamps to sane ranges.
 */

export type TextSizes = {
  logo: number; // em — logo width/height
  tagline: number; // em
  links: number; // em — nav links, Book Now, check status
  copyright: number; // em
};

export const DEFAULT_TEXT_SIZES: TextSizes = {
  logo: 5,
  tagline: 0.68,
  links: 0.62,
  copyright: 0.55,
};

const RANGES: Record<keyof TextSizes, [number, number]> = {
  logo: [2.5, 9],
  tagline: [0.4, 1.4],
  links: [0.4, 1.1],
  copyright: [0.4, 1.0],
};

function clamp(n: unknown, [min, max]: [number, number], def: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

export function resolveTextSizes(raw: unknown): TextSizes {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    logo: clamp(r.logo, RANGES.logo, DEFAULT_TEXT_SIZES.logo),
    tagline: clamp(r.tagline, RANGES.tagline, DEFAULT_TEXT_SIZES.tagline),
    links: clamp(r.links, RANGES.links, DEFAULT_TEXT_SIZES.links),
    copyright: clamp(r.copyright, RANGES.copyright, DEFAULT_TEXT_SIZES.copyright),
  };
}

/** CSS custom properties consumed by the landing page. */
export function textSizeVars(sizes: TextSizes): Record<string, string> {
  return {
    "--size-logo": `${sizes.logo}em`,
    "--size-tagline": `${sizes.tagline}em`,
    "--size-links": `${sizes.links}em`,
    "--size-copyright": `${sizes.copyright}em`,
  };
}
