"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Package } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { PackageForm } from "./PackageForm";
import { deletePackage } from "@/app/admin/actions";

export function PackagesManager({ packages }: { packages: Package[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Package | null>(null);
  const [creating, setCreating] = useState(false);

  function done() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this package? This cannot be undone.")) return;
    const fd = new FormData();
    fd.set("id", id);
    await deletePackage(fd);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-espresso">Packages</h1>
          <p className="mt-1 text-[13px] text-espresso/30">
            {packages.length} total
          </p>
        </div>
        {!creating && !editing && (
          <button
            className="btn-primary"
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
          >
            + New package
          </button>
        )}
      </div>

      {(creating || editing) && (
        <div className="mt-6 card p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-espresso">
            {editing ? `Edit — ${editing.name}` : "New package"}
          </h2>
          <PackageForm pkg={editing ?? undefined} onDone={done} />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {packages.map((p) => (
          <div
            key={p.id}
            className="card flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-sand text-xl">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-espresso/20">+</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-espresso">
                    {p.name}
                  </h3>
                  {!p.is_active && (
                    <span className="rounded-md border border-espresso/8 bg-espresso/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-espresso/35">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="text-[13px] tabular-nums text-espresso/40">
                  {formatMoney(p.price_cents)}
                  {p.deposit_cents > 0
                    ? ` · ${formatMoney(p.deposit_cents)} deposit`
                    : ""}{" "}
                  · {p.duration_hours}h
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary py-2 text-[13px]"
                onClick={() => {
                  setEditing(p);
                  setCreating(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Edit
              </button>
              <button
                className="btn rounded-lg border border-red-200 py-2 text-[13px] text-red-500 hover:bg-red-50"
                onClick={() => onDelete(p.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
