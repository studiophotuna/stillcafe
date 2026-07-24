"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import { bookingStatusEmail } from "@/lib/email-templates";
import { getSettings } from "@/lib/data";
import { sanitizeBodyFont, sanitizeDisplayFont } from "@/lib/fonts";
import type { Booking, BookingStatus, FaqItem, PaymentMethod } from "@/lib/types";

function clampInt(
  value: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

function validateUpload(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File "${file.name}" exceeds the 5 MB size limit.`);
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    throw new Error(`File "${file.name}" has an unsupported type. Use JPEG, PNG, WebP, GIF, or SVG.`);
  }
}

async function uploadSiteAsset(file: File): Promise<string> {
  validateUpload(file);
  const supabase = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from("site-assets")
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (error) throw new Error(`Site asset upload failed: ${error.message}`);
  const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadImage(file: File): Promise<string | null> {
  if (!file || file.size === 0) return null;
  validateUpload(file);
  const supabase = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from("package-images")
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  const { data } = supabase.storage.from("package-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function savePackage(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();

  const id = (formData.get("id") as string) || null;
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Name is required.");

  const inclusions = ((formData.get("inclusions") as string) || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const image = formData.get("image") as File | null;
  const imageUrl = image ? await uploadImage(image) : null;

  const row: Record<string, unknown> = {
    name,
    slug: slugify((formData.get("slug") as string) || name),
    description: ((formData.get("description") as string) || "").trim(),
    price_cents: toCents((formData.get("price") as string) || "0"),
    deposit_cents: toCents((formData.get("deposit") as string) || "0"),
    duration_hours: Number((formData.get("duration_hours") as string) || "2"),
    max_guests: formData.get("max_guests")
      ? Number(formData.get("max_guests"))
      : null,
    inclusions,
    is_active: formData.get("is_active") === "on",
    sort_order: Number((formData.get("sort_order") as string) || "0"),
  };
  if (imageUrl) row.image_url = imageUrl;

  if (id) {
    const { error } = await supabase.from("packages").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("packages").insert(row);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/");
  revalidatePath("/book");
}

export async function deletePackage(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  revalidatePath("/book");
}

export async function updateBookingStatus(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  const status = formData.get("status") as BookingStatus;

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (booking?.customer_email && status !== booking.status) {
    notifyStatusChange({ ...booking, status } as Booking, status).catch(() => {});
  }

  revalidatePath("/admin", "layout");
}

async function notifyStatusChange(booking: Booking, newStatus: string) {
  const settings = await getSettings();
  const { subject, html } = bookingStatusEmail(booking, settings, newStatus);
  await sendEmail({
    to: booking.customer_email,
    subject,
    html,
    replyTo: settings.business_email ?? undefined,
  });
}

export async function updateBooking(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  if (!id) throw new Error("Missing booking ID.");

  const row: Record<string, unknown> = {
    customer_name: ((formData.get("customer_name") as string) || "").trim(),
    customer_email: ((formData.get("customer_email") as string) || "").trim(),
    customer_phone: ((formData.get("customer_phone") as string) || "").trim(),
    event_date: (formData.get("event_date") as string) || undefined,
    event_time: (formData.get("event_time") as string) || null,
    event_type: (formData.get("event_type") as string) || null,
    event_location: ((formData.get("event_location") as string) || "").trim(),
    guest_count: Number(formData.get("guest_count")) || null,
    notes: ((formData.get("notes") as string) || "").trim(),
    status: (formData.get("status") as BookingStatus) || "pending",
    amount_paid_cents: toCents((formData.get("amount_paid") as string) || "0"),
  };

  Object.keys(row).forEach((k) => {
    if (row[k] === undefined) delete row[k];
  });

  const { data, error } = await supabase
    .from("bookings")
    .update(row)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    const msg = error?.message ?? "Booking not found.";
    redirect(`/admin/bookings/${id}?error=${encodeURIComponent(msg.slice(0, 200))}`);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/book");
  redirect(`/admin/bookings/${id}?saved=1`);
}

export async function saveSettings(formData: FormData) {
  await requireUser();

  let failure: string | null = null;
  try {
    const supabase = createAdminClient();

    const methods = formData.getAll("payment_methods") as PaymentMethod[];

    const eventTypesRaw = ((formData.get("event_types") as string) || "").trim();
    const eventTypes = eventTypesRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const { data, error } = await supabase
      .from("settings")
      .update({
        payment_methods: methods.length ? methods : ["gcash"],
        business_name: (formData.get("business_name") as string) || "My Business",
        business_email: (formData.get("business_email") as string) || null,
        deposit_percent: clampInt(formData.get("deposit_percent"), 50, 1, 100),
        standard_hours: Number(formData.get("standard_hours")) || 3,
        combo_discount_cents: toCents((formData.get("combo_discount") as string) || "0"),
        combo_min_packages: clampInt(formData.get("combo_min_packages"), 2, 1, 10),
        extra_hour_cents: toCents((formData.get("extra_hour_price") as string) || "0"),
        service_area: (formData.get("service_area") as string) || "Metro Manila",
        reference_prefix: ((formData.get("reference_prefix") as string) || "BK").toUpperCase().slice(0, 5),
        min_guests: clampInt(formData.get("min_guests"), 1, 1, 10000),
        max_guests: clampInt(formData.get("max_guests"), 500, 1, 10000),
        event_types: eventTypes.length ? eventTypes : ["Wedding", "Birthday", "Corporate event", "Other"],
        locale: (formData.get("locale") as string) || "en-US",
      })
      .eq("id", 1)
      .select("id");

    if (error) failure = friendlyDbError(error.message);
    else if (!data || data.length === 0)
      failure = `No settings row was updated — the settings table in ${dbHost()} has no row with id 1. Run supabase/schema.sql in that project.`;
  } catch (e) {
    failure = e instanceof Error ? e.message : "Unexpected error while saving.";
  }

  if (failure) {
    redirect(`/admin/settings?error=${encodeURIComponent(failure.slice(0, 200))}`);
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/book");
  redirect("/admin/settings?saved=1");
}

export type SaveResult = { ok: boolean; error?: string };

function dbHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "unknown";
  }
}

/**
 * Missing-column errors mean the connected database hasn't had
 * supabase/schema.sql run against it. Say so, and name the database, so
 * it's obvious which Supabase project needs the update.
 */
function friendlyDbError(message: string): string {
  if (/schema cache|could not find/i.test(message)) {
    return `${message}. The connected database (${dbHost()}) is missing newer columns — run supabase/schema.sql in that Supabase project's SQL Editor, then try again.`;
  }
  return message;
}

