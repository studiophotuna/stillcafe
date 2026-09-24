"use client";

import { useEffect, useState } from "react";
import { AuthCard, AuthError } from "@/components/AuthCard";
import { safeNext } from "@/lib/session";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/calendar");

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || "Sign-in failed. Try again.");
        setBusy(false);
        return;
      }
      window.location.replace(j.mustChange ? `/change-password?next=${encodeURIComponent(next)}` : next);
    } catch {
      setErr("Couldn’t reach the server. Check your connection.");
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" sub="Use your work email and the password your admin gave you.">
      <form onSubmit={submit} className="auth-form">
        <div className="field">
          <label htmlFor="li-email">Email</label>
          <input id="li-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="li-pw">Password</label>
          <input id="li-pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <AuthError text={err} />
        <button className="btn btn-primary btn-40" type="submit" disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="auth-sub">Forgot your password? Ask your team admin to reset it.</p>
      </form>
    </AuthCard>
  );
}
