"use client";

import {
  resendInvitationAction,
  setUserAccountStatusAction,
  setUserAppRoleAction,
  updateAdminUserProfileAction,
  upsertAdminAgentSettingsAction,
} from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { Badge } from "@/components/ui/badge";
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
import type { AdminUserDetail } from "@/lib/admin/manage-user-detail";
import { formatPhoneInput } from "@/lib/phone-format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type OrgOption = { id: string; name: string };

type AdminUserDetailPageProps = {
  detail: AdminUserDetail;
  organizations: OrgOption[];
};

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

export function AdminUserDetailPage({
  detail,
  organizations,
}: AdminUserDetailPageProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingDeactivate, setPendingDeactivate] = useState(false);

  const profile = detail.profile;
  const agent = detail.agentSettings;

  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [middleName, setMiddleName] = useState(profile?.middle_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [preferredName, setPreferredName] = useState(
    profile?.preferred_name ?? "",
  );
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [primaryOrganizationId, setPrimaryOrganizationId] = useState(
    profile?.primary_organization_id ?? "",
  );

  const [legalFirstName, setLegalFirstName] = useState(
    agent?.legal_first_name ?? profile?.first_name ?? "",
  );
  const [legalMiddleName, setLegalMiddleName] = useState(
    agent?.legal_middle_name ?? profile?.middle_name ?? "",
  );
  const [legalLastName, setLegalLastName] = useState(
    agent?.legal_last_name ?? profile?.last_name ?? "",
  );
  const [agentPreferredName, setAgentPreferredName] = useState(
    agent?.preferred_name ?? "",
  );
  const [agentDisplayName, setAgentDisplayName] = useState(
    agent?.display_name ?? "",
  );
  const [agentEmail, setAgentEmail] = useState(agent?.email ?? "");
  const [agentPhone, setAgentPhone] = useState(agent?.phone ?? "");
  const [phoneAlternate, setPhoneAlternate] = useState(
    agent?.phone_alternate ?? "",
  );
  const [addressLine1, setAddressLine1] = useState(agent?.address_line_1 ?? "");
  const [addressLine2, setAddressLine2] = useState(agent?.address_line_2 ?? "");
  const [city, setCity] = useState(agent?.city ?? "");
  const [state, setState] = useState(agent?.state ?? "TX");
  const [zip, setZip] = useState(agent?.zip ?? "");
  const [trecLicenseNumber, setTrecLicenseNumber] = useState(
    agent?.trec_license_number ?? "",
  );
  const [title, setTitle] = useState(agent?.title ?? "");

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDialog
        open={pendingDeactivate}
        title="Deactivate user?"
        message="This user will no longer be able to access the application until reactivated."
        confirmLabel="Deactivate"
        confirmingLabel="Deactivating…"
        variant="destructive"
        isConfirming={isPending}
        onCancel={() => setPendingDeactivate(false)}
        onConfirm={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await setUserAccountStatusAction({
              userId: detail.id,
              status: "INACTIVE",
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setPendingDeactivate(false);
            setMessage("User deactivated.");
            router.refresh();
          });
        }}
      />

      <AdminSectionNav active="users" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/users" className="hover:underline">
              Users / Agents
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile?.display_name ||
              detail.loginEmail ||
              "User"}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>Login: {detail.loginEmail ?? "—"} (read-only)</span>
            <Badge variant="secondary">{profile?.app_role ?? "—"}</Badge>
            <Badge variant="outline">{profile?.status ?? "—"}</Badge>
            <Badge variant="outline">
              {profile?.onboarding_status ?? "—"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || Boolean(detail.emailConfirmedAt)}
            onClick={() => {
              setMessage(null);
              setError(null);
              startTransition(async () => {
                const result = await resendInvitationAction(detail.id);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage("Invitation resent.");
              });
            }}
          >
            Resend invite
          </Button>
          {profile?.status === "ACTIVE" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setPendingDeactivate(true)}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                setError(null);
                startTransition(async () => {
                  const result = await setUserAccountStatusAction({
                    userId: detail.id,
                    status: "ACTIVE",
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setMessage("User reactivated.");
                  router.refresh();
                });
              }}
            >
              Activate
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setMessage(null);
              setError(null);
              startTransition(async () => {
                const next = profile?.app_role === "ADMIN" ? "USER" : "ADMIN";
                const result = await setUserAppRoleAction({
                  userId: detail.id,
                  appRole: next,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage(`Application role set to ${next}.`);
                router.refresh();
              });
            }}
          >
            {profile?.app_role === "ADMIN" ? "Make USER" : "Make ADMIN"}
          </Button>
        </div>
      </div>

      {message ? (
        <p className="text-sm text-success">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Access summary</CardTitle>
          <CardDescription>
            Auth identity fields are read-only. Login email cannot be changed in
            this release.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Created</p>
            <p>{formatDate(detail.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last sign-in</p>
            <p>{formatDate(detail.lastSignInAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email confirmed</p>
            <p>{formatDate(detail.emailConfirmedAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Auth ban until</p>
            <p>{formatDate(detail.bannedUntil)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>First name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Middle name</Label>
            <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Last name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Preferred name</Label>
            <Input
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Primary organization</Label>
            <Select
              value={primaryOrganizationId}
              onChange={(e) => setPrimaryOrganizationId(e.target.value)}
            >
              <option value="">None</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </div>
          <FormActions className="md:col-span-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                setError(null);
                startTransition(async () => {
                  const result = await updateAdminUserProfileAction({
                    userId: detail.id,
                    input: {
                      firstName,
                      middleName,
                      lastName,
                      preferredName,
                      displayName,
                      primaryOrganizationId: primaryOrganizationId || null,
                    },
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setMessage("Profile updated.");
                  router.refresh();
                });
              }}
            >
              Save profile
            </Button>
          </FormActions>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent settings</CardTitle>
          <CardDescription>
            Real-estate agent business profile stored in user_agent_settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Legal first name</Label>
            <Input
              value={legalFirstName}
              onChange={(e) => setLegalFirstName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Legal middle name</Label>
            <Input
              value={legalMiddleName}
              onChange={(e) => setLegalMiddleName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Legal last name</Label>
            <Input
              value={legalLastName}
              onChange={(e) => setLegalLastName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Preferred name</Label>
            <Input
              value={agentPreferredName}
              onChange={(e) => setAgentPreferredName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Display name</Label>
            <Input
              value={agentDisplayName}
              onChange={(e) => setAgentDisplayName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Business email</Label>
            <Input
              type="email"
              value={agentEmail}
              onChange={(e) => setAgentEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Business phone</Label>
            <Input
              value={agentPhone}
              onChange={(e) => setAgentPhone(formatPhoneInput(e.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Alternate phone</Label>
            <Input
              value={phoneAlternate}
              onChange={(e) =>
                setPhoneAlternate(formatPhoneInput(e.target.value))
              }
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Address line 1</Label>
            <Input
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Address line 2</Label>
            <Input
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>State</Label>
            <Input
              value={state}
              maxLength={2}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </div>
          <div className="grid gap-2">
            <Label>ZIP</Label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>TREC license</Label>
            <Input
              value={trecLicenseNumber}
              onChange={(e) => setTrecLicenseNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <FormActions className="md:col-span-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                setError(null);
                startTransition(async () => {
                  const result = await upsertAdminAgentSettingsAction({
                    userId: detail.id,
                    input: {
                      legalFirstName,
                      legalMiddleName,
                      legalLastName,
                      preferredName: agentPreferredName,
                      displayName: agentDisplayName,
                      email: agentEmail,
                      phone: agentPhone,
                      phoneAlternate,
                      addressLine1,
                      addressLine2,
                      city,
                      state,
                      zip,
                      trecLicenseNumber,
                      title,
                    },
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setMessage("Agent settings saved.");
                  router.refresh();
                });
              }}
            >
              Save agent settings
            </Button>
          </FormActions>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization memberships</CardTitle>
          <CardDescription>
            Manage memberships from the organization detail pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">No memberships.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {detail.memberships.map((membership) => (
                <li
                  key={membership.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div>
                    <div className="font-medium">
                      {membership.organizationName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {membership.membershipRole} · {membership.status}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/admin/organizations/${membership.organizationId}`}
                    >
                      Open organization
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
