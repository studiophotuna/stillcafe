import type { BookingStatus } from "@/lib/types";

const STYLES: Record<BookingStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-espresso/[0.04] text-espresso/60 border-espresso/10",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
