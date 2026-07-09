import { createClient } from "@/lib/supabase/server";

/**
 * Ensures a Supabase-authenticated user is present. Throws otherwise.
 * Use at the top of every admin server action / mutation.
 */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated.");
  }
  return user;
}
