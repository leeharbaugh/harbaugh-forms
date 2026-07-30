"use client";

import {
  createManualUserAction,
  permanentlyDeleteTestUserAction,
  previewTestUserDeletionAction,
  setUserTestFlagAction,
} from "@/app/admin/actions";
import { generateTemporaryPassword } from "@/lib/admin/generate-temporary-password";
import type { DeletionDependencySummary } from "@/lib/admin/test-user-deletion-policy";
import type { PublicDeletionFailure } from "@/lib/admin/test-user-deletion-failure";
import type { AdminUserListItem } from "@/lib/admin/list-users";
import type { AppRole } from "@/lib/types/profile";
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
import { Select } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type OrgOption = { id: string; name: string };

export function ManualCreateUserCard({
  organizations,
}: {
  organizations: OrgOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [primaryOrganizationId, setPrimaryOrganizationId] = useState(
    organizations[0]?.id ?? "",
  );
  const [appRole, setAppRole] = useState<AppRole>("USER");
  const [membershipRole, setMembershipRole] = useState<"MEMBER" | "ORG_ADMIN">(
    "MEMBER",
  );
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isTestUser, setIsTestUser] = useState(true);

  const resetForm = () => {
    setLoginEmail("");
    setFirstName("");
    setLastName("");
    setTemporaryPassword("");
    setAppRole("USER");
    setMembershipRole("MEMBER");
    setIsTestUser(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create user manually (no email)</CardTitle>
        <CardDescription>
          Creates a confirmed Auth account with a temporary password and does
          not send an invitation email. Use only when you have independently
          verified the email address — this bypasses email ownership
          verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          Manual creation skips invitation email verification. Prefer{" "}
          <strong>Send invitation</strong> whenever the recipient can receive
          email.
        </div>
        {oneTimePassword ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm">
            <p className="font-medium">
              Temporary password for {createdEmail} (shown once)
            </p>
            <p className="mt-2 break-all font-mono text-base">{oneTimePassword}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Copy it now. It cannot be retrieved later and is not stored by
              Harbaugh Forms.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => {
                setOneTimePassword(null);
                setCreatedEmail(null);
              }}
            >
              I saved the password
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="manualLoginEmail">Email</Label>
            <Input
              id="manualLoginEmail"
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manualAppRole">Application role</Label>
            <Select
              id="manualAppRole"
              value={appRole}
              onChange={(e) => setAppRole(e.target.value as AppRole)}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN (Global Admin)</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manualFirstName">First name</Label>
            <Input
              id="manualFirstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manualLastName">Last name</Label>
            <Input
              id="manualLastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manualOrg">Organization</Label>
            <Select
              id="manualOrg"
              value={primaryOrganizationId}
              onChange={(e) => setPrimaryOrganizationId(e.target.value)}
            >
              <option value="">Select organization</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manualMembershipRole">Membership role</Label>
            <Select
              id="manualMembershipRole"
              value={membershipRole}
              onChange={(e) =>
                setMembershipRole(e.target.value as "MEMBER" | "ORG_ADMIN")
              }
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ORG_ADMIN">ORG_ADMIN</option>
            </Select>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="manualTempPassword">Temporary password</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="manualTempPassword"
                type="text"
                autoComplete="off"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setTemporaryPassword(generateTemporaryPassword())}
              >
                Generate secure password
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              id="manualIsTestUser"
              type="checkbox"
              checked={isTestUser}
              onChange={(e) => setIsTestUser(e.target.checked)}
              className="size-4"
            />
            <Label htmlFor="manualIsTestUser">
              Mark as test user (allows streamlined permanent deletion)
            </Label>
          </div>
        </div>
        <div>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              setOneTimePassword(null);
              startTransition(async () => {
                const result = await createManualUserAction({
                  loginEmail,
                  firstName,
                  lastName,
                  primaryOrganizationId,
                  appRole,
                  membershipRole,
                  temporaryPassword,
                  isTestUser,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setCreatedEmail(result.email);
                setOneTimePassword(result.temporaryPassword);
                resetForm();
                router.refresh();
              });
            }}
          >
            {isPending ? "Creating…" : "Create user without email"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TestUserDeletionControls({
  user,
}: {
  user: AdminUserListItem;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deletionFailure, setDeletionFailure] =
    useState<PublicDeletionFailure | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<DeletionDependencySummary | null>(
    null,
  );
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [resultSteps, setResultSteps] = useState<string | null>(null);

  return (
    <>
      {message ? <p className="text-xs text-success">{message}</p> : null}
      {deletionFailure ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-medium">
            {deletionFailure.dependencyLabel} — {deletionFailure.stage.replaceAll("_", " ")}
          </p>
          <p className="mt-1">{deletionFailure.explanation}</p>
          <p className="mt-1">{deletionFailure.retryGuidance}</p>
          <p className="mt-1 font-mono">Reference: {deletionFailure.reference}</p>
          {deletionFailure.databaseCode ? (
            <p className="mt-1 font-mono">
              Database code: {deletionFailure.databaseCode}
            </p>
          ) : null}
          {deletionFailure.completedSteps.length > 0 ? (
            <p className="mt-1">
              Completed steps: {deletionFailure.completedSteps.join(", ")}
            </p>
          ) : null}
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
      {resultSteps ? (
        <p className="text-xs text-muted-foreground">{resultSteps}</p>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          setDeletionFailure(null);
          setMessage(null);
          startTransition(async () => {
            const result = await setUserTestFlagAction({
              userId: user.id,
              isTestUser: !user.isTestUser,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage(
              user.isTestUser ? "Removed test-user mark." : "Marked as test user.",
            );
            router.refresh();
          });
        }}
      >
        {user.isTestUser ? "Unmark test user" : "Mark test user"}
      </Button>
      {user.isTestUser ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            setError(null);
            setDeletionFailure(null);
            setResultSteps(null);
            startTransition(async () => {
              const preview = await previewTestUserDeletionAction(user.id);
              if (!preview.ok) {
                setError(preview.error);
                setDeletionFailure(
                  "failure" in preview ? (preview.failure ?? null) : null,
                );
                return;
              }
              setSummary(preview.summary);
              setConfirmationEmail("");
              setOpen(true);
            });
          }}
        >
          Delete test user permanently
        </Button>
      ) : null}

      <ConfirmDialog
        open={open}
        title="Permanently delete test user?"
        confirmLabel="Delete permanently"
        confirmingLabel="Deleting…"
        variant="destructive"
        isConfirming={isPending}
        confirmDisabled={
          !summary ||
          confirmationEmail.trim().toLowerCase() !==
            (summary.email ?? "").trim().toLowerCase() ||
          summary.blockingReasons.length > 0
        }
        className="max-w-lg"
        onCancel={() => {
          setOpen(false);
          setSummary(null);
        }}
        onConfirm={() => {
          if (!summary) {
            return;
          }
          setError(null);
          setDeletionFailure(null);
          startTransition(async () => {
            const result = await permanentlyDeleteTestUserAction({
              userId: user.id,
              confirmationEmail,
            });
            if (!result.ok) {
              setError(result.error);
              setDeletionFailure(result.failure ?? null);
              if (result.steps?.length) {
                setResultSteps(
                  result.steps
                    .map((s) => `${s.step}:${s.status}`)
                    .join(", "),
                );
              }
              return;
            }
            setOpen(false);
            setSummary(null);
            setMessage(`Permanently deleted ${result.email}.`);
            setResultSteps(
              result.steps.map((s) => `${s.step}:${s.status}`).join(", "),
            );
            router.refresh();
          });
        }}
      >
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-sm text-muted-foreground">
          <p>
            This hard-deletes Auth for{" "}
            <span className="font-medium text-foreground">
              {summary?.email ?? "this user"}
            </span>{" "}
            so the email can be reused.
          </p>
          {summary ? (
            <ul className="list-disc space-y-1 pl-5">
              {summary.buckets
                .filter((b) => b.count > 0 || b.classification === "blocking")
                .map((b) => (
                  <li key={b.key}>
                    {b.label}: {b.count} (
                    {b.classification.replaceAll("_", " ")})
                  </li>
                ))}
            </ul>
          ) : (
            <p>Loading dependency summary…</p>
          )}
          {summary?.blockingReasons.length ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
              {summary.blockingReasons.join(" ")}
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor={`confirm-delete-${user.id}`}>
              Type the exact email to confirm
            </Label>
            <Input
              id={`confirm-delete-${user.id}`}
              value={confirmationEmail}
              onChange={(e) => setConfirmationEmail(e.target.value)}
              placeholder={summary?.email ?? "user@example.com"}
              autoComplete="off"
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
