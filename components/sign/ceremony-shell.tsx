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
import {
  acceptConsentAction,
  adoptCeremonyMarkAction,
  ceremonyHeartbeatAction,
  declineCeremonyAction,
  finishCeremonyAction,
  getCeremonyOverviewAction,
  noteCeremonyReviewActivityAction,
  placeCeremonyFieldAction,
  removeCeremonyPlacementAction,
  replaceCeremonyPlacementAction,
} from "@/lib/signing/ceremony-actions";
import type { CeremonyOverview } from "@/lib/signing/ceremony-context";
import { SIGNING_PRESENCE_HEARTBEAT_SECONDS } from "@/lib/signing/presence";
import { useCallback, useEffect, useState, useTransition } from "react";

/**
 * Focused participant ceremony shell.
 *
 * Deliberately not the agent workspace: no navigation, no other participants'
 * activity, no Signing management. Every meaningful action is a server action —
 * nothing important exists only in this component's state, so a timeout or a
 * superseded session never loses confirmed work.
 *
 * Typed adoption is the keyboard-accessible path implemented here; the server
 * also accepts a drawn representation for a later drawing surface.
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
  const [typedSignature, setTypedSignature] = useState("");
  const [typedInitials, setTypedInitials] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [finished, setFinished] = useState(
    initialOverview.participantStatus === "FINISHED",
  );

  const refresh = useCallback(async () => {
    const result = await getCeremonyOverviewAction();
    if (result.ok) {
      setOverview(result.data as CeremonyOverview);
      return true;
    }
    setSessionEnded(result.error);
    return false;
  }, []);

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

  if (sessionEnded) {
    return (
      <Card>
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

  if (finished || overview.participantStatus === "FINISHED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">You finished signing</CardTitle>
          <CardDescription>
            Your signature and initials were recorded for {overview.signingTitle}
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nothing else is needed from you. Your agent will send the completed
            documents when every participant has finished.
          </p>
        </CardContent>
      </Card>
    );
  }

  const consentSatisfied = overview.consent.satisfied;
  const disclosure = overview.consent.currentDisclosure;
  const actionableFields = overview.fields.filter(
    (field) => field.fieldType === "SIGNATURE" || field.fieldType === "INITIALS",
  );
  const needsSignature =
    actionableFields.some((field) => field.fieldType === "SIGNATURE") &&
    !overview.marks.signature;
  const needsInitials =
    actionableFields.some((field) => field.fieldType === "INITIALS") &&
    !overview.marks.initials;

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
      ) : null}

      {consentSatisfied && (needsSignature || needsInitials) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adopt your marks</CardTitle>
            <CardDescription>
              Type your name exactly as it appears on this Signing. Your
              signature and initials are adopted separately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {needsSignature ? (
              <div className="space-y-2">
                <Label htmlFor="typed-signature">
                  Typed signature (must be {overview.displayedName})
                </Label>
                <Input
                  id="typed-signature"
                  value={typedSignature}
                  autoComplete="off"
                  onChange={(event) => setTypedSignature(event.target.value)}
                />
                <Button
                  type="button"
                  disabled={pending || !typedSignature.trim()}
                  onClick={() =>
                    run(
                      () =>
                        adoptCeremonyMarkAction({
                          markKind: "SIGNATURE",
                          representationType: "TYPED",
                          typedText: typedSignature,
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
                  onChange={(event) => setTypedInitials(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use the first letter of each part of your name on this
                  Signing.
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

      {consentSatisfied ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your documents</CardTitle>
            <CardDescription>
              {overview.requiredRemaining === 0
                ? "Every required field is complete."
                : overview.requiredRemaining === 1
                  ? "One required field still needs you."
                  : `${overview.requiredRemaining} required fields still need you.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {overview.documents.map((document) => {
              const documentFields = actionableFields.filter(
                (field) =>
                  field.revisionDocumentId === document.revisionDocumentId,
              );
              return (
                <div
                  key={document.revisionDocumentId}
                  className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {document.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {document.acceptedFieldCount} of{" "}
                        {document.assignedFieldCount} of your fields complete
                      </p>
                    </div>
                    <a
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      href={`/sign/ceremony/document/${document.revisionDocumentId}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        void noteCeremonyReviewActivityAction();
                      }}
                    >
                      Review document
                    </a>
                  </div>

                  {documentFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No fields are assigned to you in this document.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {documentFields.map((field) => {
                        const clientRequestId = `${field.fieldId}:${
                          field.placementId ?? "new"
                        }`;
                        return (
                          <li
                            key={field.fieldId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input p-3"
                          >
                            <div className="text-sm">
                              <span className="font-medium text-foreground">
                                {field.fieldType === "SIGNATURE"
                                  ? "Signature"
                                  : "Initials"}
                              </span>
                              <span className="text-muted-foreground">
                                {" "}
                                · page {field.pageNumber}
                                {field.isRequired ? " · required" : ""}
                              </span>
                              {field.placementId ? (
                                <span className="block text-xs text-muted-foreground">
                                  Applied
                                  {field.renderedSenderLocalDate
                                    ? ` · dated ${field.renderedSenderLocalDate}`
                                    : ""}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex gap-2">
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
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={
                                    pending ||
                                    (field.fieldType === "SIGNATURE"
                                      ? !overview.marks.signature
                                      : !overview.marks.initials)
                                  }
                                  onClick={() =>
                                    run(() =>
                                      placeCeremonyFieldAction({
                                        signingFieldId: field.fieldId,
                                        clientRequestId: `accept:${clientRequestId}`,
                                      }),
                                    )
                                  }
                                >
                                  {field.fieldType === "SIGNATURE"
                                    ? "Sign here"
                                    : "Initial here"}
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

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
            onClick={() =>
              run(() => finishCeremonyAction(), {
                onSuccess: () => setFinished(true),
              })
            }
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
        </CardContent>
      </Card>
    </div>
  );
}
