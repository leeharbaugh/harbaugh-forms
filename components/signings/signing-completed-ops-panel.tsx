"use client";

import { SigningCopyRecipientsPanel } from "@/components/signings/signing-copy-recipients-panel";
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
import {
  getCompletedOpsSnapshotAction,
  replaceCompletedPackageLinkAction,
  resendCompletedPackageAction,
  revokeCompletedPackageLinkAction,
  retryFinalizationAction,
} from "@/lib/signing/completed-ops-actions";
import type { CompletedOpsSnapshot } from "@/lib/signing/completed-ops";
import { useCallback, useEffect, useState } from "react";

type ConfirmKind =
  | { type: "resend"; credentialId: string }
  | { type: "replace"; credentialId: string }
  | { type: "revoke"; credentialId: string }
  | { type: "retry-finalization" }
  | null;

export function SigningCompletedOpsPanel({
  signingId,
  lifecycleState,
  finalizationCondition,
}: {
  signingId: string;
  lifecycleState: string;
  finalizationCondition: string;
}) {
  const [snapshot, setSnapshot] = useState<CompletedOpsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);

  const reload = useCallback(async () => {
    const result = await getCompletedOpsSnapshotAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSnapshot(result.data as CompletedOpsSnapshot);
  }, [signingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runConfirmed() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let result;
    if (confirm.type === "resend") {
      result = await resendCompletedPackageAction({
        signingId,
        credentialId: confirm.credentialId,
      });
      if (result.ok) setNotice("Completed-package resend queued.");
    } else if (confirm.type === "replace") {
      result = await replaceCompletedPackageLinkAction({
        signingId,
        credentialId: confirm.credentialId,
      });
      if (result.ok) {
        setNotice(
          "Previous link revoked. A replacement link was issued and queued for send.",
        );
      }
    } else if (confirm.type === "revoke") {
      result = await revokeCompletedPackageLinkAction({
        signingId,
        credentialId: confirm.credentialId,
      });
      if (result.ok) setNotice("Completed-package link revoked.");
    } else {
      result = await retryFinalizationAction({ signingId });
      if (result.ok) setNotice("Finalization retry requested.");
    }
    if (result && !result.ok) {
      setError(result.error);
    } else {
      setConfirm(null);
      await reload();
    }
    setBusy(false);
  }

  const showFinalizationRetry = Boolean(snapshot?.failedFinalization);
  const showCompleted = lifecycleState === "COMPLETE";

  if (!showFinalizationRetry && !showCompleted) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signing operations</CardTitle>
        <CardDescription>
          Finalization and completed-package delivery controls. Raw signing
          links are never shown here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">
            Finalization {finalizationCondition.replace(/_/g, " ")}
          </Badge>
          {snapshot ? (
            <Badge variant="outline">
              Pending/failed work: {snapshot.pendingWorkCount}
            </Badge>
          ) : null}
        </div>

        {snapshot?.failedFinalization ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm">
              Finalization failed. Retry only if the failure is recoverable. Do
              not manually mark Complete.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => setConfirm({ type: "retry-finalization" })}
            >
              Retry Finalization
            </Button>
          </div>
        ) : null}

        {showCompleted && snapshot?.canManage ? (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Completed package delivery</h3>
              <p className="text-xs text-muted-foreground">
                Provider Accepted means the email provider accepted the message.
                It does not guarantee inbox delivery.
              </p>
              {snapshot.deliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed-package credentials yet.
                </p>
              ) : (
                snapshot.deliveries.map((row) => (
                  <div
                    key={row.credentialId}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {row.recipientName}
                      </span>
                      <Badge variant="outline">
                        {row.recipientKind === "COPY"
                          ? "Copy recipient"
                          : "Participant"}
                      </Badge>
                      <Badge
                        variant={
                          row.deliveryLabel === "Failed"
                            ? "destructive"
                            : row.deliveryLabel === "Provider Accepted"
                              ? "success"
                              : "info"
                        }
                      >
                        {row.deliveryLabel}
                      </Badge>
                      {!row.isCurrent || row.revokedAt ? (
                        <Badge variant="secondary">Revoked</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.recipientEmail}
                    </p>
                    {row.lastFailureSafe ? (
                      <p className="text-xs text-destructive">
                        {row.lastFailureSafe}
                      </p>
                    ) : null}
                    {row.isCurrent && !row.revokedAt ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              type: "resend",
                              credentialId: row.credentialId,
                            })
                          }
                        >
                          Resend Package
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              type: "replace",
                              credentialId: row.credentialId,
                            })
                          }
                        >
                          Replace Link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              type: "revoke",
                              credentialId: row.credentialId,
                            })
                          }
                        >
                          Revoke Link
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <SigningCopyRecipientsPanel
              signingId={signingId}
              lifecycleState={lifecycleState}
              canManage={Boolean(snapshot?.canManage)}
              embedded
            />
          </>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.type === "replace"
            ? "Replace completed-package link?"
            : confirm?.type === "revoke"
              ? "Revoke completed-package link?"
              : confirm?.type === "retry-finalization"
                ? "Retry finalization?"
                : "Resend completed package?"
        }
        message={
          confirm?.type === "replace"
            ? "The old link becomes invalid immediately. A new package link will be issued and sent. Certificate and completed documents remain unchanged."
            : confirm?.type === "revoke"
              ? "This invalidates the current credential and sessions. Recipient history is retained. Certificate and documents are unchanged."
              : confirm?.type === "retry-finalization"
                ? "Re-queues recoverable finalization work. Does not manually mark the Signing Complete."
                : "Creates a new intentional send using the current link when recoverable. If the link cannot be recovered, use Replace Link instead."
        }
        confirmLabel={
          confirm?.type === "replace"
            ? "Replace Link"
            : confirm?.type === "revoke"
              ? "Revoke Link"
              : confirm?.type === "retry-finalization"
                ? "Retry Finalization"
                : "Resend Package"
        }
        confirmingLabel="Working…"
        isConfirming={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirmed()}
      />
    </Card>
  );
}
