import "server-only";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";

/**
 * Email + password sign-in (migration 0004). Sessions are opaque tokens kept in
 * an httpOnly cookie; the database stores only their hash and checks them on
 * every call.
 */

export const COOKIE = "wfm_session";
const MAX_AGE = 12 * 60 * 60;

export interface Session {
  personId: number;
  email: string;
  mustChange: boolean;
  token: string;
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await db().rpc("workforce_session", { p_token: token });
  if (error || !data) return null;
  return { ...(data as Omit<Session, "token">), token };
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

/** Readable temporary password, e.g. "Kq7m-Xr2t-9Pzw" (14 chars, letters and digits). */
export function tempPassword() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const D = "23456789";
  const A = L + D;
  const group = (withDigit: boolean) => {
    const c = Array.from({ length: 4 }, () => A[randomInt(A.length)]);
    c[0] = L[randomInt(L.length)];
    if (withDigit) c[1 + randomInt(3)] = D[randomInt(D.length)];
    return c.join("");
  };
  return [group(true), group(true), group(false)].join("-");
}

/** Map database errors to HTTP responses people can act on. */
export function authError(e: unknown) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  const table: [string, number, string][] = [
    ["workforce_unauthorized", 401, "Please sign in again."],
    ["workforce_forbidden", 403, "You don’t have permission to do that."],
    ["workforce_weak_password", 400, "Use at least 10 characters, with letters and numbers, different from the old password."],
    ["workforce_locked", 423, "Too many wrong attempts. Try again in 15 minutes."],
    ["workforce_email_taken", 409, "That email already has a sign-in for another person."],
    ["workforce_bad_email", 400, "Enter a valid email address."],
  ];
  const hit = table.find(([k]) => msg.includes(k));
  if (!hit) console.error(e);
  return NextResponse.json({ error: hit ? hit[2] : "Something went wrong. Try again." }, { status: hit ? hit[1] : 500 });
}

/** Session required (and password already changed), else a 401/403 response. */
export async function requireSession(): Promise<Session | NextResponse> {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (s.mustChange) return NextResponse.json({ error: "Change your temporary password first." }, { status: 403 });
  return s;
}

/** Create or reset a person's sign-in with a new temporary password. */
export async function issueLogin(token: string, personId: number, email: string) {
  const pw = tempPassword();
  const { error } = await db().rpc("workforce_set_login", { p_token: token, p_email: email, p_person_id: personId, p_password: pw });
  if (error) throw new Error(error.message);
  return pw;
}
