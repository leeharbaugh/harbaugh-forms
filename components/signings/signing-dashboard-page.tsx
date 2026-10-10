"use client";

import { ListPageHeader } from "@/components/list-page-header";
import { SigningCompletedOpsPanel } from "@/components/signings/signing-completed-ops-panel";
import { SigningCopyRecipientsPanel } from "@/components/signings/signing-copy-recipients-panel";
import { SigningDraftPrepPanel } from "@/components/signings/signing-draft-prep-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { participantRoleDisplay } from "@/lib/signing/participant-roles";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelSigningAction, renameSigningAction } from "@/lib/signing/actions";
import { SIGNING_TITLE_MAX_LENGTH } from "@/lib/signing/types";
import type { SigningDashboard } from "@/lib/signing/dashboard";
import { invitationStatusLabel } from "@/lib/signing/participant-access-status";
import {
  activateSigningAction,
  getSigningDashboardAction,
  keepCurrentDraftSourceAction,
  getParticipantSigningLinkForQaAction,
  replaceParticipantInvitationAction,
  resendParticipantInvitationAction,
  revokeParticipantInvitationAction,
  type SigningStage4ActionResult,
  updateDraftSourceToLatestAction,
} from "@/lib/signing/stage4-actions";
import { useHistoryRestoreRefresh } from "@/components/signings/use-history-restore-refresh";
import {
  applyPreparationReadiness as mergePreparationReadiness,
  participantMissingSignerField,
} from "@/lib/signing/readiness-view";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

/** pdf.js needs browser APIs (DOMMatrix, canvas, workers): never load it on the server. */
const SigningPreviewDialog = dynamic(
  () =>
    import("@/components/signings/signing-preview-dialog").then(
      (module) => module.SigningPreviewDialog,
    ),
  { ssr: false },
);

type ActivationMode = "REMOTE_SEND" | "IN_PERSON";

/** Adopt server preparation readiness; document-source blockers are kept. */
function withPreparationReadiness(
  dashboard: SigningDashboard,
  preparationBlockers: SigningDashboard["blockers"],
): SigningDashboard {
  if (dashboard.signing.lifecycleState !== "DRAFT") return dashboard;
  const { ready, blockers } = mergePreparationReadiness(
    dashboard.blockers,
    preparationBlockers,
  );
  return {
    ...dashboard,
    ready,
    blockers,
    participants: dashboard.participants.map((participant) => ({
      ...participant,
      hasSignatureOrInitialsField: !participantMissingSignerField(
        blockers,
        participant.id,
      ),
    })),
  };
}

function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatWhen(value: string | null): string | null {
  return value ? new Date(value).toLocaleString() : null;
}

type LinkOp = "resend" | "replace" | "revoke";

const LINK_OP_CONFIRM: Record<
  Exclude<LinkOp, "resend">,
  { title: string; message: string; confirmLabel: string }
> = {
  replace: {
    title: "Replace signing link?",
    message:
      "The participant\u2019s current link will stop working and a new signing link will be sent.",
    confirmLabel: "Replace signing link",
  },
  revoke: {
    title: "Revoke signing link?",
    message:
      "The participant\u2019s current link will stop working. No new link is sent.",
    confirmLabel: "Revoke signing link",
  },
};

