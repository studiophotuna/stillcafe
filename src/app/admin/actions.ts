"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/format";
import type { BookingStatus, PaymentMethod } from "@/lib/types";

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

async function uploadImage(file: File): Promise<string | null> {
  if (!file || file.size === 0) return null;
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

  revalidatePath("/admin/packages");
  revalidatePath("/");
}

export async function deletePackage(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/packages");
  revalidatePath("/");
}

export async function updateBookingStatus(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();
  const id = formData.get("id") as string;
  const status = formData.get("status") as BookingStatus;
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/bookings");
}

export async function saveSettings(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();

  const methods = formData.getAll("payment_methods") as PaymentMethod[];

  const { error } = await supabase
    .from("settings")
    .update({
      payment_provider:
        (formData.get("payment_provider") as string) || "paymongo",
      payment_methods: methods.length ? methods : ["gcash"],
      business_name: (formData.get("business_name") as string) || "Still Café",
      business_email: (formData.get("business_email") as string) || null,
      deposit_percent: clampInt(formData.get("deposit_percent"), 50, 1, 100),
      standard_hours: Number(formData.get("standard_hours")) || 3,
      combo_discount_cents: toCents((formData.get("combo_discount") as string) || "0"),
      combo_min_packages: clampInt(formData.get("combo_min_packages"), 2, 1, 10),
      extra_hour_cents: toCents((formData.get("extra_hour_price") as string) || "0"),
      service_area: (formData.get("service_area") as string) || "Metro Manila",
    })
    .eq("id", 1);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
  revalidatePath("/book");
}
