"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AdminAutoRefresh({ interval = 30_000 }: { interval?: number }) {
  const router = useRouter();
  const paused = useRef(false);

  const onFocusIn = useCallback(() => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      paused.current = true;
    }
  }, []);

  const onFocusOut = useCallback(() => {
    paused.current = false;
  }, []);

  useEffect(() => {
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    const id = setInterval(() => {
      if (!paused.current) router.refresh();
    }, interval);
    return () => {
      clearInterval(id);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [router, interval, onFocusIn, onFocusOut]);

  return null;
}
