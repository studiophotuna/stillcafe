"use client";

import { useEffect, useState } from "react";
import { AuthCard, AuthError } from "@/components/AuthCard";
import { safeNext, signOut } from "@/lib/session";

/** Required after signing in with a temporary password; also reachable from the sidebar. */
export default function ChangePasswordPage() {
  const [me, setMe] = useState<{ email: string; mustChange: boolean } | null>(null);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/calendar");

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")));
    (async () => {
      const r = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (!r || r.status === 401) return window.location.replace("/login");
      const j = await r.json();
      if (j.demo) return window.location.replace("/calendar");
      setMe({ email: j.email, mustChange: j.mustChange });
    })();
  }, []);

  const rule = pw.length >= 10 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
  const same = pw === pw2;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rule) return setErr("Use at least 10 characters, with letters and numbers.");
    if (!same) return setErr("The new passwords don’t match.");
    if (pw === cur) return setErr("Choose a password different from the current one.");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current: cur, next: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || "Password not changed. Try again.");
        setBusy(false);
        return;
      }
      window.location.replace(next);
    } catch {
      setErr("Couldn’t reach the server. Check your connection.");
      setBusy(false);
    }
  };

  if (!me) return null;
  return (
    <AuthCard
      title={me.mustChange ? "Set your password" : "Change password"}
      sub={
        me.mustChange
          ? `Signed in as ${me.email} with a temporary password. Choose your own password to continue.`
          : `Signed in as ${me.email}.`
      }
    >
      <form onSubmit={submit} className="auth-form">
        <input type="email" autoComplete="username" value={me.email} readOnly hidden />
        <div className="field">
          <label htmlFor="cp-cur">{me.mustChange ? "Temporary password" : "Current password"}</label>
          <input id="cp-cur" className="input" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="cp-new">New password</label>
          <input id="cp-new" className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
          <span className="auth-hint" data-ok={rule || undefined}>
            At least 10 characters, with letters and numbers
          </span>
        </div>
        <div className="field">
          <label htmlFor="cp-new2">Repeat new password</label>
          <input id="cp-new2" className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <AuthError text={err} />
        <button className="btn btn-primary btn-40" type="submit" disabled={busy || !cur || !pw || !pw2}>
          {busy ? "Saving…" : "Save password"}
        </button>
        {me.mustChange ? (
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <a className="btn btn-ghost" href={next}>
            Cancel
          </a>
        )}
      </form>
    </AuthCard>
  );
}
