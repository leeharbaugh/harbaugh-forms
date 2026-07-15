"use client";

import {
  addOrganizationMembershipAction,
  updateOrganizationAction,
  updateOrganizationMembershipAction,
  setOrganizationStatusAction,
} from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { RecordStatusBadge } from "@/components/ui/list-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminMembershipListItem } from "@/lib/admin/manage-memberships";
import type { OrganizationInput } from "@/lib/admin/manage-organizations";
import { formatPhoneInput } from "@/lib/phone-format";
import type { Organization } from "@/lib/types/organization";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type UserOption = { id: string; label: string; email: string | null };

type AdminOrganizationDetailPageProps = {
  organization: Organization;
  memberships: AdminMembershipListItem[];
  userOptions: UserOption[];
  initialEdit?: boolean;
};

function fieldClassName() {
  return "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm";
}

export function AdminOrganizationDetailPage({
  organization,
  memberships,
  userOptions,
  initialEdit = false,
}: AdminOrganizationDetailPageProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(initialEdit);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingRemove, setPendingRemove] =
    useState<AdminMembershipListItem | null>(null);

  const [form, setForm] = useState<OrganizationInput>(() => ({
    name: organization.name,
    legalName: organization.legal_name,
    email: organization.email,
    phone: organization.phone,
    addressLine1: organization.address_line_1,
    addressLine2: organization.address_line_2,
    city: organization.city,
    state: organization.state ?? "TX",
    zip: organization.zip,
    brokerageLicenseNumber: organization.brokerage_license_number,
    brokerFirstName: organization.broker_first_name,
    brokerMiddleName: organization.broker_middle_name,
    brokerLastName: organization.broker_last_name,
    brokerLicenseNumber: organization.broker_license_number,
    brokerPhone: organization.broker_phone,
    brokerEmail: organization.broker_email,
  }));

  useEffect(() => {
    setForm({
      name: organization.name,
      legalName: organization.legal_name,
      email: organization.email,
      phone: organization.phone,
      addressLine1: organization.address_line_1,
      addressLine2: organization.address_line_2,
      city: organization.city,
      state: organization.state ?? "TX",
      zip: organization.zip,
      brokerageLicenseNumber: organization.brokerage_license_number,
      brokerFirstName: organization.broker_first_name,
      brokerMiddleName: organization.broker_middle_name,
      brokerLastName: organization.broker_last_name,
      brokerLicenseNumber: organization.broker_license_number,
      brokerPhone: organization.broker_phone,
      brokerEmail: organization.broker_email,
    });
  }, [organization]);

  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"MEMBER" | "ORG_ADMIN">("MEMBER");

  const activeMemberships = useMemo(
    () => memberships.filter((row) => row.status === "ACTIVE"),
    [memberships],
  );
  const inactiveMemberships = useMemo(
    () => memberships.filter((row) => row.status !== "ACTIVE"),
    [memberships],
  );

  const eligibleUsers = useMemo(() => {
    const activeIds = new Set(activeMemberships.map((row) => row.user_id));
    return userOptions.filter((user) => !activeIds.has(user.id));
  }, [userOptions, activeMemberships]);

  const onSave = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateOrganizationAction({
        organizationId: organization.id,
        input: form,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Organization updated.");
      setEditing(false);
      router.refresh();
    });
  };

  const onAddMember = () => {
    if (!addUserId) {
      setError("Select a user to add.");
      return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await addOrganizationMembershipAction({
        organizationId: organization.id,
        userId: addUserId,
        membershipRole: addRole,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Membership added.");
      setAddUserId("");
      setAddRole("MEMBER");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDialog
        open={pendingRemove != null}
        title="Remove membership?"
        message={
          pendingRemove
            ? `This will remove ${pendingRemove.displayName} from ${organization.name}. The membership will be marked deleted and can be re-added later.`
            : ""
        }
        confirmLabel="Remove"
        variant="destructive"
        isConfirming={isPending}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) {
            return;
          }
          const membership = pendingRemove;
          setPendingRemove(null);
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await updateOrganizationMembershipAction({
              membershipId: membership.id,
              organizationId: organization.id,
              userId: membership.user_id,
              status: "DELETED",
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage("Membership removed.");
            router.refresh();
          });
        }}
      />

      <AdminSectionNav active="organizations" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/organizations" className="hover:underline">
              Organizations
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {organization.name}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <RecordStatusBadge status={organization.status} />
            {organization.organization_type ? (
              <span className="text-sm text-muted-foreground">
                {organization.organization_type}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "Cancel edit" : "Edit"}
          </Button>
          <Button
            type="button"
            variant={
              organization.status === "ACTIVE" ? "destructive" : "default"
            }
            disabled={isPending}
            onClick={() => {
              setMessage(null);
              setError(null);
              startTransition(async () => {
                const result = await setOrganizationStatusAction({
                  organizationId: organization.id,
                  status:
                    organization.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage(
                  organization.status === "ACTIVE"
                    ? "Organization deactivated."
                    : "Organization activated.",
                );
                router.refresh();
              });
            }}
          >
            {organization.status === "ACTIVE" ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      {message ? (
        <p className="text-sm text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
          <CardDescription>
            Application-owned organization information.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["Name", "name"],
              ["Legal name", "legalName"],
              ["Email", "email"],
              ["Office phone", "phone"],
              ["Address line 1", "addressLine1"],
              ["Address line 2", "addressLine2"],
              ["City", "city"],
              ["State", "state"],
              ["ZIP", "zip"],
              ["Brokerage license", "brokerageLicenseNumber"],
              ["Broker first name", "brokerFirstName"],
              ["Broker middle name", "brokerMiddleName"],
              ["Broker last name", "brokerLastName"],
              ["Broker license", "brokerLicenseNumber"],
              ["Broker phone", "brokerPhone"],
              ["Broker email", "brokerEmail"],
            ] as const
          ).map(([label, key]) => (
            <div key={key} className="grid gap-2">
              <Label>{label}</Label>
              {editing ? (
                <Input
                  value={(form[key] as string | null | undefined) ?? ""}
                  onChange={(e) => {
                    const value =
                      key === "phone" || key === "brokerPhone"
                        ? formatPhoneInput(e.target.value)
                        : key === "state"
                          ? e.target.value.toUpperCase()
                          : e.target.value;
                    setForm((current) => ({ ...current, [key]: value }));
                  }}
                  maxLength={key === "state" ? 2 : undefined}
                />
              ) : (
                <p className="text-sm">
                  {(form[key] as string | null | undefined)?.trim() || "—"}
                </p>
              )}
            </div>
          ))}
          {editing ? (
            <div className="md:col-span-2">
              <Button type="button" disabled={isPending} onClick={onSave}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add membership</CardTitle>
          <CardDescription>
            Add an existing user. Duplicate active memberships are blocked.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="add-user">User</Label>
            <select
              id="add-user"
              className={fieldClassName()}
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
            >
              <option value="">Select user</option>
              {eligibleUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-role">Role</Label>
            <select
              id="add-role"
              className={fieldClassName()}
              value={addRole}
              onChange={(e) =>
                setAddRole(e.target.value as "MEMBER" | "ORG_ADMIN")
              }
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ORG_ADMIN">ORG_ADMIN</option>
            </select>
          </div>
          <Button type="button" disabled={isPending} onClick={onAddMember}>
            Add
          </Button>
        </CardContent>
      </Card>

      <MembershipTable
        title="Active memberships"
        rows={activeMemberships}
        isPending={isPending}
        onChangeRole={(membership, role) => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await updateOrganizationMembershipAction({
              membershipId: membership.id,
              organizationId: organization.id,
              userId: membership.user_id,
              membershipRole: role,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage("Membership role updated.");
            router.refresh();
          });
        }}
        onSetStatus={(membership, status) => {
          if (status === "DELETED") {
            setPendingRemove(membership);
            return;
          }
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await updateOrganizationMembershipAction({
              membershipId: membership.id,
              organizationId: organization.id,
              userId: membership.user_id,
              status,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage("Membership status updated.");
            router.refresh();
          });
        }}
      />

      <MembershipTable
        title="Inactive memberships"
        rows={inactiveMemberships}
        isPending={isPending}
        onChangeRole={(membership, role) => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await updateOrganizationMembershipAction({
              membershipId: membership.id,
              organizationId: organization.id,
              userId: membership.user_id,
              membershipRole: role,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage("Membership role updated.");
            router.refresh();
          });
        }}
        onSetStatus={(membership, status) => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await updateOrganizationMembershipAction({
              membershipId: membership.id,
              organizationId: organization.id,
              userId: membership.user_id,
              status,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage("Membership status updated.");
            router.refresh();
          });
        }}
      />
    </div>
  );
}

function MembershipTable({
  title,
  rows,
  isPending,
  onChangeRole,
  onSetStatus,
}: {
  title: string;
  rows: AdminMembershipListItem[];
  isPending: boolean;
  onChangeRole: (
    membership: AdminMembershipListItem,
    role: "MEMBER" | "ORG_ADMIN",
  ) => void;
  onSetStatus: (
    membership: AdminMembershipListItem,
    status: "ACTIVE" | "INACTIVE" | "DELETED",
  ) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.userEmail ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className={fieldClassName()}
                        value={row.membership_role}
                        disabled={isPending}
                        onChange={(e) =>
                          onChangeRole(
                            row,
                            e.target.value as "MEMBER" | "ORG_ADMIN",
                          )
                        }
                      >
                        <option value="MEMBER">MEMBER</option>
                        <option value="ORG_ADMIN">ORG_ADMIN</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <RecordStatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>{row.trecLicenseNumber ?? "—"}</div>
                      <div>{row.agentPhone ?? row.agentEmail ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/users/${row.user_id}`}>
                            Open user
                          </Link>
                        </Button>
                        {row.status === "ACTIVE" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => onSetStatus(row, "INACTIVE")}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => onSetStatus(row, "ACTIVE")}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => onSetStatus(row, "DELETED")}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
