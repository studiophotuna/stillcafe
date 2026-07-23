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
    <div className="card flex flex-col overflow-hidden transition-shadow hover:shadow-glow">
      <div className="aspect-[4/3] w-full bg-sand">
        {pkg.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pkg.image_url}
            alt={pkg.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-espresso/10">
            SC
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-serif text-lg font-semibold text-espresso">
          {pkg.name}
        </h3>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-espresso/50">
          {pkg.description}
        </p>

        {pkg.inclusions.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-xs text-espresso/60">
            {pkg.inclusions.slice(0, 5).map((inc, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-[10px] text-caramel">&#10003;</span>
                <span>{inc}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center gap-3 text-[11px] text-espresso/30">
          <span>{pkg.duration_hours}h</span>
          {pkg.max_guests ? <span>&middot; up to {pkg.max_guests} guests</span> : null}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-latte/40 pt-4">
          <div className="text-base font-semibold text-espresso">
            {formatMoney(pkg.price_cents)}
          </div>
          <Link href={href} className="btn-primary px-5 py-2 text-xs">
            {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
