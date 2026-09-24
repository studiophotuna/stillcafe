"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { WorkloadProvider } from "@/lib/workload/store";

export default function WorkloadLayout({ children }: { children: React.ReactNode }) {
  // Sample data and times are generated from the client clock, so render on the client only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <WorkloadProvider>
      <Shell>{children}</Shell>
    </WorkloadProvider>
  );
}
