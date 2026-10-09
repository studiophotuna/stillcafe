import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the server (the browser never talks to Supabase).
 *
 * Key: SUPABASE_SECRET_KEY when set (recommended). Until then it falls back to
 * the project's publishable key, which migrations 0002/0003 allow to call the
 * workforce_* functions. That key is public, so anyone holding it can read and
 * change the data: fine for fictional sample data, not for real data.
 * Set WORKFORCE_DB=off to force in-memory sample data.
 * Set WORKFORCE_DEMO=1 for a demo / preview site: sample data only, and the database can't be
 * reached at all (db() refuses), whatever other variables are set.
 */

/** Public values (safe to commit): the stillcafe project URL and its publishable key. */
const DEFAULT_URL = "https://qepcyhgtyhjnxxlrjebk.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable__c_JHm0ZJqEm1dPwUdgEsA_y52JhRCV";

let client: SupabaseClient | null = null;

/** A demo / preview deployment: never connected to the database. */
export const demoOnly = () => process.env.WORKFORCE_DEMO === "1";

export const dbConfigured = () => !demoOnly() && process.env.WORKFORCE_DB !== "off";

/** Which key the server uses: "secret" or "publishable". */
export const keyKind = () => (process.env.SUPABASE_SECRET_KEY ? "secret" : "publishable");

export function db() {
  if (demoOnly()) throw new Error("This is a demo site: it has no database.");
  client ??= createClient(
    process.env.SUPABASE_URL || DEFAULT_URL,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}

/** Raised when someone else saved first; callers reload and retry. */
export class ConflictError extends Error {}

/** The signed-in person may not do this. */
export class ForbiddenError extends Error {}
