"use client";

import { ListPageHeader } from "@/components/list-page-header";
import { SigningCompletedOpsPanel } from "@/components/signings/signing-completed-ops-panel";
import { SigningDraftPrepPanel } from "@/components/signings/signing-draft-prep-panel";
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
import {
  NATIVE_SIGNING_REPRESENTATIVE_NOTICE,
  NATIVE_SIGNING_TYPED_ONLY_NOTICE,
  SIGNING_CAPACITY_LABEL_OPTIONS,
} from "@/lib/signing/capacity-notices";
import type { SigningDashboard } from "@/lib/signing/dashboard";
import type { DocumentSourceStatus } from "@/lib/signing/source-drift";
import {
  activateSigningAction,
  getSigningDashboardAction,
  keepCurrentDraftSourceAction,
  updateDraftSourceToLatestAction,
} from "@/lib/signing/stage4-actions";
import { useCallback, useEffect, useState } from "react";

type ActivationMode = "REMOTE_SEND" | "IN_PERSON";

const SOURCE_STATUS_LABEL: Record<DocumentSourceStatus, string> = {
  CURRENT: "Current",
  SOURCE_CHANGED: "Source changed",
  SOURCE_UNAVAILABLE: "Source unavailable",
};

const SOURCE_STATUS_VARIANT: Record<
  DocumentSourceStatus,
  "success" | "warning" | "destructive"
> = {
  CURRENT: "success",
  SOURCE_CHANGED: "warning",
  SOURCE_UNAVAILABLE: "destructive",
};

function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SigningDashboardPage({ signingId }: { signingId: string }) {
  const [dashboard, setDashboard] = useState<SigningDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
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

  /**
   * Hand the shared device to a participant for in-person signing.
   *
   * The returned path carries a single-use handoff token, so it is shown once,
   * here, and is consumed when the participant affirms their identity.
   */
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
  const canManage = dashboard.signing.canManage;
  const canActivate = isDraft && canManage && dashboard.ready;
  // Supervised handoff is an in-person concern only, and only once the package
  // is actionable.
  const canStartHandoff =
    canManage &&
    dashboard.signing.lifecycleState === "IN_PROGRESS" &&
    dashboard.signing.activationMode === "IN_PERSON";

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

      {isDraft ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <p>{NATIVE_SIGNING_REPRESENTATIVE_NOTICE}</p>
          <p>{NATIVE_SIGNING_TYPED_ONLY_NOTICE}</p>
        </div>
      ) : null}

      {isDraft && canManage ? (
        <SigningDraftPrepPanel
          signingId={signingId}
          canManage={canManage}
          firstDocumentId={dashboard.documents[0]?.id ?? null}
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
        />
      ) : null}

      {isDraft ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Readiness
              <Badge variant={dashboard.ready ? "success" : "warning"}>
                {dashboard.ready ? "Ready" : "Not ready"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Readiness is calculated from the current Draft. It is not a saved
              status.
            </CardDescription>
          </CardHeader>
          {dashboard.blockers.length > 0 ? (
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {dashboard.blockers.map((blocker, index) => (
                  <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
                ))}
              </ul>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Each document is prepared from its own captured source. Editing the
            Packet Form later never changes a prepared document on its own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashboard.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents have been added yet.
            </p>
          ) : (
            dashboard.documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">
                    {document.displayName}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={SOURCE_STATUS_VARIANT[document.sourceStatus]}
                    >
                      {SOURCE_STATUS_LABEL[document.sourceStatus]}
                    </Badge>
                    {document.selectedDraftSourceSnapshotId ? null : (
                      <span className="text-xs text-muted-foreground">
                        No prepared source captured
                      </span>
                    )}
                  </div>
                </div>
                {isDraft &&
                canManage &&
                document.sourceStatus === "SOURCE_CHANGED" ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyDocumentId === document.id}
                      onClick={() => void resolveDrift(document.id, "KEEP_CURRENT")}
                    >
                      Keep Current
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyDocumentId === document.id}
                      onClick={() =>
                        void resolveDrift(document.id, "UPDATE_TO_LATEST")
                      }
                    >
                      Update to Latest
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
                      Invitation {participant.deliveryState.toLowerCase()}
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

      <ConfirmDialog
        open={pendingActivation !== null}
        title={
          pendingActivation?.mode === "IN_PERSON"
            ? "Begin in-person signing?"
            : "Send this Signing?"
        }
        message={
          pendingActivation?.mode === "IN_PERSON"
            ? `This freezes the documents exactly as prepared and starts the Signing. No invitation email is sent. ${NATIVE_SIGNING_REPRESENTATIVE_NOTICE}`
            : `This freezes the documents exactly as prepared, starts the Signing, and emails each participant a personal signing link. ${NATIVE_SIGNING_REPRESENTATIVE_NOTICE}`
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
