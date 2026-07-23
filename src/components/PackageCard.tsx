import Link from "next/link";
import type { Package } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export function PackageCard({
  pkg,
  href,
  cta = "Select",
}: {
  pkg: Package;
  href: string;
  cta?: string;
}) {
  return (
    <div className="card flex flex-col overflow-hidden transition-shadow hover:shadow-card">
      <div className="aspect-[4/3] w-full bg-sand">
        {pkg.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pkg.image_url}
            alt={pkg.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-espresso/10">
            +
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-serif text-lg text-espresso">
          {pkg.name}
        </h3>
        <p className="mt-2 flex-1 text-[13px] leading-relaxed text-espresso/40">
          {pkg.description}
        </p>

        {pkg.inclusions.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-[13px] text-espresso/50">
            {pkg.inclusions.slice(0, 5).map((inc, i) => (
              <li key={i} className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-sage">
                  <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>{inc}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center gap-3 text-[12px] text-espresso/25">
          <span>{pkg.duration_hours}h</span>
          {pkg.max_guests ? <span>· up to {pkg.max_guests} guests</span> : null}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-latte pt-4">
          <div className="text-base font-semibold tabular-nums text-espresso">
            {formatMoney(pkg.price_cents)}
          </div>
          <Link href={href} className="btn-primary px-5 py-2 text-[13px]">
            {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
