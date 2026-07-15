import { AdminOrganizationDetailPage } from "@/components/admin/admin-organization-detail-page";
import { listOrganizationMemberships } from "@/lib/admin/manage-memberships";
import { getAdminOrganization } from "@/lib/admin/manage-organizations";
import { listDirectoryUsersForMembershipPicker } from "@/lib/admin/manage-user-detail";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

async function OrganizationDetailContent({
  organizationId,
  edit,
}: {
  organizationId: string;
  edit: boolean;
}) {
  await connection();
  const organization = await getAdminOrganization(organizationId);
  if (!organization) {
    notFound();
  }
  const [memberships, userOptions] = await Promise.all([
    listOrganizationMemberships(organizationId),
    listDirectoryUsersForMembershipPicker(),
  ]);

  return (
    <AdminOrganizationDetailPage
      organization={organization}
      memberships={memberships}
      userOptions={userOptions}
      initialEdit={edit}
    />
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">
          Loading organization…
        </p>
      }
    >
      <OrganizationDetailContent
        organizationId={id}
        edit={query.edit === "1"}
      />
    </Suspense>
  );
}
