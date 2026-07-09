"use client";

import { useState } from "react";
import type { Package } from "@/lib/types";
import { savePackage } from "@/app/admin/actions";

export function PackageForm({
  pkg,
  onDone,
}: {
  pkg?: Package;
  onDone?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      await savePackage(formData);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form action={action} className="space-y-4">
      {pkg && <input type="hidden" name="id" value={pkg.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Package name</label>
          <input
            name="name"
            required
            defaultValue={pkg?.name}
            className="field-input"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">Description</label>
          <textarea
            name="description"
            rows={3}
            defaultValue={pkg?.description}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label">Price (₱)</label>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={pkg ? pkg.price_cents / 100 : ""}
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label">Duration (hours)</label>
          <input
            name="duration_hours"
            type="number"
            step="0.5"
            min="0"
            defaultValue={pkg?.duration_hours ?? 2}
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label">Max guests (optional)</label>
          <input
            name="max_guests"
            type="number"
            min="0"
            defaultValue={pkg?.max_guests ?? ""}
            className="field-input"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">
            Inclusions — one per line
          </label>
          <textarea
            name="inclusions"
            rows={4}
            defaultValue={pkg?.inclusions.join("\n")}
            placeholder={"1 professional barista\nUnlimited espresso drinks\nSetup & teardown"}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label">Sort order</label>
          <input
            name="sort_order"
            type="number"
            defaultValue={pkg?.sort_order ?? 0}
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label">Slug (optional)</label>
          <input
            name="slug"
            defaultValue={pkg?.slug}
            placeholder="auto-generated from name"
            className="field-input"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label">
            Package image {pkg?.image_url ? "(replace)" : ""}
          </label>
          <input
            name="image"
            type="file"
            accept="image/*"
            className="field-input file:mr-3 file:rounded-full file:border-0 file:bg-mocha file:px-4 file:py-1.5 file:text-cream"
          />
          {pkg?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pkg.image_url}
              alt=""
              className="mt-2 h-20 w-28 rounded-lg object-cover"
            />
          )}
        </div>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={pkg ? pkg.is_active : true}
            className="h-4 w-4 rounded border-latte"
          />
          <span className="text-sm text-espresso/80">
            Active (visible to customers)
          </span>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving…" : pkg ? "Save changes" : "Create package"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
