"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="text-sm text-espresso/60 hover:text-mocha"
    >
      Sign out
    </button>
  );
}
