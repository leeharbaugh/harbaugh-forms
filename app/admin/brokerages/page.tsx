import { AdminBrokeragesPage } from "@/components/admin/admin-brokerages-page";
import { listAdminOrganizations } from "@/lib/admin/manage-organizations";
import { connection } from "next/server";
import { Suspense } from "react";

async function AdminBrokeragesContent() {
  await connection();
  const organizations = await listAdminOrganizations();
  return <AdminBrokeragesPage organizations={organizations} />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading brokerages…</p>
      }
    >
      <AdminBrokeragesContent />
    </Suspense>
  );
}