export async function saveSiteContent(formData: FormData): Promise<SaveResult> {
  await requireUser();
  try {
    return await saveSiteContentInner(formData);
  } catch (e) {
    // Return the real message: thrown server-action errors are masked in
    // production builds, which made failures look like generic crashes.
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error while saving.",
    };
  }
}

async function saveSiteContentInner(formData: FormData): Promise<SaveResult> {
  const supabase = createAdminClient();

  const logo = formData.get("logo") as File | null;
  let logo_url: string | undefined;
  if (logo && logo.size > 0) {
    logo_url = await uploadSiteAsset(logo);
  }

  const bgMode = (formData.get("bg_mode") as string) || "carousel";

  const bgImages: string[] = [];
  const existingBgImages = formData.getAll("existing_bg_images") as string[];
  bgImages.push(...existingBgImages);

  for (let i = 0; i < 15; i++) {
    const file = formData.get(`bg_image_${i}`) as File | null;
    if (file && file.size > 0) {
      const url = await uploadSiteAsset(file);
      bgImages.push(url);
    }
  }

  let bg_static_image: string | null | undefined;
  const staticFile = formData.get("bg_static_image") as File | null;
  if (staticFile && staticFile.size > 0) {
    bg_static_image = await uploadSiteAsset(staticFile);
  } else {
    const existing = formData.get("existing_bg_static_image") as string;
    if (existing) bg_static_image = existing;
  }

  const policiesRaw = (formData.get("policies") as string) || "";
  const policies = policiesRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const sidebarFaqsRaw = (formData.get("sidebar_faqs") as string) || "[]";
  let sidebar_faqs: FaqItem[] = [];
  try {
    sidebar_faqs = JSON.parse(sidebarFaqsRaw);
  } catch {
    sidebar_faqs = [];
  }

  const wizardFaqsRaw = (formData.get("wizard_faqs") as string) || "[]";
  let wizard_faqs: FaqItem[] = [];
  try {
    wizard_faqs = JSON.parse(wizardFaqsRaw);
  } catch {
    wizard_faqs = [];
  }

  const navPagesRaw = (formData.get("nav_pages") as string) || "[]";
  let nav_pages: {
    label: string;
    title: string;
    content: string;
    sections: { heading: string; body: string }[];
  }[] = [];
  try {
    const parsed = JSON.parse(navPagesRaw);
    if (Array.isArray(parsed)) {
      nav_pages = parsed
        .map((p) => ({
          label: String(p?.label ?? "").trim().slice(0, 40),
          title: String(p?.title ?? "").trim().slice(0, 120),
          content: String(p?.content ?? "").trim().slice(0, 5000),
          sections: Array.isArray(p?.sections)
            ? p.sections
                .map((s: unknown) => {
                  const sec = s as { heading?: unknown; body?: unknown };
                  return {
                    heading: String(sec?.heading ?? "").trim().slice(0, 120),
                    body: String(sec?.body ?? "").trim().slice(0, 2000),
                  };
                })
                .filter(
                  (s: { heading: string; body: string }) =>
                    s.heading || s.body
                )
                .slice(0, 12)
            : [],
        }))
        .filter((p) => p.label)
        .slice(0, 6);
    }
  } catch {
    nav_pages = [];
  }

  const row: Record<string, unknown> = {
    brand_name: (formData.get("brand_name") as string) || "My Business",
    tagline: (formData.get("tagline") as string) || "Your tagline here",
    description: (formData.get("description") as string) || "",
    cta_text: (formData.get("cta_text") as string) || "Book Now",
    footer_tagline: (formData.get("footer_tagline") as string) || "",
    copyright_text: (formData.get("copyright_text") as string) || "",
    bg_mode: bgMode,
    bg_images: bgImages.slice(0, 15),
    bg_overlay_color:
      (formData.get("bg_overlay_color") as string) || "#5c1f1a",
    bg_overlay_opacity: clampInt(formData.get("bg_overlay_opacity"), 80, 0, 100),
    booking_hero_label: (formData.get("booking_hero_label") as string) || "",
    booking_hero_title: (formData.get("booking_hero_title") as string) || "",
    booking_hero_subtitle:
      (formData.get("booking_hero_subtitle") as string) || "",
    sidebar_title: (formData.get("sidebar_title") as string) || "What you get",
    sidebar_description: (formData.get("sidebar_description") as string) || "",
    sidebar_faqs,
    policies: policies.length ? policies : ["We currently serve {service_area} only."],
    wizard_faqs: wizard_faqs.length ? wizard_faqs : [],
    color_primary: (formData.get("color_primary") as string) || "#5c1f1a",
    color_accent: (formData.get("color_accent") as string) || "#6f4e37",
    color_page_bg: (formData.get("color_page_bg") as string) || "#faf6f0",
    color_text: (formData.get("color_text") as string) || "#2c1e14",
    color_surface: (formData.get("color_surface") as string) || "#f0e6d8",
    color_border: (formData.get("color_border") as string) || "#e8ddd0",
    color_highlight: (formData.get("color_highlight") as string) || "#c08457",
    color_card: (formData.get("color_card") as string) || "#ffffff",
    social_instagram: ((formData.get("social_instagram") as string) || "").trim(),
    social_facebook: ((formData.get("social_facebook") as string) || "").trim(),
    social_tiktok: ((formData.get("social_tiktok") as string) || "").trim(),
    font_display: sanitizeDisplayFont(formData.get("font_display") as string),
    font_body: sanitizeBodyFont(formData.get("font_body") as string),
    font_size_base: clampInt(formData.get("font_size_base"), 16, 14, 18),
    font_weight_body: clampInt(formData.get("font_weight_body"), 400, 300, 500),
    nav_pages,
  };

  if (logo_url) row.logo_url = logo_url;
  if (bg_static_image !== undefined) row.bg_static_image = bg_static_image;

  const { data, error } = await supabase
    .from("site_content")
    .update(row)
    .eq("id", 1)
    .select("id");

  if (error) return { ok: false, error: friendlyDbError(error.message) };
  if (!data || data.length === 0)
    return {
      ok: false,
      error: `Nothing was saved — the site_content table in ${dbHost()} has no row with id 1. Run supabase/schema.sql in that project.`,
    };

  // Layout-scope revalidation: theme colors and fonts live in the root
  // layout, so bust everything rendered beneath it.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function savePaymentConfig(
  formData: FormData
): Promise<SaveResult> {
  await requireUser();
  try {
    const supabase = createAdminClient();

    const id = formData.get("id") as string;
    const publicKeyInput = ((formData.get("public_key") as string) || "").trim();
    const secretKeyInput = ((formData.get("secret_key") as string) || "").trim();
    const webhookSecretInput = ((formData.get("webhook_secret") as string) || "").trim();
    const isActive = formData.get("is_active") === "on";

    const { data: existing } = await supabase
      .from("payment_configs")
      .select("secret_key, public_key, webhook_secret, provider, config")
      .eq("id", id)
      .single();

    const publicKey = publicKeyInput || existing?.public_key || null;
    const secretKey = secretKeyInput || existing?.secret_key || null;
    const webhookSecret = webhookSecretInput || existing?.webhook_secret || null;

    if (isActive && !secretKey) {
      return {
        ok: false,
        error: "A secret key is required to activate a payment provider.",
      };
    }

    let config = (existing?.config as Record<string, unknown>) ?? {};
    if (existing?.provider === "paypal") {
      const mode = formData.get("paypal_mode") as string;
      if (mode === "sandbox" || mode === "live") {
        config = { ...config, mode };
      }
    }

    // Multiple providers may be active at once; each checkout method is
    // routed to the first active provider that supports it.
    const { data, error } = await supabase
      .from("payment_configs")
      .update({
        public_key: publicKey,
        secret_key: secretKey,
        webhook_secret: webhookSecret,
        is_active: isActive,
        config,
      })
      .eq("id", id)
      .select("id");

    if (error) return { ok: false, error: friendlyDbError(error.message) };
    if (!data || data.length === 0)
      return {
        ok: false,
        error: `Nothing was saved — provider row not found in ${dbHost()}. Run supabase/schema.sql in that project.`,
      };

    revalidatePath("/admin", "layout");
    revalidatePath("/admin/settings");
    revalidatePath("/book");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error while saving.",
    };
  }
}
