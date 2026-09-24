"use client";

import { useEffect, useState } from "react";
import { CalShell } from "@/components/calendar/CalShell";
import { CalendarProvider } from "@/lib/calendar/store";

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  // Sample data and dates come from the client clock, so render on the client only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <CalendarProvider>
      <CalShell>{children}</CalShell>
    </CalendarProvider>
  );
}
