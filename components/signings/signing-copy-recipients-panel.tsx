"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCopyRecipientAction,
  listCopyRecipientsAction,
  removeCopyRecipientAction,
} from "@/lib/signing/completed-ops-actions";
import { useCallback, useEffect, useState } from "react";

type CopyRecipientRow = {
  id: string;
  email: string;
  displayName: string | null;
  roleLabel: string | null;
  status: string;
};

/**
 * Delivery-only copy recipients. Configurable before Complete; package delivery
 * occurs only after the Signing becomes Complete.
 */
export function SigningCopyRecipientsPanel({
  signingId,
  lifecycleState,
  canManage,
  embedded = false,
}: {
  signingId: string;
  lifecycleState: string;
  canManage: boolean;
  /** When true, omit outer Card (for nesting inside Completed ops). */
  embedded?: boolean;
}) {
  const [recipients, setRecipients] = useState<CopyRecipientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const reload = useCallback(async () => {
    const result = await listCopyRecipientsAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRecipients((result.data as CopyRecipientRow[] | undefined) ?? []);
  }, [signingId]);

  useEffect(() => {
    if (!canManage) return;
    void reload();
  }, [canManage, reload]);

  if (!canManage) return null;

  const isComplete = lifecycleState === "COMPLETE";

  async function addRecipient() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addCopyRecipientAction({
      signingId,
      email,
      displayName: name || undefined,
      roleLabel: role || undefined,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice(
        isComplete
          ? "Copy recipient added. Package delivery will be queued."
          : "Copy recipient added. They will receive the completed package after this Signing is complete.",
      );
      setEmail("");
      setName("");
      setRole("");
      await reload();
    }
    setBusy(false);
  }

  async function removeRecipient(copyRecipientId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await removeCopyRecipientAction({
      signingId,
      copyRecipientId,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice(
        isComplete
          ? "Copy recipient removed. Access revoked; history retained."
          : "Copy recipient removed. They will not receive a completed package.",
      );
      await reload();
    }
    setBusy(false);
  }

  const body = (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <p className="text-xs text-muted-foreground">
        These people will receive a copy after the Signing is complete. They do
        not sign and do not receive ceremony access.
      </p>
      {recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No copy recipients configured yet.
        </p>
      ) : (
        recipients.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {row.displayName ?? row.email}
              </p>
              <p className="text-sm text-muted-foreground">{row.email}</p>
              {row.roleLabel ? (
                <Badge variant="outline">{row.roleLabel}</Badge>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void removeRecipient(row.id)}
            >
              Remove
            </Button>
          </div>
        ))
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`copy-email-${signingId}`}>Email</Label>
          <Input
            id={`copy-email-${signingId}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`copy-name-${signingId}`}>Name (optional)</Label>
          <Input
            id={`copy-name-${signingId}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`copy-role-${signingId}`}>Role label (optional)</Label>
          <Input
            id={`copy-role-${signingId}`}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={busy || !email.trim()}
        onClick={() => void addRecipient()}
      >
        Add Copy Recipient
      </Button>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Copy recipients</h3>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Copy recipients</CardTitle>
        <CardDescription>
          These people will receive a copy after the Signing is complete.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
