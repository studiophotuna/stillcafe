"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { saveSiteContent } from "@/app/admin/actions";
import { BODY_FONTS, DISPLAY_FONTS } from "@/lib/fonts";
import { resolveCopy, type SiteCopy } from "@/lib/copy";
import { resolveTextSizes, type TextSizes } from "@/lib/text-sizes";
import { resolveTextStyles, type TextStyles } from "@/lib/text-styles";
import type { FaqItem, NavPage, SiteContent } from "@/lib/types";

const DEFAULT_THEME: Record<string, string> = {
  color_primary: "#5c1f1a",
  color_accent: "#6f4e37",
  color_page_bg: "#faf6f0",
  color_text: "#2c1e14",
  color_surface: "#f0e6d8",
  color_border: "#e8ddd0",
  color_highlight: "#c08457",
  color_card: "#ffffff",
};

type Tab = "landing" | "booking";

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="border-b border-latte/30 px-6 py-4">
      <h2 className="flex items-center gap-2 font-serif text-base text-espresso">
        <span className="text-espresso/40">{icon}</span>
        {title}
      </h2>
      {hint && <p className="mt-1 text-xs text-espresso/40">{hint}</p>}
    </div>
  );
}

export function SiteContentEditor({ content }: { content: SiteContent }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("landing");
  const [bgMode, setBgMode] = useState(content.bg_mode);
  const [bgImages, setBgImages] = useState<string[]>(content.bg_images);
  const [wizardFaqs, setWizardFaqs] = useState<FaqItem[]>(content.wizard_faqs);
  const [navPages, setNavPages] = useState<NavPage[]>(content.nav_pages ?? []);
  const [copy, setCopy] = useState<SiteCopy>(resolveCopy(content.copy));
  const [textSizes, setTextSizes] = useState<TextSizes>(
    resolveTextSizes(content.text_sizes)
  );
  const [textStyles, setTextStyles] = useState<TextStyles>(
    resolveTextStyles(content.text_sizes)
  );
  const [saving, setSaving] = useState(false);

  function setSize(key: keyof TextSizes, value: number) {
    setTextSizes((s) => ({ ...s, [key]: value }));
  }
  function toggleStyle(key: keyof TextStyles, prop: "bold" | "italic") {
    setTextStyles((s) => ({
      ...s,
      [key]: { ...s[key], [prop]: !s[key][prop] },
    }));
  }

  function setCopyField<K extends keyof SiteCopy>(key: K, value: SiteCopy[K]) {
    setCopy((c) => ({ ...c, [key]: value }));
  }
  function setStepText(
    field: "step_titles" | "step_intros",
    i: number,
    value: string
  ) {
    setCopy((c) => {
      const arr = [...c[field]];
      arr[i] = value;
      return { ...c, [field]: arr };
    });
  }
  const [message, setMessage] = useState("");
  // Bumping the key remounts the color fields with default values.
  const [themeKey, setThemeKey] = useState(0);
  const [useDefaultTheme, setUseDefaultTheme] = useState(false);

  function addWizardFaq() {
    setWizardFaqs([...wizardFaqs, { question: "", answer: "" }]);
  }
  function removeWizardFaq(i: number) {
    setWizardFaqs(wizardFaqs.filter((_, idx) => idx !== i));
  }
  function updateWizardFaq(i: number, field: keyof FaqItem, value: string) {
    const copy = [...wizardFaqs];
    copy[i] = { ...copy[i], [field]: value };
    setWizardFaqs(copy);
  }

  function addNavPage() {
    setNavPages([
      ...navPages,
      { label: "", title: "", content: "", sections: [] },
    ]);
  }
  function removeNavPage(i: number) {
    setNavPages(navPages.filter((_, idx) => idx !== i));
  }
  function updateNavPage(
    i: number,
    field: "label" | "title" | "content",
    value: string
  ) {
    const copy = [...navPages];
    copy[i] = { ...copy[i], [field]: value };
    setNavPages(copy);
  }
  function addNavSection(pageIdx: number) {
    const copy = [...navPages];
    copy[pageIdx] = {
      ...copy[pageIdx],
      sections: [...(copy[pageIdx].sections ?? []), { heading: "", body: "" }],
    };
    setNavPages(copy);
  }
  function removeNavSection(pageIdx: number, secIdx: number) {
    const copy = [...navPages];
    copy[pageIdx] = {
      ...copy[pageIdx],
      sections: (copy[pageIdx].sections ?? []).filter(
        (_, idx) => idx !== secIdx
      ),
    };
    setNavPages(copy);
  }
  function updateNavSection(
    pageIdx: number,
    secIdx: number,
    field: "heading" | "body",
    value: string
  ) {
    const copy = [...navPages];
    const sections = [...(copy[pageIdx].sections ?? [])];
    sections[secIdx] = { ...sections[secIdx], [field]: value };
    copy[pageIdx] = { ...copy[pageIdx], sections };
    setNavPages(copy);
  }

  function removeBgImage(i: number) {
    setBgImages(bgImages.filter((_, idx) => idx !== i));
  }

  function resetTheme() {
    setUseDefaultTheme(true);
    setThemeKey((k) => k + 1);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const form = e.currentTarget;
      const fd = new FormData(form);
      fd.delete("existing_bg_images");
      for (const url of bgImages) {
        fd.append("existing_bg_images", url);
      }
      fd.set("wizard_faqs", JSON.stringify(wizardFaqs));
      fd.set("nav_pages", JSON.stringify(navPages));
      fd.set("copy", JSON.stringify(copy));
      fd.set("text_sizes", JSON.stringify({ ...textSizes, styles: textStyles }));
      const res = await saveSiteContent(fd);
      if (res?.ok) {
        setMessage("Saved!");
        // Pull fresh server props so the editor reflects what was stored.
        router.refresh();
      } else {
        setMessage(res?.error ?? "Save failed");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const themeValue = (name: string) =>
    useDefaultTheme
      ? DEFAULT_THEME[name]
      : ((content as unknown as Record<string, string>)[name] ??
        DEFAULT_THEME[name]);

  const tabCls = (t: Tab) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      tab === t
        ? "bg-espresso text-cream"
        : "bg-latte/30 text-espresso/50 hover:bg-latte/50 hover:text-espresso/70"
    }`;

  return (
    <form onSubmit={handleSubmit}>
      {/* Tab switcher */}
      <div className="mb-5 flex gap-2">
        <button type="button" onClick={() => setTab("landing")} className={tabCls("landing")}>
          Landing page
        </button>
        <button type="button" onClick={() => setTab("booking")} className={tabCls("booking")}>
          Booking
        </button>
      </div>

      <div className="items-start gap-6 lg:flex">
        <div className="min-w-0 flex-1">
          {/* ------------------------- LANDING TAB ------------------------- */}
          <div className={tab === "landing" ? "space-y-5" : "hidden"}>
            {/* Branding */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Branding"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" />
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                  </svg>
                }
              />
              <div className="space-y-4 p-6">
                <div>
                  <label className="field-label">Logo</label>
                  <div className="flex items-center gap-4">
                    {content.logo_url && (
                      <Image
                        src={content.logo_url}
                        alt="Current logo"
                        width={48}
                        height={48}
                        className="rounded-full border border-latte/40"
                      />
                    )}
                    <input
                      type="file"
                      name="logo"
                      accept="image/*"
                      className="text-sm text-espresso/70"
                    />
                  </div>
                  <p className="mt-1 text-xs text-espresso/40">
                    Shown at the top center of the landing page.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">Brand name</label>
                    <input
                      name="brand_name"
                      defaultValue={content.brand_name}
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label className="field-label">Tagline</label>
                    <input
                      name="tagline"
                      defaultValue={content.tagline}
                      className="field-input"
                    />
                    <p className="mt-1 text-xs text-espresso/35">
                      Appears right under the logo
                    </p>
                  </div>
                </div>
                <div>
                  <label className="field-label">Copyright text</label>
                  <input
                    name="copyright_text"
                    defaultValue={content.copyright_text}
                    className="field-input"
                  />
                </div>
              </div>
            </div>

            {/* Navigation pages */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Navigation pages"
                hint="Links on the top-left of the landing page. Clicking one opens a side panel with the content below."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="9" y2="18" />
                  </svg>
                }
              />
              <div className="p-6">
                <div className="space-y-3">
                  {navPages.map((page, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-latte/40 bg-sand/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid flex-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="field-label">Nav label</label>
                            <input
                              placeholder="e.g. About"
                              value={page.label}
                              maxLength={40}
                              onChange={(e) => updateNavPage(i, "label", e.target.value)}
                              className="field-input text-sm"
                            />
                          </div>
                          <div>
                            <label className="field-label">Panel title</label>
                            <input
                              placeholder="e.g. About us"
                              value={page.title}
                              maxLength={120}
                              onChange={(e) => updateNavPage(i, "title", e.target.value)}
                              className="field-input text-sm"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeNavPage(i)}
                          className="mt-6 text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-3">
                        <label className="field-label">
                          Intro text (optional)
                        </label>
                        <textarea
                          placeholder="Shown at the top of the panel. Blank lines create paragraphs."
                          rows={3}
                          value={page.content}
                          onChange={(e) => updateNavPage(i, "content", e.target.value)}
                          className="field-input resize-none text-sm"
                        />
                      </div>

                      <div className="mt-3">
                        <label className="field-label">
                          Segments (like the booking FAQ cards)
                        </label>
                        <div className="space-y-2">
                          {(page.sections ?? []).map((sec, si) => (
                            <div
                              key={si}
                              className="rounded-lg border border-latte/50 bg-card p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 space-y-2">
                                  <input
                                    placeholder="Segment heading"
                                    value={sec.heading}
                                    maxLength={120}
                                    onChange={(e) =>
                                      updateNavSection(i, si, "heading", e.target.value)
                                    }
                                    className="field-input text-sm"
                                  />
                                  <textarea
                                    placeholder="Segment text"
                                    rows={2}
                                    value={sec.body}
                                    onChange={(e) =>
                                      updateNavSection(i, si, "body", e.target.value)
                                    }
                                    className="field-input resize-none text-sm"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeNavSection(i, si)}
                                  className="mt-1 text-xs text-red-500 hover:text-red-700"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(page.sections ?? []).length < 12 && (
                          <button
                            type="button"
                            onClick={() => addNavSection(i)}
                            className="mt-2 text-xs font-medium text-mocha hover:text-espresso"
                          >
                            + Add segment
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {navPages.length < 6 && (
                  <button
                    type="button"
                    onClick={addNavPage}
                    className="mt-3 text-sm font-medium text-mocha hover:text-espresso"
                  >
                    + Add nav page
                  </button>
                )}
              </div>
            </div>

            {/* Background */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Background"
                hint="The full-screen photo behind the landing page."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                }
              />
              <div className="space-y-4 p-6">
                <div>
                  <label className="field-label">Background mode</label>
                  <div className="mt-1 flex gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-latte/40 px-4 py-2.5 text-sm transition-colors hover:border-mocha/30">
                      <input
                        type="radio"
                        name="bg_mode"
                        value="carousel"
                        checked={bgMode === "carousel"}
                        onChange={() => setBgMode("carousel")}
                        className="h-4 w-4 accent-mocha"
                      />
                      Carousel (up to 15 images)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-latte/40 px-4 py-2.5 text-sm transition-colors hover:border-mocha/30">
                      <input
                        type="radio"
                        name="bg_mode"
                        value="static"
                        checked={bgMode === "static"}
                        onChange={() => setBgMode("static")}
                        className="h-4 w-4 accent-mocha"
                      />
                      Static (1 image)
                    </label>
                  </div>
                </div>

                {bgMode === "carousel" && (
                  <div>
                    <label className="field-label">
                      Carousel images ({bgImages.length}/15)
                    </label>
                    {bgImages.length > 0 && (
                      <div className="mt-2 grid grid-cols-5 gap-2">
                        {bgImages.map((url, i) => (
                          <div key={i} className="group relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="h-20 w-full rounded-lg object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeBgImage(i)}
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {bgImages.length < 15 && (
                      <div className="mt-2">
                        <p className="text-xs text-espresso/40">
                          Add new images (up to {15 - bgImages.length} more):
                        </p>
                        {Array.from(
                          { length: Math.min(5, 15 - bgImages.length) },
                          (_, i) => (
                            <input
                              key={i}
                              type="file"
                              name={`bg_image_${i}`}
                              accept="image/*"
                              className="mt-1 text-sm text-espresso/70"
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}

                {bgMode === "static" && (
                  <div>
                    <label className="field-label">Static background image</label>
                    {content.bg_static_image && (
                      <div className="mt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={content.bg_static_image}
                          alt=""
                          className="h-32 w-full rounded-lg object-cover"
                        />
                        <input
                          type="hidden"
                          name="existing_bg_static_image"
                          value={content.bg_static_image}
                        />
                      </div>
                    )}
                    <input
                      type="file"
                      name="bg_static_image"
                      accept="image/*"
                      className="mt-2 text-sm text-espresso/70"
                    />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">Overlay color</label>
                    <ColorInput
                      name="bg_overlay_color"
                      defaultValue={content.bg_overlay_color}
                    />
                  </div>
                  <div>
                    <label className="field-label">Overlay opacity (%)</label>
                    <input
                      type="number"
                      name="bg_overlay_opacity"
                      min="0"
                      max="100"
                      defaultValue={content.bg_overlay_opacity}
                      className="field-input"
                    />
                    <p className="mt-1 text-xs text-espresso/35">
                      Higher = darker photo, more readable text
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Typography */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Typography"
                hint="Fonts apply to the public site only — the admin panel keeps its own."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                }
              />
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <div>
                  <label className="field-label">Heading font</label>
                  <select
                    name="font_display"
                    defaultValue={content.font_display || "DM Serif Display"}
                    className="field-input"
                  >
                    {DISPLAY_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Body font</label>
                  <select
                    name="font_body"
                    defaultValue={content.font_body || "DM Sans"}
                    className="field-input"
                  >
                    {BODY_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Body font weight</label>
                  <select
                    name="font_weight_body"
                    defaultValue={String(content.font_weight_body || 400)}
                    className="field-input"
                  >
                    <option value="300">Light (300)</option>
                    <option value="400">Regular (400)</option>
                    <option value="500">Medium (500)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Landing page text size (px)</label>
                  <input
                    type="number"
                    name="font_size_landing"
                    min="12"
                    max="48"
                    defaultValue={content.font_size_landing || 22}
                    className="field-input"
                  />
                  <p className="mt-1 text-xs text-espresso/35">
                    12–48. Sizes the landing page (logo, tagline, nav). Scales
                    down automatically on small screens.
                  </p>
                </div>
                <div>
                  <label className="field-label">Booking &amp; app text size (px)</label>
                  <input
                    type="number"
                    name="font_size_base"
                    min="14"
                    max="20"
                    defaultValue={content.font_size_base || 16}
                    className="field-input"
                  />
                  <p className="mt-1 text-xs text-espresso/35">
                    14–20. Sizes the booking flow and other pages.
                  </p>
                </div>
              </div>
            </div>

            {/* Landing element sizes & style */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Landing element sizes & style"
                hint="Fine-tune size (a multiplier of the landing text size above) plus bold/italic for each element."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                }
              />
              <div className="space-y-4 p-6">
                <SizeField label="Logo" value={textSizes.logo} min={2.5} max={9} onChange={(v) => setSize("logo", v)} />
                <SizeStyleField
                  label="Tagline"
                  size={textSizes.tagline} min={0.4} max={1.4}
                  onSize={(v) => setSize("tagline", v)}
                  style={textStyles.tagline}
                  onToggle={(p) => toggleStyle("tagline", p)}
                />
                <SizeStyleField
                  label="Nav links & buttons"
                  size={textSizes.links} min={0.4} max={1.1}
                  onSize={(v) => setSize("links", v)}
                  style={textStyles.links}
                  onToggle={(p) => toggleStyle("links", p)}
                />
                <SizeStyleField
                  label="Copyright"
                  size={textSizes.copyright} min={0.4} max={1}
                  onSize={(v) => setSize("copyright", v)}
                  style={textStyles.copyright}
                  onToggle={(p) => toggleStyle("copyright", p)}
                />
              </div>
            </div>

            {/* Theme colors */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-latte/30 px-6 py-4">
                <div>
                  <h2 className="flex items-center gap-2 font-serif text-base text-espresso">
                    <span className="text-espresso/40">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287z" />
                      </svg>
                    </span>
                    Theme colors
                  </h2>
                  <p className="mt-1 text-xs text-espresso/40">
                    Public site only — the admin panel keeps its own palette.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetTheme}
                  className="text-xs font-medium text-mocha transition-colors hover:text-espresso"
                >
                  Reset to defaults
                </button>
              </div>
              <div key={themeKey} className="grid gap-4 p-6 sm:grid-cols-2">
                <ColorField name="color_primary" label="Primary (buttons, headers)" defaultValue={themeValue("color_primary")} />
                <ColorField name="color_accent" label="Accent (hover, links)" defaultValue={themeValue("color_accent")} />
                <ColorField name="color_page_bg" label="Page background" defaultValue={themeValue("color_page_bg")} />
                <ColorField name="color_text" label="Text color" defaultValue={themeValue("color_text")} />
                <ColorField name="color_surface" label="Surface (subtle backgrounds)" defaultValue={themeValue("color_surface")} />
                <ColorField name="color_border" label="Borders & dividers" defaultValue={themeValue("color_border")} />
                <ColorField name="color_highlight" label="Highlight / selection" defaultValue={themeValue("color_highlight")} />
                <ColorField name="color_card" label="Card / panel background" defaultValue={themeValue("color_card")} />
              </div>
            </div>

            {/* Social media */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Social media"
                hint="Leave a field blank to hide its icon on the landing page."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                }
              />
              <div className="space-y-4 p-6">
                <div>
                  <label className="field-label">Instagram URL</label>
                  <input
                    name="social_instagram"
                    defaultValue={content.social_instagram}
                    placeholder="https://instagram.com/yourbrand"
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">Facebook URL</label>
                  <input
                    name="social_facebook"
                    defaultValue={content.social_facebook}
                    placeholder="https://facebook.com/yourbrand"
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">TikTok URL</label>
                  <input
                    name="social_tiktok"
                    defaultValue={content.social_tiktok}
                    placeholder="https://tiktok.com/@yourbrand"
                    className="field-input"
                  />
                </div>
              </div>
            </div>

            {/* Buttons & labels */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Buttons & labels"
                hint="Short labels used on the landing page and booking panel."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                }
              />
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <CopyField label="“Book Now” button" value={copy.nav_book_now} onChange={(v) => setCopyField("nav_book_now", v)} />
                <CopyField label="Booking panel title" value={copy.drawer_title} onChange={(v) => setCopyField("drawer_title", v)} />
                <CopyField label="Back link" value={copy.label_back} onChange={(v) => setCopyField("label_back", v)} />
                <CopyField label="Check status link" value={copy.label_check_status} onChange={(v) => setCopyField("label_check_status", v)} />
              </div>
            </div>
          </div>

          {/* ------------------------- BOOKING TAB ------------------------- */}
          <div className={tab === "booking" ? "space-y-5" : "hidden"}>
            {/* Step titles & intros */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Wizard steps"
                hint="The title and one-line intro shown at each of the 7 booking steps."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                }
              />
              <div className="space-y-3 p-6">
                {copy.step_titles.map((title, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-latte/40 bg-sand/20 p-3"
                  >
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-espresso/35">
                      Step {i + 1}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={title}
                        onChange={(e) => setStepText("step_titles", i, e.target.value)}
                        placeholder="Step title"
                        className="field-input text-sm"
                      />
                      <input
                        value={copy.step_intros[i]}
                        onChange={(e) => setStepText("step_intros", i, e.target.value)}
                        placeholder="Step intro line"
                        className="field-input text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deposit & terms copy */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Deposit & terms"
                hint="Shown on the review step. Use {deposit_percent} for the deposit percentage."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M9 12l2 2 4-4" /><path d="M21 12c-1 0-3-1-3-3s2-3 3-3-2-3-3-3-3 2-3 3-2 3-3 3 3 1 3 3-2 3-3 3 3-1 3-3z" />
                  </svg>
                }
              />
              <div className="space-y-4 p-6">
                <CopyField label="Deposit note" value={copy.deposit_note} onChange={(v) => setCopyField("deposit_note", v)} multiline />
                <CopyField label="Terms checkbox text" value={copy.terms_text} onChange={(v) => setCopyField("terms_text", v)} multiline />
              </div>
            </div>

            {/* Result pages copy */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="Confirmation & status pages"
                hint="Headings shown after checkout and on the status lookup."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                }
              />
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <CopyField label="Paid — title" value={copy.confirmation_paid_title} onChange={(v) => setCopyField("confirmation_paid_title", v)} />
                <CopyField label="Paid — subtitle" value={copy.confirmation_paid_subtitle} onChange={(v) => setCopyField("confirmation_paid_subtitle", v)} multiline />
                <CopyField label="Pending — title" value={copy.confirmation_pending_title} onChange={(v) => setCopyField("confirmation_pending_title", v)} />
                <CopyField label="Pending — subtitle" value={copy.confirmation_pending_subtitle} onChange={(v) => setCopyField("confirmation_pending_subtitle", v)} multiline />
                <CopyField label="Cancelled — title" value={copy.cancelled_title} onChange={(v) => setCopyField("cancelled_title", v)} />
                <CopyField label="Cancelled — subtitle" value={copy.cancelled_subtitle} onChange={(v) => setCopyField("cancelled_subtitle", v)} multiline />
                <CopyField label="Status lookup — title" value={copy.status_title} onChange={(v) => setCopyField("status_title", v)} />
                <CopyField label="Status lookup — intro" value={copy.status_intro} onChange={(v) => setCopyField("status_intro", v)} multiline />
              </div>
            </div>

            {/* Wizard policies */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="“Good to know” step"
                hint={`One policy per line. Use {service_area} and {deposit_percent} as placeholders.`}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                }
              />
              <div className="p-6">
                <textarea
                  name="policies"
                  rows={6}
                  defaultValue={content.policies.join("\n")}
                  className="field-input resize-none"
                />
              </div>
            </div>

            {/* Wizard FAQs */}
            <div className="card overflow-hidden">
              <SectionHeader
                title="“Quick FAQ” step"
                hint="Shown as the second step of the booking flow."
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                }
              />
              <div className="p-6">
                <div className="space-y-3">
                  {wizardFaqs.map((faq, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-latte/40 bg-sand/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <input
                            placeholder="Question"
                            value={faq.question}
                            onChange={(e) =>
                              updateWizardFaq(i, "question", e.target.value)
                            }
                            className="field-input text-sm"
                          />
                          <textarea
                            placeholder="Answer — use {deposit_percent} as placeholder"
                            rows={2}
                            value={faq.answer}
                            onChange={(e) =>
                              updateWizardFaq(i, "answer", e.target.value)
                            }
                            className="field-input resize-none text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWizardFaq(i)}
                          className="mt-1 text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addWizardFaq}
                  className="mt-3 text-sm font-medium text-mocha hover:text-espresso"
                >
                  + Add FAQ
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Save rail: follows scroll on desktop, docks to bottom on mobile */}
        <div className="sticky bottom-4 z-10 mt-5 lg:bottom-auto lg:top-24 lg:mt-0 lg:w-52 lg:shrink-0">
          <div className="card p-4 shadow-elevated lg:shadow-card">
            <button
              type="submit"
              className="btn-primary flex w-full items-center justify-center gap-2"
              disabled={saving}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              {saving ? "Saving…" : "Save changes"}
            </button>
            {message && (
              <p
                className={`mt-2 text-center text-xs font-medium ${
                  message === "Saved!" ? "text-green-600" : "text-red-600"
                }`}
              >
                {message}
              </p>
            )}
            <p className="mt-2 hidden text-center text-[11px] text-espresso/35 lg:block">
              Saves both tabs. Changes go live immediately.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}

function SizeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-espresso/50">{label}</label>
        <span className="font-mono text-xs text-espresso/40">
          {value.toFixed(2)}×
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-mocha"
      />
    </div>
  );
}

function SizeStyleField({
  label,
  size,
  min,
  max,
  onSize,
  style,
  onToggle,
}: {
  label: string;
  size: number;
  min: number;
  max: number;
  onSize: (v: number) => void;
  style: { bold: boolean; italic: boolean };
  onToggle: (prop: "bold" | "italic") => void;
}) {
  const btn = (on: boolean) =>
    `flex h-8 w-8 items-center justify-center rounded-lg border-2 text-sm transition-colors ${
      on
        ? "border-mocha bg-mocha/5 text-mocha"
        : "border-latte/40 text-espresso/40 hover:border-mocha/30"
    }`;
  return (
    <div className="flex items-end gap-4">
      <div className="min-w-0 flex-1">
        <SizeField label={label} value={size} min={min} max={max} onChange={onSize} />
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onToggle("bold")}
          className={`${btn(style.bold)} font-bold`}
          aria-label={`${label} bold`}
          aria-pressed={style.bold}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => onToggle("italic")}
          className={`${btn(style.italic)} italic`}
          aria-label={`${label} italic`}
          aria-pressed={style.italic}
        >
          I
        </button>
      </div>
    </div>
  );
}

function CopyField({
  label,
  value,
  onChange,
  hint,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field-input resize-none text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field-input text-sm"
        />
      )}
      {hint && <p className="mt-1 text-xs text-espresso/35">{hint}</p>}
    </div>
  );
}

function ColorInput({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-10 w-14 cursor-pointer rounded border border-latte"
      />
      <span className="font-mono text-xs text-espresso/50">{value}</span>
    </div>
  );
}

function ColorField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <ColorInput name={name} defaultValue={defaultValue} />
    </div>
  );
}