export function SigningDashboardPage({
  signingId,
  initial,
}: {
  signingId: string;
  /** Rendered by the page request (authorize → Draft sync → load). */
  initial: SigningStage4ActionResult;
}) {
  const [served, setServed] = useState(initial);
  const [dashboard, setDashboard] = useState<SigningDashboard | null>(
    initial.ok ? (initial.data as SigningDashboard) : null,
  );
  const [error, setError] = useState<string | null>(
    initial.ok ? null : initial.error,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [busyParticipantId, setBusyParticipantId] = useState<string | null>(
    null,
  );
  const [pendingLinkOp, setPendingLinkOp] = useState<{
    participantId: string;
    op: Exclude<LinkOp, "resend">;
  } | null>(null);
  const [linkOpStatus, setLinkOpStatus] = useState<{
    participantId: string;
    tone: "success" | "error";
    lines: string[];
  } | null>(null);
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
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceMounted, setWorkspaceMounted] = useState(false);
  const [workspaceDocumentId, setWorkspaceDocumentId] = useState<string | null>(
    null,
  );

  /** Latest preparation readiness from Prepare Documents, newest last. */
  const preparationRef = useRef<{
    seq: number;
    blockers: SigningDashboard["blockers"];
  }>({ seq: 0, blockers: [] });

  const reload = useCallback(async () => {
    const seqAtStart = preparationRef.current.seq;
    const result = await getSigningDashboardAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const loaded = result.data as SigningDashboard;
    // A placement saved while this load ran is newer than its readiness.
    setDashboard(
      preparationRef.current.seq > seqAtStart
        ? withPreparationReadiness(loaded, preparationRef.current.blockers)
        : loaded,
    );
  }, [signingId]);

  const applyPreparationReadiness = useCallback(
    (blockers: SigningDashboard["blockers"]) => {
      preparationRef.current = {
        seq: preparationRef.current.seq + 1,
        blockers,
      };
      setDashboard((previous) =>
        previous ? withPreparationReadiness(previous, blockers) : previous,
      );
    },
    [],
  );

  // A push navigation back to this preserved route re-renders the page on the
  // server; adopt that payload instead of the state kept from the last visit.
  if (served !== initial) {
    setServed(initial);
    if (initial.ok) {
      setDashboard(initial.data as SigningDashboard);
      setError(null);
    } else {
      setError(initial.error);
    }
  }

  const restoring = useHistoryRestoreRefresh(reload);

  async function saveRename() {
    if (renameValue == null) return;
    const title = renameValue.trim();
    if (!title) {
      setRenameError("A Signing name is required.");
      return;
    }
    setRenaming(true);
    setRenameError(null);
    setNotice(null);
    const result = await renameSigningAction({ signingId, title });
    setRenaming(false);
    if (!result.ok) {
      setRenameError(result.error);
      return;
    }
    setDashboard((previous) =>
      previous
        ? { ...previous, signing: { ...previous.signing, title: result.signing.title } }
        : previous,
    );
    setRenameValue(null);
    setNotice("Signing renamed.");
  }

  async function confirmCancelSigning() {
    setCancelling(true);
    setError(null);
    setNotice(null);
    const result = await cancelSigningAction({ signingId });
    setCancelling(false);
    setConfirmingCancel(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Signing cancelled. Create a new Signing to send corrected documents.");
    await reload();
  }

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

  async function runInvitationOp(participantId: string, op: LinkOp) {
    setBusyParticipantId(participantId);
    setError(null);
    setNotice(null);
    setLinkOpStatus(null);
    const input = { signingId, participantId };
    const result =
      op === "resend"
        ? await resendParticipantInvitationAction(input)
        : op === "replace"
          ? await replaceParticipantInvitationAction(input)
          : await revokeParticipantInvitationAction(input);
    if (!result.ok) {
      setLinkOpStatus({ participantId, tone: "error", lines: [result.error] });
    } else {
      const data = (result.data ?? {}) as {
        deliveryState?: string | null;
        emailSandboxed?: boolean;
      };
      const lines =
        op === "replace"
          ? [
              "Signing link replaced.",
              data.deliveryState === "FAILED"
                ? "The previous link no longer works. The new link could not be emailed; use Resend signing link to try again."
                : "The previous link no longer works. A new link has been queued for delivery.",
            ]
          : op === "resend"
            ? [
                "Signing link resent.",
                data.deliveryState === "FAILED"
                  ? "The current link still works, but the email could not be sent."
                  : "The current link still works and has been queued for delivery again.",
              ]
            : [
                "Signing link revoked.",
                "The previous link no longer works. No new link was sent.",
              ];
      if (op !== "revoke" && data.emailSandboxed) {
        lines.push("Email delivery is sandboxed in development.");
      }
      setLinkOpStatus({ participantId, tone: "success", lines });
      await reload();
    }
    setBusyParticipantId(null);
  }

  /** Development QA: the URL is held only in this call, never in state or markup. */
  async function requestSigningLinkForQa(participantId: string, action: "copy" | "open") {
    setBusyParticipantId(participantId);
    setError(null);
    setNotice(null);
    setLinkOpStatus(null);
    const result = await getParticipantSigningLinkForQaAction({ signingId, participantId });
    if (!result.ok) {
      setLinkOpStatus({ participantId, tone: "error", lines: [result.error] });
    } else {
      const { inviteUrl } = result.data as { inviteUrl: string };
      if (action === "open") {
        window.open(inviteUrl, "_blank", "noopener,noreferrer");
        setLinkOpStatus({ participantId, tone: "success", lines: ["Signing link opened in a new tab."] });
      } else {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          setLinkOpStatus({ participantId, tone: "success", lines: ["Signing link copied."] });
        } catch {
          setLinkOpStatus({
            participantId,
            tone: "error",
            lines: ["Could not copy the signing link. Allow clipboard access and try again, or use Open signing link."],
          });
        }
      }
    }
    setBusyParticipantId(null);
  }

  async function confirmLinkOp() {
    if (!pendingLinkOp) return;
    const { participantId, op } = pendingLinkOp;
    await runInvitationOp(participantId, op);
    setPendingLinkOp(null);
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
          <>
          {dashboard.canRename && renameValue == null ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRenameError(null);
                setRenameValue(dashboard.signing.title);
              }}
            >
              Rename
            </Button>
          ) : null}
          {isDraft ? (
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
          ) : isInProgress && canManage ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingCancel(true)}
            >
              Cancel Signing
            </Button>
          ) : null}
          </>
        }
      />

      {renameValue != null ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveRename();
          }}
        >
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <Label htmlFor="signing-rename">Signing name</Label>
            <Input
              id="signing-rename"
              value={renameValue}
              maxLength={SIGNING_TITLE_MAX_LENGTH}
              autoFocus
              disabled={renaming}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !renaming) setRenameValue(null);
              }}
            />
          </div>
          <Button type="submit" disabled={renaming || renameValue.trim().length === 0}>
            {renaming ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={renaming}
            onClick={() => setRenameValue(null)}
          >
            Cancel
          </Button>
          {renameError ? (
            <p className="w-full text-sm text-destructive">{renameError}</p>
          ) : null}
        </form>
      ) : null}

      {restoring ? (
        <p className="text-sm text-muted-foreground" role="status">
          Updating to the current Signing…
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? (
        <p className="text-sm text-muted-foreground">{notice}</p>
      ) : null}

      {isDraft && canManage ? (
        <SigningDraftPrepPanel
          signingId={signingId}
          canManage={canManage}
          sourcePacketId={dashboard.signing.sourcePacketId}
          prep={dashboard.draftPrep}
          documents={dashboard.documents.map((document) => ({
            id: document.id,
            displayName: document.displayName,
            sourceStatus: document.sourceStatus,
            selectedDraftSourceSnapshotId:
              document.selectedDraftSourceSnapshotId,
            sourceKind: document.sourceKind,
          }))}
          participants={dashboard.participants}
          autoAddedFromPacket={dashboard.participantSync.addedFromPacket}
          onChanged={reload}
          onResolveDrift={resolveDrift}
          busyDocumentId={busyDocumentId}
          onPrepareDocument={(documentId) => {
            setWorkspaceDocumentId(documentId);
            setWorkspaceOpen(true);
            setWorkspaceMounted(true);
          }}
        />
      ) : null}

      {isDraft && canManage ? (
        <SigningCopyRecipientsPanel
          signingId={signingId}
          lifecycleState={dashboard.signing.lifecycleState}
          canManage={canManage}
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
                Review documents and field placements in Prepare Documents
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
              {dashboard.participantLinkQaHelper
                ? " Email delivery is sandboxed in development. Use Copy signing link to test the participant ceremony."
                : dashboard.emailSandboxed
                  ? " Email delivery is sandboxed in development: invitations are accepted but not sent."
                  : null}
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
                          participant.access.linkState === "ACTIVE"
                            ? "success"
                            : participant.access.linkState === "REVOKED"
                              ? "destructive"
                              : "outline"
                        }
                        data-testid="participant-link-state"
                      >
                        {participant.access.linkState === "ACTIVE"
                          ? "Active link"
                          : participant.access.linkState === "REVOKED"
                            ? "Revoked"
                            : "No active link"}
                      </Badge>
                      <Badge
                        variant={
                          participant.access.lastInvitationState === "FAILED"
                            ? "destructive"
                            : "info"
                        }
                      >
                        {invitationStatusLabel(participant.access)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {participant.email}
                    </p>
                    <ul
                      className="space-y-0.5 text-xs text-muted-foreground"
                      data-testid="participant-link-history"
                    >
                      {participant.access.linkIssuedAt ? (
                        <li>Current link issued {formatWhen(participant.access.linkIssuedAt)}</li>
                      ) : null}
                      {participant.access.lastReplacedAt ? (
                        <li>Link replaced {formatWhen(participant.access.lastReplacedAt)}</li>
                      ) : null}
                      {participant.access.revokedAt ? (
                        <li>Link revoked {formatWhen(participant.access.revokedAt)}</li>
                      ) : null}
                      {participant.access.lastInvitationQueuedAt ? (
                        <li>Last invitation queued {formatWhen(participant.access.lastInvitationQueuedAt)}</li>
                      ) : null}
                      {participant.access.lastAttemptAt ? (
                        <li>
                          Last send attempt {formatWhen(participant.access.lastAttemptAt)}
                          {participant.access.lastAttemptOutcome === "FAILED" ? " (failed)" : ""}
                        </li>
                      ) : null}
                    </ul>
                    {linkOpStatus?.participantId === participant.id ? (
                      <div
                        role="status"
                        aria-live="polite"
                        data-testid="participant-link-status"
                        className={
                          linkOpStatus.tone === "error"
                            ? "rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
                            : "rounded-md border border-emerald-600/30 bg-emerald-50 p-2 text-sm text-emerald-900"
                        }
                      >
                        {linkOpStatus.lines.map((line, index) => (
                          <p key={index} className={index === 0 ? "font-medium" : undefined}>
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : null}
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
                            setPendingLinkOp({ participantId: participant.id, op: "replace" })
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
                            setPendingLinkOp({ participantId: participant.id, op: "revoke" })
                          }
                        >
                          Revoke signing link
                        </Button>
                        {dashboard.participantLinkQaHelper &&
                        participant.hasActiveInvitationLink ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void requestSigningLinkForQa(participant.id, "copy")}
                            >
                              Copy signing link
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void requestSigningLinkForQa(participant.id, "open")}
                            >
                              Open signing link
                            </Button>
                          </>
                        ) : null}
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

      {isInProgress && canManage ? (
        <SigningCopyRecipientsPanel
          signingId={signingId}
          lifecycleState={dashboard.signing.lifecycleState}
          canManage={canManage}
        />
      ) : null}

      {isDraft && canManage ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
            {isInProgress ? (
              <CardDescription data-testid="participant-identity-locked">
                Participant names and emails are locked once a Signing is sent
                or started. If a name or email is wrong, cancel this Signing
                and create a new one with the corrected details.
              </CardDescription>
            ) : null}
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
                    {participantRoleDisplay(participant.roleCode, participant.optionalRole) ? (
                      <Badge variant="outline">
                        {participantRoleDisplay(participant.roleCode, participant.optionalRole)}
                      </Badge>
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
                    {participant.access.lastInvitationState ? (
                      <Badge
                        variant={
                          participant.access.lastInvitationState === "FAILED"
                            ? "destructive"
                            : "info"
                        }
                      >
                        {invitationStatusLabel(participant.access)}
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
      )}

      {isDraft ? null : (
        <SigningCompletedOpsPanel
          signingId={signingId}
          lifecycleState={dashboard.signing.lifecycleState}
          finalizationCondition={dashboard.signing.finalizationCondition}
        />
      )}

      {workspaceMounted ? (
        <SigningPreviewDialog
          open={workspaceOpen}
          signingId={signingId}
          mode="prepare"
          initialDocumentId={workspaceDocumentId}
          onClose={() => {
            setWorkspaceOpen(false);
            setWorkspaceDocumentId(null);
          }}
          onChanged={reload}
          readiness={{ ready: dashboard.ready, blockers: dashboard.blockers }}
          onPreparationReadiness={applyPreparationReadiness}
        />
      ) : null}

      <ConfirmDialog
        open={pendingLinkOp !== null}
        title={pendingLinkOp ? LINK_OP_CONFIRM[pendingLinkOp.op].title : ""}
        message={pendingLinkOp ? LINK_OP_CONFIRM[pendingLinkOp.op].message : ""}
        confirmLabel={
          pendingLinkOp ? LINK_OP_CONFIRM[pendingLinkOp.op].confirmLabel : "Confirm"
        }
        confirmingLabel="Working…"
        variant="destructive"
        isConfirming={pendingLinkOp !== null && busyParticipantId === pendingLinkOp.participantId}
        onConfirm={() => void confirmLinkOp()}
        onCancel={() => {
          if (!busyParticipantId) setPendingLinkOp(null);
        }}
      />

      <ConfirmDialog
        open={confirmingCancel}
        title="Cancel this Signing?"
        message="Signing links stop working and no one can sign. This cannot be undone. To fix a participant's name or email, create a new Signing afterwards."
        confirmLabel="Cancel Signing"
        confirmingLabel="Cancelling…"
        cancelLabel="Keep Signing"
        variant="destructive"
        isConfirming={cancelling}
        onConfirm={() => void confirmCancelSigning()}
        onCancel={() => {
          if (!cancelling) setConfirmingCancel(false);
        }}
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
        confirmingLabel={
          pendingActivation?.mode === "IN_PERSON" ? "Activating…" : "Sending…"
        }
        isConfirming={activating}
        onConfirm={() => void confirmActivation()}
        onCancel={() => {
          if (!activating) setPendingActivation(null);
        }}
      />
    </div>
  );
}
