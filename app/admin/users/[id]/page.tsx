import { AdminUserDetailPage } from "@/components/admin/admin-user-detail-page";
import { getAdminUserDetail } from "@/lib/admin/manage-user-detail";
import { createAdminClient } from "@/lib/supabase/admin";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

async function UserDetailContent({ userId }: { userId: string }) {
  await connection();
  const detail = await getAdminUserDetail(userId);
  if (!detail) {
    notFound();
  }

  const admin = createAdminClient();
  const { data: organizations } = await admin
    .from("organizations")
    .select("id, name")
    .neq("status", "DELETED")
    .order("name");

  return (
    <AdminUserDetailPage
      detail={detail}
      organizations={(organizations ?? []).map((org) => ({
        id: org.id as string,
        name: org.name as string,
      }))}
    />
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading user…</p>
      }
    >
      <UserDetailContent userId={id} />
    </Suspense>
  );
}
