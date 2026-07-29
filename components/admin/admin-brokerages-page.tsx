"use client";

import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPageHeader } from "@/components/list-page-header";
import { ListRowActions } from "@/components/list-row-actions";
import { Button } from "@/components/ui/button";
import { RecordStatusBadge } from "@/components/ui/list-badges";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { AdminOrganizationListItem } from "@/lib/admin/manage-organizations";
import Link from "next/link";
import { useMemo, useState } from "react";

type AdminBrokeragesPageProps = {
  organizations: AdminOrganizationListItem[];
};

function formatBrokerName(org: AdminOrganizationListItem): string {
  const parts = [
    org.broker_first_name,
    org.broker_middle_name,
    org.broker_last_name,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

export function AdminBrokeragesPage({
  organizations,
}: AdminBrokeragesPageProps) {
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ACTIVE");

  const filtered = useMemo(() => {
    const brokerages = organizations.filter(
      (org) =>
        org.organization_type === "BROKERAGE" ||
        org.activeOfficeCount > 0 ||
        Boolean(org.brokerage_license_number?.trim()) ||
        Boolean(org.broker_license_number?.trim()),
    );

    return brokerages.filter((org) => {
      if (statusFilter === "ALL") {
        return true;
      }
      return org.status === statusFilter;
    });
  }, [organizations, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <AdminSectionNav active="brokerages" />

      <ListPageHeader
        title="Brokerages / Offices"
        description={
          <>
            Organizations are application tenants.{" "}
            <strong className="font-medium">BROKERAGE</strong> organizations are
            licensed brokerage entities; offices are branch locations under a
            brokerage. Manage office details on each organization&apos;s detail
            page.
          </>
        }
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Brokerage organizations</CardTitle>
            <CardDescription>
              Brokerages and organizations with office or license records.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")
              }
              aria-label="Filter by status"
            >
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
              <option value="ALL">All statuses</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <ListEmptyState
              title="No brokerages found"
              description="Create a BROKERAGE organization or add offices from an organization detail page."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/organizations">View organizations</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-secondary/70 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">Organization</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Offices</th>
                    <th className="px-3 py-2.5">Designated broker</th>
                    <th className="px-3 py-2.5">Broker license</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((org) => (
                    <tr
                      key={org.id}
                      className="transition-colors hover:bg-muted/40 focus-within:bg-muted/30"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{org.name}</div>
                        {org.legal_name ? (
                          <div className="text-xs text-muted-foreground">
                            {org.legal_name}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {org.organization_type}
                      </td>
                      <td className="px-3 py-2.5">
                        <RecordStatusBadge status={org.status} />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {org.activeOfficeCount}
                      </td>
                      <td className="px-3 py-2.5">{formatBrokerName(org)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {org.broker_license_number?.trim() ||
                          org.brokerage_license_number?.trim() ||
                          "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <ListRowActions wrap>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/organizations/${org.id}`}>
                              Open organization
                            </Link>
                          </Button>
                        </ListRowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
