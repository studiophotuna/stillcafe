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
    <div className="card flex flex-col overflow-hidden">
      <div className="aspect-[4/3] w-full bg-latte/60">
        {pkg.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pkg.image_url}
            alt={pkg.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl text-mocha/40">
            ☕
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-serif text-xl font-semibold text-espresso">
          {pkg.name}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-espresso/70">
          {pkg.description}
        </p>

        {pkg.inclusions.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm text-espresso/80">
            {pkg.inclusions.slice(0, 5).map((inc, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-caramel">✓</span>
                <span>{inc}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex items-center gap-3 text-xs text-espresso/60">
          <span>⏱ {pkg.duration_hours}h</span>
          {pkg.max_guests ? <span>· up to {pkg.max_guests} guests</span> : null}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-latte pt-5">
          <div className="text-lg font-semibold text-espresso">
            {formatMoney(pkg.price_cents)}
          </div>
          <Link href={href} className="btn-primary">
            {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
