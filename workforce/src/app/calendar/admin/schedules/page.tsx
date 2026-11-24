"use client";

import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { useCalView } from "@/lib/calendar/useCalView";

/** Admin: the team calendar with schedule editing, Update schedules and Upload schedule. */
export default function SchedulesPage() {
  const v = useCalView();
  return (
    <>
      <div className="page-head">
        <h1>Schedules</h1>
        <span>Change anyone’s schedule or record leave by clicking a day, update several people at once, or upload a schedule. The Calendar page is the view for everyone.</span>
      </div>
      {v.multi && <div className="banner">You’re viewing {v.unitLabel}. Choose a team above to change schedules.</div>}
      <CalendarGrid edit />
    </>
  );
}
