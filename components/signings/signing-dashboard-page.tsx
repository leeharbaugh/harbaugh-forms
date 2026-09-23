"use client";

import { ListPageHeader } from "@/components/list-page-header";
import { SigningCompletedOpsPanel } from "@/components/signings/signing-completed-ops-panel";
import { SigningDraftPrepPanel } from "@/components/signings/signing-draft-prep-panel";
import { SigningPreviewDialog } from "@/components/signings/signing-preview-dialog";
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
import { startInPersonHandoffAction } from "@/lib/signing/ceremony-agent-actions";
import { SIGNING_CAPACITY_LABEL_OPTIONS } from "@/lib/signing/capacity-notices";
import type { SigningDashboard } from "@/lib/signing/dashboard";
import {
  activateSigningAction,
  getSigningDashboardAction,
  keepCurrentDraftSourceAction,
  replaceParticipantInvitationAction,
  resendParticipantInvitationAction,
  revokeParticipantInvitationAction,
  updateDraftSourceToLatestAction,
} from "@/lib/signing/stage4-actions";
import { useCallback, useEffect, useState } from "react";

type ActivationMode = "REMOTE_SEND" | "IN_PERSON";

function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deliveryLabel(state: string | null): string {
  if (!state) return "No delivery yet";
  switch (state) {
    case "QUEUED":
      return "Invitation queued";
    case "ACCEPTED":
      return "Invitation delivered";
    case "FAILED":
      return "Invitation delivery failed";
    default:
      return `Invitation ${state.toLowerCase()}`;
  }
}

