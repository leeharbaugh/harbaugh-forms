"use client";

import {
  createOrganizationAction,
  inviteUserAction,
  resendInvitationAction,
  setUserAccountStatusAction,
  setUserAppRoleAction,
} from "@/app/admin/actions";
import type { AdminUserListItem } from "@/lib/admin/list-users";
import type { InviteUserInput } from "@/lib/admin/invite-validation";
import { formatPhoneInput } from "@/lib/phone-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

type OrgOption = { id: string; name: string };

type AdminUsersPageProps = {
  users: AdminUserListItem[];
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

export function AdminUsersPage({ users, organizations }: AdminUsersPageProps) {
  const [orgs, setOrgs] = useState(organizations);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0);

  const [loginEmail, setLoginEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [primaryOrganizationId, setPrimaryOrganizationId] = useState(
    organizations[0]?.id ?? "",
  );
  const [membershipRole, setMembershipRole] = useState<"MEMBER" | "ORG_ADMIN">(
    "MEMBER",
  );
  const [agentEmail, setAgentEmail] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [trecLicenseNumber, setTrecLicenseNumber] = useState("");
  const [title, setTitle] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("TX");
  const [zip, setZip] = useState("");

  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgLegalName, setNewOrgLegalName] = useState("");
  const [newOrgEmail, setNewOrgEmail] = useState("");
  const [newOrgPhone, setNewOrgPhone] = useState("");
  const [newOrgLicense, setNewOrgLicense] = useState("");

  const sortedUsers = useMemo(() => users, [users]);

  const buildInviteInput = (): InviteUserInput => ({
    loginEmail,
    appRole: "USER",
    accountStatus: "ACTIVE",
    firstName,
    middleName: middleName || null,
    lastName,
    preferredName: preferredName || null,
    displayName: displayName || null,
    primaryOrganizationId,
    additionalMemberships: primaryOrganizationId
      ? [{ organizationId: primaryOrganizationId, membershipRole }]
      : [],
    agentEmail: agentEmail || null,
    agentPhone: agentPhone || null,
    trecLicenseNumber: trecLicenseNumber || null,
    title: title || null,
    addressLine1: addressLine1 || null,
    addressLine2: addressLine2 || null,
    city: city || null,
    state: state || "TX",
    zip: zip || null,
  });

  const onInvite = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await inviteUserAction(buildInviteInput());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        result.invitationSent
          ? `Invitation sent to ${result.email}.`
          : `Account provisioned for ${result.email} (invitation email was not resent).`,
      );
      setLoginEmail("");
      setFirstName("");
      setMiddleName("");
      setLastName("");
      setPreferredName("");
      setDisplayName("");
      setAgentEmail("");
      setAgentPhone("");
      setTrecLicenseNumber("");
      setTitle("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setZip("");
    });
  };

  const onCreateOrg = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await createOrganizationAction({
        name: newOrgName,
        legalName: newOrgLegalName || null,
        email: newOrgEmail || null,
        phone: newOrgPhone || null,
        brokerageLicenseNumber: newOrgLicense || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOrgs((current) =>
        [...current, { id: result.organization.id, name: result.organization.name }].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      setPrimaryOrganizationId(result.organization.id);
      setNewOrgName("");
      setNewOrgLegalName("");
      setNewOrgEmail("");
      setNewOrgPhone("");
      setNewOrgLicense("");
      setMessage(`Created organization ${result.organization.name}.`);
    });
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite and manage application users. Organization membership does not
          share business records between members.
        </p>
        {message ? (
          <p className="text-sm text-emerald-700">{message}</p>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-foreground/10 p-5">
        <h2 className="text-lg font-medium">Invite user</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="loginEmail">Login email</Label>
            <Input
              id="loginEmail"
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Application role</Label>
            <Input value="USER" disabled readOnly />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="firstName">Legal first name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="middleName">Legal middle name</Label>
            <Input
              id="middleName"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lastName">Legal last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="preferredName">Preferred name</Label>
            <Input
              id="preferredName"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Derived if left blank"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="primaryOrganizationId">Primary organization</Label>
            <select
              id="primaryOrganizationId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={primaryOrganizationId}
              onChange={(e) => setPrimaryOrganizationId(e.target.value)}
            >
              <option value="">Select organization</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="membershipRole">Membership role</Label>
            <select
              id="membershipRole"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={membershipRole}
              onChange={(e) =>
                setMembershipRole(e.target.value as "MEMBER" | "ORG_ADMIN")
              }
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ORG_ADMIN">ORG_ADMIN</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Does not grant application-level business-data access.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agentEmail">Agent/business email</Label>
            <Input
              id="agentEmail"
              type="email"
              value={agentEmail}
              onChange={(e) => setAgentEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agentPhone">Agent phone</Label>
            <Input
              id="agentPhone"
              value={agentPhone}
              onChange={(e) => setAgentPhone(formatPhoneInput(e.target.value))}
              placeholder="XXX-XXX-XXXX"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trecLicenseNumber">TREC license number</Label>
            <Input
              id="trecLicenseNumber"
              value={trecLicenseNumber}
              onChange={(e) => setTrecLicenseNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="addressLine1">Business address line 1</Label>
            <Input
              id="addressLine1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="addressLine2">Business address line 2</Label>
            <Input
              id="addressLine2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="zip">ZIP</Label>
            <Input
              id="zip"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Button type="button" disabled={isPending} onClick={onInvite}>
            {isPending ? "Working..." : "Send invitation"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-foreground/10 p-5">
        <h2 className="text-lg font-medium">Create organization</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="newOrgName">Name</Label>
            <Input
              id="newOrgName"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newOrgLegalName">Legal name</Label>
            <Input
              id="newOrgLegalName"
              value={newOrgLegalName}
              onChange={(e) => setNewOrgLegalName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newOrgEmail">Email</Label>
            <Input
              id="newOrgEmail"
              type="email"
              value={newOrgEmail}
              onChange={(e) => setNewOrgEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newOrgPhone">Phone</Label>
            <Input
              id="newOrgPhone"
              value={newOrgPhone}
              onChange={(e) => setNewOrgPhone(formatPhoneInput(e.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newOrgLicense">Brokerage license</Label>
            <Input
              id="newOrgLicense"
              value={newOrgLicense}
              onChange={(e) => setNewOrgLicense(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !newOrgName.trim()}
            onClick={onCreateOrg}
          >
            Create organization
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">User directory</h2>
        <div className="overflow-x-auto rounded-lg border border-foreground/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-foreground/10 bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Onboarding</th>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Last sign-in</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-foreground/5 align-top"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{user.displayName}</div>
                    {user.preferredName ? (
                      <div className="text-xs text-muted-foreground">
                        Preferred: {user.preferredName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{user.loginEmail ?? "—"}</td>
                  <td className="px-3 py-2">{user.appRole ?? "—"}</td>
                  <td className="px-3 py-2">{user.profileStatus ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div>{user.onboardingStatus ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      Invited {formatDate(user.invitedAt)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{user.primaryOrganizationName ?? "—"}</div>
                    {user.memberships.length > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        {user.memberships
                          .map(
                            (m) => `${m.organizationName} (${m.membershipRole})`,
                          )
                          .join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {user.agentSettingsComplete ? "Complete" : "Incomplete"}
                  </td>
                  <td className="px-3 py-2">{formatDate(user.lastSignInAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          isPending ||
                          Boolean(user.emailConfirmedAt) ||
                          Date.now() < resendCooldownUntil
                        }
                        onClick={() => {
                          setMessage(null);
                          setError(null);
                          startTransition(async () => {
                            const result = await resendInvitationAction(user.id);
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            setResendCooldownUntil(Date.now() + 30_000);
                            setMessage(`Invitation resent to ${user.loginEmail}.`);
                          });
                        }}
                      >
                        Resend invite
                      </Button>
                      {user.profileStatus === "ACTIVE" ? (
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
                                userId: user.id,
                                status: "INACTIVE",
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Deactivated ${user.loginEmail}.`);
                            });
                          }}
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
                                userId: user.id,
                                status: "ACTIVE",
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Reactivated ${user.loginEmail}.`);
                            });
                          }}
                        >
                          Reactivate
                        </Button>
                      )}
                      {user.appRole === "USER" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => {
                            setMessage(null);
                            setError(null);
                            startTransition(async () => {
                              const result = await setUserAppRoleAction({
                                userId: user.id,
                                appRole: "ADMIN",
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Promoted ${user.loginEmail} to ADMIN.`);
                            });
                          }}
                        >
                          Make ADMIN
                        </Button>
                      ) : user.appRole === "ADMIN" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => {
                            setMessage(null);
                            setError(null);
                            startTransition(async () => {
                              const result = await setUserAppRoleAction({
                                userId: user.id,
                                appRole: "USER",
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setMessage(`Demoted ${user.loginEmail} to USER.`);
                            });
                          }}
                        >
                          Make USER
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Invitation redirects use{" "}
          <Link href="/auth/update-password" className="underline">
            /auth/update-password
          </Link>{" "}
          after confirmation.
        </p>
      </section>
    </div>
  );
}
