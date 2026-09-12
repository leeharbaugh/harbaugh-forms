import { AdminOrganizationsPage } from "@/components/admin/admin-organizations-page";
import { listAdminOrganizations } from "@/lib/admin/manage-organizations";
import { requireAppAdminPage } from "@/lib/admin/require-app-admin-page";
import { connection } from "next/server";
import { Suspense } from "react";

async function AdminOrganizationsContent() {
  await connection();
  await requireAppAdminPage();
  const organizations = await listAdminOrganizations();
  return <AdminOrganizationsPage organizations={organizations} />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading organizations…</p>
      }
    >
      <AdminOrganizationsContent />
    </Suspense>
  );
}
