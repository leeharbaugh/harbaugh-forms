"use client";

import {
  createOrganizationAction,
  setOrganizationStatusAction,
} from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { AdminOrganizationListItem } from "@/lib/admin/manage-organizations";
import { formatPhoneInput } from "@/lib/phone-format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AdminOrganizationsPageProps = {
  organizations: AdminOrganizationListItem[];
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

export function AdminOrganizationsPage({
  organizations,
}: AdminOrganizationsPageProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] =
    useState<AdminOrganizationListItem | null>(null);

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("TX");
  const [zip, setZip] = useState("");
  const [brokerageLicenseNumber, setBrokerageLicenseNumber] = useState("");
  const [brokerFirstName, setBrokerFirstName] = useState("");
  const [brokerMiddleName, setBrokerMiddleName] = useState("");
  const [brokerLastName, setBrokerLastName] = useState("");
  const [brokerLicenseNumber, setBrokerLicenseNumber] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");

  const resetCreateForm = () => {
    setName("");
    setLegalName("");
    setEmail("");
    setPhone("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setState("TX");
    setZip("");
    setBrokerageLicenseNumber("");
    setBrokerFirstName("");
    setBrokerMiddleName("");
    setBrokerLastName("");
    setBrokerLicenseNumber("");
    setBrokerPhone("");
    setBrokerEmail("");
  };

  const onCreate = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await createOrganizationAction({
        name,
        legalName,
        email,
        phone,
        addressLine1,
        addressLine2,
        city,
        state,
        zip,
        brokerageLicenseNumber,
        brokerFirstName,
        brokerMiddleName,
        brokerLastName,
        brokerLicenseNumber,
        brokerPhone,
        brokerEmail,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`Created organization ${result.organization.name}.`);
      setShowCreate(false);
      resetCreateForm();
      router.refresh();
    });
  };

  const onToggleStatus = (org: AdminOrganizationListItem) => {
    if (org.status === "ACTIVE") {
      setPendingDeactivate(org);
      return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await setOrganizationStatusAction({
        organizationId: org.id,
        status: "ACTIVE",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`Reactivated ${org.name}.`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDialog
        open={pendingDeactivate != null}
        title="Deactivate organization?"
        message={
          pendingDeactivate
            ? `This will deactivate “${pendingDeactivate.name}”. Memberships remain on record but the organization will be treated as inactive.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="destructive"
        isConfirming={isPending}
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => {
          if (!pendingDeactivate) {
            return;
          }
          const org = pendingDeactivate;
          setPendingDeactivate(null);
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await setOrganizationStatusAction({
              organizationId: org.id,
              status: "INACTIVE",
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage(`Deactivated ${org.name}.`);
            router.refresh();
          });
        }}
      />

      <AdminSectionNav active="organizations" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizations
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage brokerages and organizational entities. Membership does not
            share business records between members.
          </p>
        </div>
        <Button type="button" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "Add organization"}
        </Button>
      </div>

      {message ? (
        <p className="text-sm text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create organization</CardTitle>
            <CardDescription>
              Application-owned organization fields used for invitations and
              memberships.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="org-name">Name *</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-legal">Legal / business name</Label>
              <Input
                id="org-legal"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-email">Email</Label>
              <Input
                id="org-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-phone">Office phone</Label>
              <Input
                id="org-phone"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="org-addr1">Address line 1</Label>
              <Input
                id="org-addr1"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="org-addr2">Address line 2</Label>
              <Input
                id="org-addr2"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-city">City</Label>
              <Input
                id="org-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-state">State</Label>
              <Input
                id="org-state"
                value={state}
                maxLength={2}
                onChange={(e) => setState(e.target.value.toUpperCase())}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-zip">ZIP</Label>
              <Input
                id="org-zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-license">Brokerage license number</Label>
              <Input
                id="org-license"
                value={brokerageLicenseNumber}
                onChange={(e) => setBrokerageLicenseNumber(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broker-first">Broker first name</Label>
              <Input
                id="broker-first"
                value={brokerFirstName}
                onChange={(e) => setBrokerFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broker-middle">Broker middle name</Label>
              <Input
                id="broker-middle"
                value={brokerMiddleName}
                onChange={(e) => setBrokerMiddleName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broker-last">Broker last name</Label>
              <Input
                id="broker-last"
                value={brokerLastName}
                onChange={(e) => setBrokerLastName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broker-license">Broker license number</Label>
              <Input
                id="broker-license"
                value={brokerLicenseNumber}
                onChange={(e) => setBrokerLicenseNumber(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broker-phone">Broker phone</Label>
              <Input
                id="broker-phone"
                value={brokerPhone}
                onChange={(e) => setBrokerPhone(formatPhoneInput(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broker-email">Broker email</Label>
              <Input
                id="broker-email"
                type="email"
                value={brokerEmail}
                onChange={(e) => setBrokerEmail(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="button" disabled={isPending} onClick={onCreate}>
                {isPending ? "Creating…" : "Create organization"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All organizations</CardTitle>
          <CardDescription>
            Active and inactive organizations. Soft-deleted records are hidden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No organizations found.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Members</th>
                    <th className="px-4 py-3">Active agents</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {organizations.map((org) => (
                    <tr key={org.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{org.name}</div>
                        {org.legal_name ? (
                          <div className="text-xs text-muted-foreground">
                            {org.legal_name}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            org.status === "ACTIVE" ? "secondary" : "outline"
                          }
                        >
                          {org.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {org.activeMemberCount}
                        <span className="text-muted-foreground">
                          {" "}
                          / {org.memberCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {org.activeAgentCount}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(org.update_date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/organizations/${org.id}`}>
                              View
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/admin/organizations/${org.id}?edit=1`}
                            >
                              Edit
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant={
                              org.status === "ACTIVE" ? "destructive" : "default"
                            }
                            size="sm"
                            disabled={isPending}
                            onClick={() => onToggleStatus(org)}
                          >
                            {org.status === "ACTIVE"
                              ? "Deactivate"
                              : "Activate"}
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
    </div>
  );
}
