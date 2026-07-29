"use client";

import {
  addOrganizationMembershipAction,
  createBrokerageOfficeAction,
  setBrokerageOfficeStatusAction,
  updateBrokerageOfficeAction,
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
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  BrokerageOffice,
  OfficeDeactivationBlocker,
} from "@/lib/admin/manage-brokerage-offices";
import type { AdminMembershipListItem } from "@/lib/admin/manage-memberships";
import type { OrganizationInput } from "@/lib/admin/manage-organizations";
import { formatPhoneInput } from "@/lib/phone-format";
import type { Organization } from "@/lib/types/organization";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type UserOption = { id: string; label: string; email: string | null };

type OfficeFormState = {
  officeName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  officePhone: string;
  branchLicenseNumber: string;
  isMainOffice: boolean;
};

const emptyOfficeForm = (): OfficeFormState => ({
  officeName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "TX",
  zip: "",
  officePhone: "",
  branchLicenseNumber: "",
  isMainOffice: false,
});

type AdminOrganizationDetailPageProps = {
  organization: Organization;
  memberships: AdminMembershipListItem[];
  userOptions: UserOption[];
  offices: BrokerageOffice[];
  initialEdit?: boolean;
};

export function AdminOrganizationDetailPage({
  organization,
  memberships,
  userOptions,
  offices,
  initialEdit = false,
}: AdminOrganizationDetailPageProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(initialEdit);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingRemove, setPendingRemove] =
    useState<AdminMembershipListItem | null>(null);
  const [pendingOrgDeactivate, setPendingOrgDeactivate] = useState(false);
  const [pendingMembershipDeactivate, setPendingMembershipDeactivate] =
    useState<AdminMembershipListItem | null>(null);
  const [showCreateOffice, setShowCreateOffice] = useState(false);
  const [createOfficeForm, setCreateOfficeForm] =
    useState<OfficeFormState>(emptyOfficeForm);
  const [editingOfficeId, setEditingOfficeId] = useState<string | null>(null);
  const [editOfficeForm, setEditOfficeForm] =
    useState<OfficeFormState>(emptyOfficeForm);
  const [pendingOfficeDeactivate, setPendingOfficeDeactivate] =
    useState<BrokerageOffice | null>(null);
  const [officeDeactivateBlockers, setOfficeDeactivateBlockers] =
    useState<OfficeDeactivationBlocker | null>(null);

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

  const officeNameById = useMemo(() => {
    return new Map(offices.map((office) => [office.id, office.office_name]));
  }, [offices]);

  const brokerDisplayName = useMemo(() => {
    const parts = [
      organization.broker_first_name,
      organization.broker_middle_name,
      organization.broker_last_name,
    ]
      .map((part) => part?.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  }, [organization]);

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

  const onCreateOffice = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await createBrokerageOfficeAction({
        organizationId: organization.id,
        officeName: createOfficeForm.officeName,
        addressLine1: createOfficeForm.addressLine1 || null,
        addressLine2: createOfficeForm.addressLine2 || null,
        city: createOfficeForm.city || null,
        state: createOfficeForm.state || null,
        zip: createOfficeForm.zip || null,
        officePhone: createOfficeForm.officePhone || null,
        branchLicenseNumber: createOfficeForm.branchLicenseNumber || null,
        isMainOffice: createOfficeForm.isMainOffice,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`Created office ${result.office.office_name}.`);
      setShowCreateOffice(false);
      setCreateOfficeForm(emptyOfficeForm());
      router.refresh();
    });
  };

  const startEditOffice = (office: BrokerageOffice) => {
    setEditingOfficeId(office.id);
    setEditOfficeForm({
      officeName: office.office_name,
      addressLine1: office.address_line_1 ?? "",
      addressLine2: office.address_line_2 ?? "",
      city: office.city ?? "",
      state: office.state ?? "TX",
      zip: office.zip ?? "",
      officePhone: office.office_phone ?? "",
      branchLicenseNumber: office.branch_license_number ?? "",
      isMainOffice: office.is_main_office,
    });
  };

  const onSaveOffice = () => {
    if (!editingOfficeId) {
      return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateBrokerageOfficeAction({
        officeId: editingOfficeId,
        organizationId: organization.id,
        input: {
          officeName: editOfficeForm.officeName,
          addressLine1: editOfficeForm.addressLine1 || null,
          addressLine2: editOfficeForm.addressLine2 || null,
          city: editOfficeForm.city || null,
          state: editOfficeForm.state || null,
          zip: editOfficeForm.zip || null,
          officePhone: editOfficeForm.officePhone || null,
          branchLicenseNumber: editOfficeForm.branchLicenseNumber || null,
          isMainOffice: editOfficeForm.isMainOffice,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`Updated office ${result.office.office_name}.`);
      setEditingOfficeId(null);
      router.refresh();
    });
  };

  const requestOfficeDeactivate = (office: BrokerageOffice) => {
    setOfficeDeactivateBlockers(null);
    setPendingOfficeDeactivate(office);
  };

  const onToggleOfficeStatus = (forceClear = false) => {
    if (!pendingOfficeDeactivate) {
      return;
    }
    const office = pendingOfficeDeactivate;
    const nextStatus = office.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await setBrokerageOfficeStatusAction({
        officeId: office.id,
        organizationId: organization.id,
        status: nextStatus,
        forceClearAssignments: forceClear,
      });
      if (!result.ok) {
        if ("blockers" in result && result.blockers) {
          setOfficeDeactivateBlockers(result.blockers);
        }
        setError(result.error);
        return;
      }
      setPendingOfficeDeactivate(null);
      setOfficeDeactivateBlockers(null);
      setMessage(
        nextStatus === "ACTIVE"
          ? `Reactivated office ${office.office_name}.`
          : `Deactivated office ${office.office_name}.`,
      );
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
        confirmingLabel="Removing…"
        variant="destructive"
        isConfirming={isPending}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) {
            return;
          }
          const membership = pendingRemove;
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
            setPendingRemove(null);
            setMessage("Membership removed.");
            router.refresh();
          });
        }}
      />

      <ConfirmDialog
        open={pendingOrgDeactivate}
        title="Deactivate organization?"
        message={`This will deactivate “${organization.name}”. Memberships remain on record but the organization will be treated as inactive.`}
        confirmLabel="Deactivate"
        confirmingLabel="Deactivating…"
        variant="destructive"
        isConfirming={isPending}
        onCancel={() => setPendingOrgDeactivate(false)}
        onConfirm={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await setOrganizationStatusAction({
              organizationId: organization.id,
              status: "INACTIVE",
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setPendingOrgDeactivate(false);
            setMessage("Organization deactivated.");
            router.refresh();
          });
        }}
      />

      <ConfirmDialog
        open={pendingMembershipDeactivate != null}
        title="Deactivate membership?"
        message={
          pendingMembershipDeactivate
            ? `This will deactivate ${pendingMembershipDeactivate.displayName}'s membership in ${organization.name}. They will no longer be treated as an active member until reactivated.`
            : ""
        }
        confirmLabel="Deactivate"
        confirmingLabel="Deactivating…"
        variant="destructive"
        isConfirming={isPending}
        onCancel={() => setPendingMembershipDeactivate(null)}
        onConfirm={() => {
          if (!pendingMembershipDeactivate) {
            return;
          }
          const membership = pendingMembershipDeactivate;
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await updateOrganizationMembershipAction({
              membershipId: membership.id,
              organizationId: organization.id,
              userId: membership.user_id,
              status: "INACTIVE",
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setPendingMembershipDeactivate(null);
            setMessage("Membership deactivated.");
            router.refresh();
          });
        }}
      />

      <ConfirmDialog
        open={pendingOfficeDeactivate != null}
        title={
          pendingOfficeDeactivate?.status === "ACTIVE"
            ? "Deactivate office?"
            : "Reactivate office?"
        }
        message={
          pendingOfficeDeactivate?.status === "ACTIVE"
            ? officeDeactivateBlockers &&
              officeDeactivateBlockers.activeMembershipCount > 0
              ? `This office has ${officeDeactivateBlockers.activeMembershipCount} active member assignment(s). Confirming will clear those office assignments and deactivate "${pendingOfficeDeactivate.office_name}".`
              : `This will deactivate "${pendingOfficeDeactivate?.office_name}".`
            : `Reactivate "${pendingOfficeDeactivate?.office_name}"?`
        }
        confirmLabel={
          pendingOfficeDeactivate?.status === "ACTIVE"
            ? officeDeactivateBlockers &&
              officeDeactivateBlockers.activeMembershipCount > 0
              ? "Clear assignments & deactivate"
              : "Deactivate"
            : "Reactivate"
        }
        confirmingLabel="Working…"
        variant={
          pendingOfficeDeactivate?.status === "ACTIVE" ? "destructive" : "default"
        }
        isConfirming={isPending}
        onCancel={() => {
          setPendingOfficeDeactivate(null);
          setOfficeDeactivateBlockers(null);
        }}
        onConfirm={() => {
          if (!pendingOfficeDeactivate) {
            return;
          }
          onToggleOfficeStatus(
            Boolean(
              officeDeactivateBlockers &&
                officeDeactivateBlockers.activeMembershipCount > 0,
            ),
          );
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
              if (organization.status === "ACTIVE") {
                setPendingOrgDeactivate(true);
                return;
              }
              setMessage(null);
              setError(null);
              startTransition(async () => {
                const result = await setOrganizationStatusAction({
                  organizationId: organization.id,
                  status: "ACTIVE",
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage("Organization activated.");
                router.refresh();
              });
            }}
          >
            {organization.status === "ACTIVE" ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      {message ? (
        <p className="text-sm text-success">{message}</p>
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
            <FormActions className="md:col-span-2">
              <Button type="button" disabled={isPending} onClick={onSave}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </FormActions>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Designated broker</CardTitle>
          <CardDescription>
            Licensed broker of record for this brokerage organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Broker name</Label>
            <p className="text-sm">{brokerDisplayName ?? "—"}</p>
          </div>
          <div>
            <Label>Broker license</Label>
            <p className="text-sm">
              {organization.broker_license_number?.trim() || "—"}
            </p>
          </div>
          <div>
            <Label>Brokerage license</Label>
            <p className="text-sm">
              {organization.brokerage_license_number?.trim() || "—"}
            </p>
          </div>
          <div>
            <Label>Broker contact</Label>
            <p className="text-sm">
              {[organization.broker_phone, organization.broker_email]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Offices</CardTitle>
            <CardDescription>
              Branch offices under this brokerage organization.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setShowCreateOffice((v) => !v)}>
            {showCreateOffice ? "Cancel" : "Add office"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCreateOffice ? (
            <OfficeFormFields
              form={createOfficeForm}
              onChange={setCreateOfficeForm}
              onSubmit={onCreateOffice}
              submitLabel={isPending ? "Creating…" : "Create office"}
              disabled={isPending}
            />
          ) : null}

          {offices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No offices yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Office</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Branch license</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {offices.map((office) => (
                    <tr key={office.id}>
                      <td className="px-4 py-3">
                        {editingOfficeId === office.id ? (
                          <OfficeFormFields
                            compact
                            form={editOfficeForm}
                            onChange={setEditOfficeForm}
                            onSubmit={onSaveOffice}
                            submitLabel={isPending ? "Saving…" : "Save office"}
                            disabled={isPending}
                          />
                        ) : (
                          <>
                            <div className="font-medium">{office.office_name}</div>
                            {office.is_main_office ? (
                              <div className="text-xs text-muted-foreground">
                                Main office
                              </div>
                            ) : null}
                            {office.office_phone ? (
                              <div className="text-xs text-muted-foreground">
                                {office.office_phone}
                              </div>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <RecordStatusBadge status={office.status} />
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {[
                          office.address_line_1,
                          office.city,
                          office.state,
                          office.zip,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {office.branch_license_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {editingOfficeId === office.id ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingOfficeId(null)}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() => startEditOffice(office)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                office.status === "ACTIVE"
                                  ? "destructive"
                                  : "outline"
                              }
                              disabled={isPending}
                              onClick={() => {
                                if (office.status === "ACTIVE") {
                                  requestOfficeDeactivate(office);
                                  return;
                                }
                                setOfficeDeactivateBlockers(null);
                                setPendingOfficeDeactivate(office);
                              }}
                            >
                              {office.status === "ACTIVE"
                                ? "Deactivate"
                                : "Reactivate"}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
            <Select
              id="add-user"
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
            >
              <option value="">Select user</option>
              {eligibleUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-role">Role</Label>
            <Select
              id="add-role"
              value={addRole}
              onChange={(e) =>
                setAddRole(e.target.value as "MEMBER" | "ORG_ADMIN")
              }
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ORG_ADMIN">ORG_ADMIN</option>
            </Select>
          </div>
          <Button type="button" disabled={isPending} onClick={onAddMember}>
            Add
          </Button>
        </CardContent>
      </Card>

      <MembershipTable
        title="Active memberships"
        rows={activeMemberships}
        officeNameById={officeNameById}
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
          if (status === "INACTIVE") {
            setPendingMembershipDeactivate(membership);
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
        officeNameById={officeNameById}
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
    </div>
  );
}

function OfficeFormFields({
  form,
  onChange,
  onSubmit,
  submitLabel,
  disabled,
  compact = false,
}: {
  form: OfficeFormState;
  onChange: (value: OfficeFormState) => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled: boolean;
  compact?: boolean;
}) {
  const fields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor={compact ? "edit-office-name" : "create-office-name"}>
          Office name *
        </Label>
        <Input
          id={compact ? "edit-office-name" : "create-office-name"}
          value={form.officeName}
          onChange={(e) => onChange({ ...form, officeName: e.target.value })}
        />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label>Address line 1</Label>
        <Input
          value={form.addressLine1}
          onChange={(e) => onChange({ ...form, addressLine1: e.target.value })}
        />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label>Address line 2</Label>
        <Input
          value={form.addressLine2}
          onChange={(e) => onChange({ ...form, addressLine2: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>City</Label>
        <Input
          value={form.city}
          onChange={(e) => onChange({ ...form, city: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>State</Label>
        <Input
          value={form.state}
          maxLength={2}
          onChange={(e) =>
            onChange({ ...form, state: e.target.value.toUpperCase() })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label>ZIP</Label>
        <Input
          value={form.zip}
          onChange={(e) => onChange({ ...form, zip: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Office phone</Label>
        <Input
          value={form.officePhone}
          onChange={(e) =>
            onChange({ ...form, officePhone: formatPhoneInput(e.target.value) })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label>Branch license number</Label>
        <Input
          value={form.branchLicenseNumber}
          onChange={(e) =>
            onChange({ ...form, branchLicenseNumber: e.target.value })
          }
        />
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input
          type="checkbox"
          checked={form.isMainOffice}
          onChange={(e) =>
            onChange({ ...form, isMainOffice: e.target.checked })
          }
        />
        Main office
      </label>
    </>
  );

  if (compact) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {fields}
        <div className="md:col-span-2">
          <Button type="button" size="sm" disabled={disabled} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-md border border-dashed border-border p-4 md:grid-cols-2">
      {fields}
      <div className="md:col-span-2">
        <Button type="button" disabled={disabled} onClick={onSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function MembershipTable({
  title,
  rows,
  officeNameById,
  isPending,
  onChangeRole,
  onSetStatus,
}: {
  title: string;
  rows: AdminMembershipListItem[];
  officeNameById: Map<string, string>;
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
                  <th className="px-4 py-3">Office</th>
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
                      <Select
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
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.brokerage_office_id
                        ? officeNameById.get(row.brokerage_office_id) ??
                          row.brokerage_office_id
                        : "—"}
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
