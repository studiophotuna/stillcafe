"use client";

import { useEffect } from "react";

const IDLE_MS = 5 * 60_000;
const IDLE_FACTOR = 4;

/**
 * Background refresh that only runs while someone can see it: every `ms` while the
 * tab is visible, `ms × 4` after five minutes without mouse or keyboard, nothing
 * while the tab is hidden, and (if `eager`) once straight away when the tab comes back.
 * Each refresh is a server call (and database reads), so idle tabs shouldn't cost any.
 */
export function usePoll(refresh: () => void, ms: number, eager = true) {
  useEffect(() => {
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, Date.now() - last > IDLE_MS ? ms * IDLE_FACTOR : ms);
    };
    const wake = () => {
      const wasIdle = Date.now() - last > IDLE_MS;
      last = Date.now();
      if (wasIdle && eager) {
        refresh();
        schedule();
      }
    };
    const onShow = () => {
      if (document.visibilityState === "visible") {
        last = Date.now();
        if (eager) refresh();
      }
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onShow);
    for (const e of ["pointerdown", "keydown", "wheel"]) window.addEventListener(e, wake, { passive: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      for (const e of ["pointerdown", "keydown", "wheel"]) window.removeEventListener(e, wake);
    };
  }, [refresh, ms, eager]);
}
