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
import { Textarea } from "@/components/ui/textarea";
import type { CeremonyFocusRequest } from "@/components/sign/ceremony-document-viewer";
import {
  acceptConsentAction,
  adoptCeremonyMarkAction,
  ceremonyHeartbeatAction,
  declineCeremonyAction,
  exitCeremonyAction,
  finishCeremonyAction,
  getCeremonyOverviewAction,
  noteCeremonyReviewActivityAction,
  placeCeremonyFieldAction,
  removeCeremonyPlacementAction,
  replaceCeremonyPlacementAction,
} from "@/lib/signing/ceremony-actions";
import type { CeremonyOverview } from "@/lib/signing/ceremony-context";
import {
  isParticipantActionableField,
  linkedDateSignedBySignatureField,
  nextIncompleteCeremonyField,
  orderCeremonyFields,
  type CeremonyActionableField,
} from "@/lib/signing/ceremony-field-view";
import { SIGNING_PRESENCE_HEARTBEAT_SECONDS } from "@/lib/signing/presence";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useTransition } from "react";

/** pdf.js is browser-only; keep it out of the server-rendered graph. */
const CeremonyDocumentViewer = dynamic(
  () => import("@/components/sign/ceremony-document-viewer"),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading documents…</p>
    ),
  },
);

/**
 * Focused participant ceremony shell.
 *
 * Deliberately not the agent workspace: no navigation, no other participants'
 * activity, no Signing management. Every meaningful action is a server action —
 * nothing important exists only in this component's state, so a timeout or a
 * superseded session never loses confirmed work.
 *
 * The participant reads the exact prepared PDFs and acts on their own targets
 * drawn on the document. Typed adoption is the keyboard-accessible path
 * implemented here; the server also accepts a drawn representation for a later
 * drawing surface.
 */