export function SigningDashboardPage({ signingId }: { signingId: string }) {
  const [dashboard, setDashboard] = useState<SigningDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [busyParticipantId, setBusyParticipantId] = useState<string | null>(
    null,
  );
  const [pendingActivation, setPendingActivation] = useState<{
    mode: ActivationMode;
    clientRequestId: string;
  } | null>(null);
  const [activating, setActivating] = useState(false);
  const [handoffBusyParticipantId, setHandoffBusyParticipantId] = useState<
    string | null
  >(null);
  const [handoff, setHandoff] = useState<{
    participantId: string;
    path: string;
    expiresAt: string;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const reload = useCallback(async () => {
    const result = await getSigningDashboardAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDashboard(result.data as SigningDashboard);
  }, [signingId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getSigningDashboardAction({ signingId });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
      } else {
        setDashboard(result.data as SigningDashboard);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [signingId]);

  async function resolveDrift(
    documentId: string,
    choice: "KEEP_CURRENT" | "UPDATE_TO_LATEST",
  ) {
    setBusyDocumentId(documentId);
    setError(null);
    setNotice(null);
    const result =
      choice === "KEEP_CURRENT"
        ? await keepCurrentDraftSourceAction({
            signingId,
            signingDocumentId: documentId,
          })
        : await updateDraftSourceToLatestAction({
            signingId,
            signingDocumentId: documentId,
          });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice(
        choice === "KEEP_CURRENT"
          ? "Kept the current prepared document. The Packet Form change was acknowledged."
          : "Updated this document to the latest Packet Form content.",
      );
      await reload();
    }
    setBusyDocumentId(null);
  }

  async function confirmActivation() {
    if (!pendingActivation) return;
    setActivating(true);
    setError(null);
    setNotice(null);
    const result = await activateSigningAction({
      signingId,
      mode: pendingActivation.mode,
      clientRequestId: pendingActivation.clientRequestId,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice(
        pendingActivation.mode === "REMOTE_SEND"
          ? "Signing activated. Invitation delivery has been queued for each participant."
          : "Signing activated for in-person signing. No invitation email was sent.",
      );
      setPendingActivation(null);
      await reload();
    }
    setActivating(false);
  }

  async function startHandoff(participantId: string) {
    setHandoffBusyParticipantId(participantId);
    setError(null);
    setNotice(null);
    setHandoff(null);
    const result = await startInPersonHandoffAction({
      signingId,
      signingParticipantId: participantId,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      const data = result.data as { handoffPath: string; expiresAt: string };
      setHandoff({
        participantId,
        path: data.handoffPath,
        expiresAt: data.expiresAt,
      });
      window.location.replace(data.handoffPath);
    }
    setHandoffBusyParticipantId(null);
  }

  async function runInvitationOp(
    participantId: string,
    op: "resend" | "replace" | "revoke",
  ) {
    setBusyParticipantId(participantId);
    setError(null);
    setNotice(null);
    const result =
      op === "resend"
        ? await resendParticipantInvitationAction({
            signingId,
            participantId,
          })
        : op === "replace"
          ? await replaceParticipantInvitationAction({
              signingId,
              participantId,
            })
          : await revokeParticipantInvitationAction({
              signingId,
              participantId,
            });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice(
        op === "resend"
          ? "Signing link resent to this participant."
          : op === "replace"
            ? "Signing link replaced and emailed to this participant. The previous link no longer works."
            : "Signing link revoked. This participant can no longer open the previous link.",
      );
      await reload();
    }
    setBusyParticipantId(null);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Signing…</p>;
  }

  if (!dashboard) {
    return (
      <p className="text-sm text-destructive">
        {error ?? "This Signing is not available."}
      </p>
    );
  }

  const isDraft = dashboard.signing.lifecycleState === "DRAFT";
  const isInProgress = dashboard.signing.lifecycleState === "IN_PROGRESS";
  const canManage = dashboard.signing.canManage;
  const canActivate = isDraft && canManage && dashboard.ready;
  const canStartHandoff =
    canManage &&
    isInProgress &&
    dashboard.signing.activationMode === "IN_PERSON";
  const canManageRemoteLinks =
    canManage &&
    isInProgress &&
    dashboard.signing.activationMode === "REMOTE_SEND";

  return (
    <div className="flex flex-col gap-6">
      <ListPageHeader
        title={dashboard.signing.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={isDraft ? "outline" : "info"}>
              {dashboard.signing.lifecycleState.replace(/_/g, " ")}
            </Badge>
            {dashboard.signing.activationMode ? (
              <span>
                {dashboard.signing.activationMode === "REMOTE_SEND"
                  ? "Sent for remote signing"
                  : "In-person signing"}
                {dashboard.signing.activatedAt
                  ? ` on ${new Date(
                      dashboard.signing.activatedAt,
                    ).toLocaleString()}`
                  : null}
              </span>
            ) : null}
          </span>
        }
        action={
          isDraft ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!canManage || dashboard.documents.length === 0}
                onClick={() => setPreviewOpen(true)}
              >
                Preview Signing
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canActivate}
                onClick={() =>
                  setPendingActivation({
                    mode: "IN_PERSON",
                    clientRequestId: newClientRequestId(),
                  })
                }
              >
                Begin In-Person Signing
              </Button>
              <Button
                type="button"
                disabled={!canActivate}
                onClick={() =>
                  setPendingActivation({
                    mode: "REMOTE_SEND",
                    clientRequestId: newClientRequestId(),
                  })
                }
              >
                Send
              </Button>
            </>
          ) : null
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? (
        <p className="text-sm text-muted-foreground">{notice}</p>
      ) : null}

      {isDraft && canManage ? (
        <SigningDraftPrepPanel
          signingId={signingId}
          canManage={canManage}
          sourcePacketId={dashboard.signing.sourcePacketId}
          firstDocumentId={dashboard.documents[0]?.id ?? null}
          documents={dashboard.documents.map((document) => ({
            id: document.id,
            displayName: document.displayName,
            sourceStatus: document.sourceStatus,
            selectedDraftSourceSnapshotId:
              document.selectedDraftSourceSnapshotId,
          }))}
          participants={dashboard.participants.map((participant) => ({
            id: participant.id,
            fullName: participant.fullName,
          }))}
          participantsMissingFields={dashboard.participants
            .filter((participant) => !participant.hasSignatureOrInitialsField)
            .map((participant) => ({
              id: participant.id,
              fullName: participant.fullName,
            }))}
          onChanged={reload}
          onResolveDrift={resolveDrift}
          busyDocumentId={busyDocumentId}
        />
      ) : null}

      {isDraft ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {dashboard.ready
                ? "This Signing is ready to send."
                : "This Signing is not ready to send."}
            </CardTitle>
            {dashboard.blockers.length > 0 ? (
              <CardDescription>
                Resolve the items below before Send or Begin In-Person.
              </CardDescription>
            ) : (
              <CardDescription>
                Open Preview Signing to verify documents and field placements
                before Send or Begin In-Person.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.blockers.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {dashboard.blockers.map((blocker, index) => (
                  <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
                ))}
              </ul>
            ) : null}
            {canManage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={dashboard.documents.length === 0}
                onClick={() => setPreviewOpen(true)}
              >
                Preview Signing
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isDraft ? (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {isInProgress
                ? "Documents are frozen in Revision 1. Material document changes require a new Signing after the first accepted Signature or Initial. Pre-first-mark amendment is not available in this manager yet."
                : "Documents frozen for this Signing."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents on this Signing.
              </p>
            ) : (
              dashboard.documents.map((document) => (
                <div
                  key={document.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="truncate text-sm font-medium">
                    {document.displayName}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {canManageRemoteLinks ? (
        <Card>
          <CardHeader>
            <CardTitle>In Progress — participant access</CardTitle>
            <CardDescription>
              Manage emailed signing links. Links themselves are never shown
              here. Resend uses the current link; Replace issues a new link and
              invalidates the previous one; Revoke stops access without sending
              a replacement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No participants on this Signing.
              </p>
            ) : (
              dashboard.participants.map((participant) => {
                const finished =
                  participant.participantStatus === "FINISHED" ||
                  participant.participantStatus === "DECLINED";
                const busy = busyParticipantId === participant.id;
                return (
                  <div
                    key={participant.id}
                    className="space-y-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {participant.fullName}
                      </span>
                      <Badge variant="secondary">
                        {participant.participantStatus.replace(/_/g, " ")}
                      </Badge>
                      <Badge
                        variant={
                          participant.deliveryState === "ACCEPTED"
                            ? "success"
                            : participant.deliveryState === "FAILED"
                              ? "destructive"
                              : "info"
                        }
                      >
                        {deliveryLabel(participant.deliveryState)}
                      </Badge>
                      <Badge variant="outline">
                        {participant.hasActiveInvitationLink
                          ? "Active signing link"
                          : "No active signing link"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {participant.email}
                    </p>
                    {participant.lastDeliveryFailureSafe ? (
                      <p className="text-xs text-destructive">
                        {participant.lastDeliveryFailureSafe}
                      </p>
                    ) : null}
                    {!finished ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            busy || !participant.hasActiveInvitationLink
                          }
                          onClick={() =>
                            void runInvitationOp(participant.id, "resend")
                          }
                        >
                          Resend signing link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void runInvitationOp(participant.id, "replace")
                          }
                        >
                          Replace signing link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            busy || !participant.hasActiveInvitationLink
                          }
                          onClick={() =>
                            void runInvitationOp(participant.id, "revoke")
                          }
                        >
                          Revoke signing link
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Invitation link management is unavailable after this
                        participant finishes or declines.
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashboard.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No participants have been added yet.
            </p>
          ) : (
            dashboard.participants.map((participant) => (
              <div
                key={participant.id}
                className="flex flex-col gap-1 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {participant.fullName}
                  </span>
                  {participant.optionalRole ? (
                    <Badge variant="outline">{participant.optionalRole}</Badge>
                  ) : null}
                  {participant.capacityMode === "REPRESENTATIVE" ? (
                    <Badge variant="outline">
                      Representative
                      {participant.capacityLabel
                        ? ` · ${
                            SIGNING_CAPACITY_LABEL_OPTIONS.find(
                              (option) =>
                                option.value === participant.capacityLabel,
                            )?.label ?? participant.capacityLabel
                          }`
                        : null}
                      {participant.representedPartyName
                        ? ` · ${participant.representedPartyName}`
                        : null}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary">
                    {participant.participantStatus.replace(/_/g, " ")}
                  </Badge>
                  {participant.deliveryState ? (
                    <Badge
                      variant={
                        participant.deliveryState === "ACCEPTED"
                          ? "success"
                          : participant.deliveryState === "FAILED"
                            ? "destructive"
                            : "info"
                      }
                    >
                      {deliveryLabel(participant.deliveryState)}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {participant.email}
                </p>
                {isDraft && !participant.hasSignatureOrInitialsField ? (
                  <p className="text-xs text-warning-foreground">
                    Needs at least one Signature or Initials field.
                  </p>
                ) : null}
                {participant.lastDeliveryFailureSafe ? (
                  <p className="text-xs text-destructive">
                    {participant.lastDeliveryFailureSafe}
                  </p>
                ) : null}
                {canStartHandoff &&
                participant.participantStatus !== "FINISHED" &&
                participant.participantStatus !== "DECLINED" ? (
                  <div className="mt-1 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={handoffBusyParticipantId === participant.id}
                      onClick={() => void startHandoff(participant.id)}
                    >
                      {handoffBusyParticipantId === participant.id
                        ? "Preparing…"
                        : "Hand device to this participant"}
                    </Button>
                    {handoff?.participantId === participant.id ? (
                      <p className="text-xs text-muted-foreground">
                        <a
                          className="text-primary underline-offset-4 hover:underline"
                          href={handoff.path}
                        >
                          Open {participant.fullName}&rsquo;s signing session
                        </a>
                        {" · expires "}
                        {new Date(handoff.expiresAt).toLocaleTimeString()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <SigningCompletedOpsPanel
        signingId={signingId}
        lifecycleState={dashboard.signing.lifecycleState}
        finalizationCondition={dashboard.signing.finalizationCondition}
      />

      <SigningPreviewDialog
        open={previewOpen}
        signingId={signingId}
        onClose={() => setPreviewOpen(false)}
      />

      <ConfirmDialog
        open={pendingActivation !== null}
        title={
          pendingActivation?.mode === "IN_PERSON"
            ? "Begin in-person signing?"
            : "Send this Signing?"
        }
        message={
          pendingActivation?.mode === "IN_PERSON"
            ? "This freezes all the documents and starts in-person signing. No invitation email is sent."
            : "This freezes all the documents and emails each participant a signing link."
        }
        confirmLabel={
          pendingActivation?.mode === "IN_PERSON"
            ? "Begin In-Person Signing"
            : "Send"
        }
        confirmingLabel="Activating…"
        isConfirming={activating}
        onConfirm={() => void confirmActivation()}
        onCancel={() => {
          if (!activating) setPendingActivation(null);
        }}
      />
    </div>
  );
}
