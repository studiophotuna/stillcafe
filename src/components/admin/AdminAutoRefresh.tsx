"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AdminAutoRefresh({ interval = 15_000 }: { interval?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, interval);
    return () => clearInterval(id);
  }, [router, interval]);

  return null;
}
