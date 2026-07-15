import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function AdminNavLink({
  className,
  active = false,
}: {
  className?: string;
  active?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role, status, onboarding_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.app_role !== "ADMIN" ||
    profile.status !== "ACTIVE" ||
    profile.onboarding_status !== "ACTIVE"
  ) {
    return null;
  }

  return (
    <Link
      href="/admin/users"
      className={className}
      aria-current={active ? "page" : undefined}
    >
      Admin
    </Link>
  );
}
