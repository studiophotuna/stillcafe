"use client";

import type { ReactNode } from "react";
import { Blueprint } from "./ui";

/** Centered card for the sign-in and password pages. */
export function AuthCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="auth">
      <Blueprint className="auth-card">
        <div className="side-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dsv-logo.png" alt="DSV" />
          <span>Workforce Management</span>
        </div>
        <h1 className="dialog-title" style={{ fontSize: 28, margin: 0 }}>
          {title}
        </h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </Blueprint>
    </div>
  );
}

export function AuthError({ text }: { text: string }) {
  return text ? (
    <div className="auth-error" role="alert">
      {text}
    </div>
  ) : null;
}
