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
      className="text-[13px] text-espresso/35 transition hover:text-espresso/60"
    >
      Sign out
    </button>
  );
}
