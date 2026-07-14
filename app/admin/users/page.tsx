import { AdminUsersPage } from "@/components/admin/admin-users-page";
import { listAdminUsers } from "@/lib/admin/list-users";
import { createAdminClient } from "@/lib/supabase/admin";
import { connection } from "next/server";
import { Suspense } from "react";

async function AdminUsersContent() {
  // Admin directory is request-time only (Auth Admin API + profile merges).
  await connection();

  const users = await listAdminUsers();
  const admin = createAdminClient();
  const { data: organizations } = await admin
    .from("organizations")
    .select("id, name, status")
    .eq("status", "ACTIVE")
    .order("name");

  return (
    <AdminUsersPage
      users={users}
      organizations={(organizations ?? []).map((org) => ({
        id: org.id as string,
        name: org.name as string,
      }))}
    />
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading users…</p>
      }
    >
      <AdminUsersContent />
    </Suspense>
  );
}
