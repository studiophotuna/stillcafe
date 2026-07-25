/**
 * Per-element landing text styling (bold / italic). Stored alongside the
 * size multipliers inside site_content.text_sizes under a `styles` key, so no
 * extra column is needed. Non-bold weight inherits the global body weight.
 */

export type ElementStyle = { bold: boolean; italic: boolean };

export type TextStyles = {
  tagline: ElementStyle;
  links: ElementStyle;
  copyright: ElementStyle;
};

export const DEFAULT_TEXT_STYLES: TextStyles = {
  tagline: { bold: false, italic: false },
  links: { bold: false, italic: false },
  copyright: { bold: false, italic: false },
};

export function resolveTextStyles(raw: unknown): TextStyles {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const styles =
    r.styles && typeof r.styles === "object"
      ? (r.styles as Record<string, unknown>)
      : {};
  const one = (k: keyof TextStyles): ElementStyle => {
    const s = styles[k] as Record<string, unknown> | undefined;
    return { bold: !!(s && s.bold), italic: !!(s && s.italic) };
  };
  return {
    tagline: one("tagline"),
    links: one("links"),
    copyright: one("copyright"),
  };
}

/** CSS custom properties consumed by the landing page. */
export function textStyleVars(s: TextStyles): Record<string, string> {
  return {
    "--weight-tagline": s.tagline.bold ? "700" : "inherit",
    "--italic-tagline": s.tagline.italic ? "italic" : "normal",
    "--weight-links": s.links.bold ? "700" : "inherit",
    "--italic-links": s.links.italic ? "italic" : "normal",
    "--weight-copyright": s.copyright.bold ? "700" : "inherit",
    "--italic-copyright": s.copyright.italic ? "italic" : "normal",
  };
}
