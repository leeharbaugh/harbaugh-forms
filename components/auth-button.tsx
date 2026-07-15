import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import { formatProfileDisplayName } from "@/lib/types/profile";

export async function AuthButton() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/auth/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "preferred_name, display_name, first_name, middle_name, last_name, email",
    )
    .eq("id", user.id)
    .maybeSingle();

  const identity = formatProfileDisplayName({
    preferred_name: profile?.preferred_name ?? null,
    display_name: profile?.display_name ?? null,
    first_name: profile?.first_name ?? null,
    middle_name: profile?.middle_name ?? null,
    last_name: profile?.last_name ?? null,
    email: profile?.email ?? user.email ?? null,
  });

  return (
    <div className="flex max-w-[14rem] items-center gap-2 sm:max-w-none sm:gap-3">
      <span
        className="truncate text-xs text-muted-foreground"
        title={user.email ?? identity}
      >
        <span className="sr-only">Signed in as </span>
        {identity}
      </span>
      <LogoutButton />
    </div>
  );
}
