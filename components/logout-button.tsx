"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // replace + refresh: leave the authenticated tree and force a clean
    // login page (avoids a cached LoginForm still showing "Logging in...").
    router.replace("/auth/login");
    router.refresh();
  };

  return (
    <Button onClick={logout} variant="ghost" size="sm">
      Logout
    </Button>
  );
}
