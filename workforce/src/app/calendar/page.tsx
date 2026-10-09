"use client";

import { AttendanceSummary } from "@/components/calendar/AttendanceSummary";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { useCalendar } from "@/lib/calendar/store";
import { useCalView } from "@/lib/calendar/useCalView";

/** The team calendar, and today's attendance summary for the team (or all teams shown) for everyone. */
export default function CalendarPage() {
  const s = useCalendar();
  const v = useCalView();
  const scope = v.multi ? v.scopeId : v.unitId;
  return (
    <>
      <CalendarGrid />
      <AttendanceSummary key={scope + s.today} scope={scope} date0={s.today} />
    </>
  );
}