export function CeremonyShell({
  initialOverview,
}: {
  initialOverview: CeremonyOverview;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [typedInitials, setTypedInitials] = useState(
    initialOverview.suggestedTypedInitials,
  );
  const [initialsPrefilled, setInitialsPrefilled] = useState(
    Boolean(initialOverview.suggestedTypedInitials),
  );
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [currentDocumentId, setCurrentDocumentId] = useState(
    () =>
      nextIncompleteCeremonyField(initialOverview.fields, initialOverview.documents)
        ?.revisionDocumentId ??
      initialOverview.documents[0]?.revisionDocumentId ??
      "",
  );
  const [focusRequest, setFocusRequest] = useState<CeremonyFocusRequest | null>(null);
  const finished = overview.participantStatus === "FINISHED";

  const refresh = useCallback(async () => {
    const result = await getCeremonyOverviewAction();
    if (result.ok) {
      const next = result.data as CeremonyOverview;
      setOverview(next);
      if (!initialsPrefilled && !next.marks.initials) {
        setTypedInitials(next.suggestedTypedInitials);
        setInitialsPrefilled(true);
      }
      return true;
    }
    setSessionEnded(result.error);
    return false;
  }, [initialsPrefilled]);

  // Presence heartbeat. This renews the lease only; the 60-minute inactivity
  // deadline still depends on meaningful activity.
  useEffect(() => {
    if (finished || sessionEnded) return;
    const interval = setInterval(
      () => {
        void ceremonyHeartbeatAction().then((result) => {
          if (!result.ok) setSessionEnded(result.error);
        });
      },
      SIGNING_PRESENCE_HEARTBEAT_SECONDS * 1000,
    );
    return () => clearInterval(interval);
  }, [finished, sessionEnded]);

  function run(
    action: () => Promise<
      { ok: true; data?: unknown } | { ok: false; code: string; error: string }
    >,
    options?: { onSuccess?: (data: unknown) => void; successNotice?: string },
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        if (
          result.code === "SESSION_EXPIRED" ||
          result.code === "SESSION_SUPERSEDED" ||
          result.code === "CEREMONY_FORBIDDEN"
        ) {
          setSessionEnded(result.error);
          return;
        }
        setError(result.error);
        await refresh();
        return;
      }
      options?.onSuccess?.(result.data);
      if (options?.successNotice) setNotice(options.successNotice);
      await refresh();
    });
  }

  /** Document navigation: free at any time, and counts as review activity. */
  function goToField(field: CeremonyActionableField) {
    setCurrentDocumentId(field.revisionDocumentId);
    setFocusRequest({ fieldId: field.fieldId, nonce: Date.now() });
    void noteCeremonyReviewActivityAction();
  }

  function placeField(field: CeremonyActionableField) {
    const clientRequestId = `${field.fieldId}:${field.placementId ?? "new"}`;
    run(
      () =>
        placeCeremonyFieldAction({
          signingFieldId: field.fieldId,
          clientRequestId: `accept:${clientRequestId}:${Date.now()}`,
        }),
      {
        onSuccess: () => {
          const next = nextIncompleteCeremonyField(
            overview.fields.map((candidate) =>
              candidate.fieldId === field.fieldId
                ? { ...candidate, placementId: candidate.placementId ?? "accepted" }
                : candidate,
            ),
            overview.documents,
            field.fieldId,
          );
          if (next) goToField(next);
        },
      },
    );
  }

  if (sessionEnded) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">
            This signing session is no longer active
          </CardTitle>
          <CardDescription>{sessionEnded}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Everything you already completed was saved. Reopen your Signing link
            (or ask your agent to hand the device back) and confirm your
            identity again to continue.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (finished) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">You finished signing</CardTitle>
          <CardDescription>
            Your signature and initials were recorded for {overview.signingTitle}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Nothing else is needed from you. Your agent will send the completed
            documents when every participant has finished.
          </p>
          {overview.inPersonCeremony ? (
            <Button
              type="button"
              className="w-full"
              onClick={() => window.location.replace("/sign/return-to-agent")}
            >
              Hand device back to your agent
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const consentSatisfied = overview.consent.satisfied;
  const disclosure = overview.consent.currentDisclosure;
  const actionableFields = orderCeremonyFields(
    overview.fields.filter(isParticipantActionableField),
    overview.documents,
  );
  const dateSignedBySignature = linkedDateSignedBySignatureField(overview.fields);
  const needsSignature =
    actionableFields.some((field) => field.fieldType === "SIGNATURE") &&
    !overview.marks.signature;
  const needsInitials =
    actionableFields.some((field) => field.fieldType === "INITIALS") &&
    !overview.marks.initials;
  const expectedSignatureText =
    overview.expectedTypedSignatureText || overview.displayedName;
  const nextField = nextIncompleteCeremonyField(
    overview.fields,
    overview.documents,
    focusRequest?.fieldId ?? null,
  );
  const documentNameById = new Map(
    overview.documents.map((document) => [
      document.revisionDocumentId,
      document.displayName,
    ]),
  );

  const finishCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Finish</CardTitle>
        <CardDescription>
          Finish when you are done. You can change your marks until you
          finish.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          className="w-full"
          disabled={pending || !overview.canFinish || !consentSatisfied}
          onClick={() => run(() => finishCeremonyAction())}
        >
          Finish signing
        </Button>

        {declineOpen ? (
          <div className="space-y-3 rounded-md border border-destructive/40 p-3">
            <p className="text-sm text-foreground">
              Declining ends this Signing for everyone. Your agent will be
              notified.
            </p>
            <div className="space-y-2">
              <Label htmlFor="decline-reason">Reason (optional)</Label>
              <Textarea
                id="decline-reason"
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    declineCeremonyAction({
                      confirmed: true,
                      reason: declineReason,
                    }),
                  )
                }
              >
                Confirm decline
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDeclineOpen(false)}
              >
                Keep signing
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => setDeclineOpen(true)}
          >
            Decline to sign
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => run(() => exitCeremonyAction())}
        >
          Exit signing
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Harbaugh Forms
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {overview.signingTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signing as {overview.displayedName}
        </p>
        {overview.capacityMode === "REPRESENTATIVE" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Representing {overview.representedPartyName}. Execution wording is
            prepared by the sending agent; Harbaugh Forms does not verify legal
            authority.
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {!consentSatisfied ? (
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{disclosure.title}</CardTitle>
              <CardDescription>
                {overview.consent.reason === "DISCLOSURE_CHANGED"
                  ? "This disclosure was updated since you last accepted it. Please review it again."
                  : "Please review this disclosure before signing electronically."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!disclosure.isProductionReady ? (
                <Badge variant="secondary">Development disclosure copy</Badge>
              ) : null}
              <div className="max-h-72 overflow-y-auto rounded-md border border-input bg-card p-3 text-sm whitespace-pre-wrap">
                {disclosure.bodyText}
              </div>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      acceptConsentAction({
                        disclosureVersionId: disclosure.id,
                      }),
                    { successNotice: "Disclosure accepted." },
                  )
                }
              >
                I agree to use electronic records and signatures
              </Button>
            </CardContent>
          </Card>
          {finishCard}
        </div>
      ) : (
        <>
          {needsSignature || needsInitials ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adopt your marks</CardTitle>
                <CardDescription>
                  {overview.capacityMode === "REPRESENTATIVE"
                    ? "Your signature is the execution wording prepared by your agent. Capacity cannot be changed here. Your signature and initials are adopted separately."
                    : "Your signature is your name exactly as it appears on this Signing. Your signature and initials are adopted separately."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                {needsSignature ? (
                  <div className="space-y-2">
                    <Label htmlFor="typed-signature">Your signature</Label>
                    <Input
                      id="typed-signature"
                      value={expectedSignatureText}
                      readOnly
                      aria-readonly="true"
                      aria-describedby="typed-signature-help"
                      className="h-12 cursor-default bg-muted/40 text-2xl focus-visible:ring-2"
                      style={{ fontFamily: "HarbaughCaveat, cursive" }}
                    />
                    <p
                      id="typed-signature-help"
                      className="text-xs text-muted-foreground"
                    >
                      This is set by your Signing and cannot be edited. If it
                      is wrong, exit and contact your agent before signing.
                    </p>
                    <Button
                      type="button"
                      disabled={pending || !expectedSignatureText.trim()}
                      onClick={() =>
                        run(
                          () =>
                            adoptCeremonyMarkAction({
                              markKind: "SIGNATURE",
                              representationType: "TYPED",
                              typedText: expectedSignatureText,
                            }),
                          { successNotice: "Signature adopted." },
                        )
                      }
                    >
                      Adopt signature
                    </Button>
                  </div>
                ) : null}

                {needsInitials ? (
                  <div className="space-y-2">
                    <Label htmlFor="typed-initials">Typed initials</Label>
                    <Input
                      id="typed-initials"
                      value={typedInitials}
                      autoComplete="off"
                      onChange={(event) => {
                        setInitialsPrefilled(true);
                        setTypedInitials(event.target.value);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Suggested from your name — you may edit before first use. Not
                      a legal verification.
                    </p>
                    <Button
                      type="button"
                      disabled={pending || !typedInitials.trim()}
                      onClick={() =>
                        run(
                          () =>
                            adoptCeremonyMarkAction({
                              markKind: "INITIALS",
                              representationType: "TYPED",
                              typedText: typedInitials,
                            }),
                          { successNotice: "Initials adopted." },
                        )
                      }
                    >
                      Adopt initials
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">Your documents</CardTitle>
                <CardDescription>
                  Read every page and document. Your signature and initials
                  spots are highlighted on the page; select one to apply your
                  adopted mark.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CeremonyDocumentViewer
                  documents={overview.documents}
                  fields={overview.fields}
                  currentDocumentId={currentDocumentId}
                  onSelectDocument={setCurrentDocumentId}
                  focusRequest={focusRequest}
                  signatureText={overview.marks.signature?.typedText ?? null}
                  initialsText={overview.marks.initials?.typedText ?? null}
                  canSign={Boolean(overview.marks.signature)}
                  canInitial={Boolean(overview.marks.initials)}
                  pending={pending}
                  onPlace={placeField}
                  onReviewActivity={() => {
                    void noteCeremonyReviewActivityAction();
                  }}
                />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your fields</CardTitle>
                  <CardDescription aria-live="polite">
                    {overview.requiredRemaining === 0
                      ? "Every required field is complete."
                      : overview.requiredRemaining === 1
                        ? "One required field still needs you."
                        : `${overview.requiredRemaining} required fields still need you.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {nextField ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => goToField(nextField)}
                    >
                      Go to next field
                    </Button>
                  ) : null}
                  {actionableFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No fields are assigned to you in this Signing.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {actionableFields.map((field) => {
                        const clientRequestId = `${field.fieldId}:${
                          field.placementId ?? "new"
                        }`;
                        return (
                          <li
                            key={field.fieldId}
                            data-ceremony-field-row={field.fieldId}
                            className="space-y-2 rounded-md border border-input p-3"
                          >
                            <div className="text-sm">
                              <span className="font-medium text-foreground">
                                {field.fieldType === "SIGNATURE"
                                  ? "Signature"
                                  : "Initials"}
                              </span>
                              <span className="text-muted-foreground">
                                {" "}
                                · {documentNameById.get(field.revisionDocumentId)} ·
                                page {field.pageNumber}
                                {field.isRequired ? " · required" : " · optional"}
                              </span>
                              {field.placementId ? (
                                <span className="block text-xs text-muted-foreground">
                                  Applied
                                  {dateSignedBySignature.has(field.fieldId)
                                    ? ` · dated ${dateSignedBySignature.get(field.fieldId)}`
                                    : ""}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Show ${field.fieldType === "SIGNATURE" ? "signature" : "initials"} field on page ${field.pageNumber}`}
                                onClick={() => goToField(field)}
                              >
                                Show on page
                              </Button>
                              {field.placementId ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={pending}
                                    onClick={() =>
                                      run(() =>
                                        replaceCeremonyPlacementAction({
                                          signingFieldId: field.fieldId,
                                          clientRequestId: `replace:${clientRequestId}:${Date.now()}`,
                                        }),
                                      )
                                    }
                                  >
                                    Replace
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={pending}
                                    onClick={() =>
                                      run(() =>
                                        removeCeremonyPlacementAction({
                                          signingFieldId: field.fieldId,
                                          clientRequestId: `remove:${clientRequestId}:${Date.now()}`,
                                        }),
                                      )
                                    }
                                  >
                                    Remove
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
              {finishCard}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
