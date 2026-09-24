import Link from "next/link";

/** Placeholder until the Calendar module (WFM v2 design) is built. */
export default function CalendarPage() {
  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h1>Calendar</h1>
        <span>The Calendar module is next in the build order. Workload is ready to use.</span>
      </div>
      <Link href="/workload" className="btn btn-primary btn-40" style={{ alignSelf: "flex-start" }}>
        Go to Workload
      </Link>
    </main>
  );
}
