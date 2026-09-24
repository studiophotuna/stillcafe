"use client";

/**
 * Who is using the app. With the database on, everyone signs in with email and
 * password; without it the sample data and the "view as" switch are used.
 */
export type Me = { demo: true } | { demo: false; personId: number; email: string };

/** Send the browser to sign-in (or to the password change), keeping the page to come back to. */
export function toLogin(path = "/login") {
  const here = window.location.pathname + window.location.search;
  window.location.replace(`${path}?next=${encodeURIComponent(here)}`);
}

/** Resolve the signed-in person, or redirect and return null. */
export async function loadMe(): Promise<Me | null> {
  try {
    const r = await fetch("/api/auth/me", { cache: "no-store" });
    if (r.status === 401) return toLogin(), null;
    const j = await r.json();
    if (j.demo) return { demo: true };
    if (j.mustChange) return toLogin("/change-password"), null;
    return { demo: false, personId: j.personId, email: j.email };
  } catch {
    // Offline or server error: fall back to sample data rather than a blank page.
    return { demo: true };
  }
}

/** A 401 or 403 from an API call means the session ended or the password must change. */
export function handleAuthStatus(status: number) {
  if (status === 401) return toLogin(), true;
  if (status === 403) return false;
  return false;
}

export async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  window.location.replace("/login");
}

/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/calendar";
}
