import { AdminUsersPage } from "@/components/admin/admin-users-page";
import { listBrokerageOffices } from "@/lib/admin/manage-brokerage-offices";
import { listAdminUsers } from "@/lib/admin/list-users";
import { createAdminClient } from "@/lib/supabase/admin";
import { connection } from "next/server";
import { Suspense } from "react";

async function AdminUsersContent() {
  // Admin directory is request-time only (Auth Admin API + profile merges).
  await connection();

  const users = await listAdminUsers();
  const admin = createAdminClient();
  const [{ data: organizations }, offices] = await Promise.all([
    admin
      .from("organizations")
      .select(
        "id, name, status, broker_license_number, broker_first_name, broker_middle_name, broker_last_name",
      )
      .eq("status", "ACTIVE")
      .order("name"),
    listBrokerageOffices({ includeInactive: false }),
  ]);

  return (
    <AdminUsersPage
      users={users}
      organizations={(organizations ?? []).map((org) => ({
        id: org.id as string,
        name: org.name as string,
        brokerLicenseNumber: org.broker_license_number as string | null,
        brokerFirstName: org.broker_first_name as string | null,
        brokerMiddleName: org.broker_middle_name as string | null,
        brokerLastName: org.broker_last_name as string | null,
      }))}
      offices={offices.map((office) => ({
        id: office.id,
        organizationId: office.organization_id,
        officeName: office.office_name,
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
