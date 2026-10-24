"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CeremonyFocusRequest } from "@/components/sign/ceremony-document-viewer";
import {
  ConsentDisclosureCard,
  DisclosureReviewButton,
} from "@/components/sign/consent-disclosure";
import {
  acceptConsentAction,
  ceremonyHeartbeatAction,
  declineCeremonyAction,
  exitCeremonyAction,
  finishCeremonyAction,
  getCeremonyOverviewAction,
  noteCeremonyReviewActivityAction,
  placeCeremonyFieldAction,
  removeCeremonyPlacementAction,
  replaceCeremonyPlacementAction,
  startCeremonySigningAction,
} from "@/lib/signing/ceremony-actions";
import type { CeremonyOverview } from "@/lib/signing/ceremony-context";
import {
  ceremonyFieldListEntries,
  isParticipantActionableField,
  linkedDateSignedBySignatureField,
  nextIncompleteCeremonyField,
  type CeremonyActionableField,
} from "@/lib/signing/ceremony-field-view";
import {
  ceremonyFieldsPanelMode,
  type CeremonyFieldsPanelMode,
} from "@/lib/signing/ceremony-layout";
import { CONSENT_WITHDRAWN_PARTICIPANT_MESSAGE } from "@/lib/signing/consent-disclosure-view";
import { SIGNING_PRESENCE_HEARTBEAT_SECONDS } from "@/lib/signing/presence";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

/** pdf.js is browser-only; keep it out of the server-rendered graph. */
const CeremonyDocumentViewer = dynamic(
  () => import("@/components/sign/ceremony-document-viewer"),
  {
    ssr: false,
    loading: () => (
      <p className="p-4 text-sm text-muted-foreground">Loading documents…</p>
    ),
  },
);

type CeremonyActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

const NETWORK_ERROR =
  "We could not reach Harbaugh Forms, so that was not saved. Check your connection and try again.";

function firstRequiredField(overview: CeremonyOverview) {
  return nextIncompleteCeremonyField(overview.fields, overview.documents, null, {
    requiredOnly: true,
  });
}

function needsMarkSetup(overview: CeremonyOverview): boolean {
  const kinds = new Set(
    overview.fields.filter(isParticipantActionableField).map((field) => field.fieldType),
  );
  return (
    (kinds.has("SIGNATURE") && !overview.marks.signature) ||
    (kinds.has("INITIALS") && !overview.marks.initials)
  );
}

/**
 * Focused participant ceremony shell.
 *
 * Deliberately not the agent workspace: no navigation, no other participants'
 * activity, no Signing management. Every meaningful action is a server action —
 * nothing important exists only in this component's state, so a timeout or a
 * superseded session never loses confirmed work.
 *
 * The document fills the screen. Guidance (the first required field on Start
 * signing, the next one after each accepted mark) only scrolls and highlights;
 * the participant applies every mark with their own click, navigation waits
 * for the server to accept it, and review stays free at all times.
 */
export function CeremonyShell({
  initialOverview,
}: {
  initialOverview: CeremonyOverview;
}) {
  const initialFirstField =
    initialOverview.consent.satisfied && !needsMarkSetup(initialOverview)
      ? firstRequiredField(initialOverview)
      : null;
  const [overview, setOverview] = useState(initialOverview);
  const [error, setError] = useState<string | null>(null);
  const [retryField, setRetryField] = useState<CeremonyActionableField | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [fieldsPanelOpen, setFieldsPanelOpen] = useState(false);
  const [shellElement, setShellElement] = useState<HTMLDivElement | null>(null);
  const [panelMode, setPanelMode] = useState<CeremonyFieldsPanelMode>("docked");
  const fieldsToggleRef = useRef<HTMLButtonElement | null>(null);
  const fieldsCloseRef = useRef<HTMLButtonElement | null>(null);
  const [currentDocumentId, setCurrentDocumentId] = useState(
    () =>
      (
        initialFirstField ??
        nextIncompleteCeremonyField(initialOverview.fields, initialOverview.documents)
      )?.revisionDocumentId ??
      initialOverview.documents[0]?.revisionDocumentId ??
      "",
  );
  const [focusRequest, setFocusRequest] = useState<CeremonyFocusRequest | null>(() =>
    initialFirstField
      ? { fieldId: initialFirstField.fieldId, nonce: 1, guide: true }
      : null,
  );
  const focusNonce = useRef(1);
  const focusFinishWhenReady = useRef(false);
  const finishButtonRef = useRef<HTMLButtonElement | null>(null);
  const finished = overview.participantStatus === "FINISHED";

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

  // Once the last required field is accepted, move focus to Finish. Never
  // before the refreshed server state says Finish is available.
  useEffect(() => {
    if (focusFinishWhenReady.current && overview.canFinish && !pending) {
      focusFinishWhenReady.current = false;
      finishButtonRef.current?.focus();
    }
  }, [overview.canFinish, pending]);

  useLayoutEffect(() => {
    if (!shellElement) return;
    const update = () => {
      const mode = ceremonyFieldsPanelMode(shellElement.getBoundingClientRect().width);
      setPanelMode(mode);
      if (mode === "docked") setFieldsPanelOpen(false);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shellElement);
    return () => observer.disconnect();
  }, [shellElement]);

  const docked = panelMode === "docked";
  const drawerOpen = !docked && fieldsPanelOpen;

  useEffect(() => {
    if (!drawerOpen) return;
    fieldsCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFieldsPanelOpen(false);
      fieldsToggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  function closeFieldsDrawer() {
    setFieldsPanelOpen(false);
    fieldsToggleRef.current?.focus();
  }

  function run(
    action: () => Promise<CeremonyActionResult>,
    options?: {
      onSuccess?: (data: unknown) => void;
      successNotice?: string;
      retry?: CeremonyActionableField;
    },
  ) {
    setError(null);
    setRetryField(null);
    setNotice(null);
    startTransition(async () => {
      let result: CeremonyActionResult;
      try {
        result = await action();
      } catch {
        setError(NETWORK_ERROR);
        if (options?.retry) setRetryField(options.retry);
        return;
      }
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
        if (options?.retry) setRetryField(options.retry);
        await refresh();
        return;
      }
      options?.onSuccess?.(result.data);
      if (options?.successNotice) setNotice(options.successNotice);
      await refresh();
    });
  }

  /** Terminal actions redirect on success, so only a failure ever returns here. */
  function runTerminal(action: () => Promise<CeremonyActionResult>) {
    setError(null);
    setRetryField(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) {
        setFinishConfirmOpen(false);
        setDeclineOpen(false);
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
      }
    });
  }

  /** Document navigation: free at any time, and counts as review activity. */
  function goToField(field: CeremonyActionableField, guide: boolean) {
    focusNonce.current += 1;
    setCurrentDocumentId(field.revisionDocumentId);
    setFocusRequest({ fieldId: field.fieldId, nonce: focusNonce.current, guide });
    void noteCeremonyReviewActivityAction();
  }

  function guideToFirstRequiredField(source: CeremonyOverview) {
    const first = firstRequiredField(source);
    if (first) goToField(first, true);
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
        retry: field,
        // Runs only after the server accepted this mark.
        onSuccess: () => {
          const next = nextIncompleteCeremonyField(
            overview.fields.map((candidate) =>
              candidate.fieldId === field.fieldId
                ? { ...candidate, placementId: candidate.placementId ?? "accepted" }
                : candidate,
            ),
            overview.documents,
            field.fieldId,
            { requiredOnly: true },
          );
          if (next) {
            goToField(next, true);
          } else {
            setFocusRequest(null);
            focusFinishWhenReady.current = true;
          }
        },
      },
    );
  }

  function removePlacement(field: CeremonyActionableField, clientRequestId: string) {
    run(
      () =>
        removeCeremonyPlacementAction({
          signingFieldId: field.fieldId,
          clientRequestId: `remove:${clientRequestId}:${Date.now()}`,
        }),
      { onSuccess: () => goToField(field, false) },
    );
  }

  function replacePlacement(field: CeremonyActionableField, clientRequestId: string) {
    run(
      () =>
        replaceCeremonyPlacementAction({
          signingFieldId: field.fieldId,
          clientRequestId: `replace:${clientRequestId}:${Date.now()}`,
        }),
      { onSuccess: () => goToField(field, false) },
    );
  }

  const leaveButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      title="Your completed work is saved. You can return with your Signing link."
      onClick={() => runTerminal(() => exitCeremonyAction())}
    >
      Leave for now
    </Button>
  );

  const declineButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => setDeclineOpen(true)}
    >
      Decline to sign
    </Button>
  );

  const declineDialog = (
    <ConfirmDialog
      open={declineOpen}
      title="Decline to sign?"
      variant="destructive"
      confirmLabel="Yes, decline to sign"
      confirmingLabel="Declining…"
      cancelLabel="Keep signing"
      isConfirming={pending}
      onCancel={() => setDeclineOpen(false)}
      onConfirm={() =>
        runTerminal(() =>
          declineCeremonyAction({ confirmed: true, reason: declineReason }),
        )
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-foreground">
          Declining means you refuse to sign. It ends this Signing for everyone,
          your agent will be notified, and it cannot be undone.
        </p>
        <p className="text-muted-foreground">
          If you only need a break, choose Leave for now instead. Your work is
          saved and you can return with your link.
        </p>
        <div className="space-y-2">
          <Label htmlFor="decline-reason">Reason (optional)</Label>
          <Textarea
            id="decline-reason"
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
          />
        </div>
      </div>
    </ConfirmDialog>
  );

  if (sessionEnded) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
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
      </div>
    );
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">You have finished signing.</CardTitle>
            <CardDescription>You may now close this browser.</CardDescription>
          </CardHeader>
          {overview.inPersonCeremony ? (
            <CardContent>
              <Button
                type="button"
                className="w-full"
                onClick={() => window.location.replace("/sign/return-to-agent")}
              >
                Hand device back to your agent
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </div>
    );
  }

  const consentSatisfied = overview.consent.satisfied;
  const disclosure = overview.consent.currentDisclosure;
  const representativeNote =
    overview.capacityMode === "REPRESENTATIVE" ? (
      <p className="text-xs text-muted-foreground">
        Representing {overview.representedPartyName}. Execution wording is
        prepared by the sending agent; Harbaugh Forms does not verify legal
        authority.
      </p>
    ) : null;
  const messages = (
    <>
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <span className="min-w-0 flex-1">{error}</span>
          {retryField ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => placeField(retryField)}
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="border-b px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </>
  );

  if (!consentSatisfied || needsMarkSetup(overview)) {
    const kinds = new Set(
      overview.fields.filter(isParticipantActionableField).map((field) => field.fieldType),
    );
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Harbaugh Forms</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {overview.signingTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signing as {overview.displayedName}
          </p>
        </div>
        {messages}
        {overview.consent.reason === "CONSENT_WITHDRAWN" ? (
          <Card data-testid="consent-withdrawn">
            <CardHeader>
              <CardTitle className="text-base">Electronic consent withdrawn</CardTitle>
              <CardDescription>{CONSENT_WITHDRAWN_PARTICIPANT_MESSAGE}</CardDescription>
            </CardHeader>
          </Card>
        ) : !consentSatisfied ? (
          <ConsentDisclosureCard
            disclosure={disclosure}
            reconsent={overview.consent.reason === "ACCEPTANCE_UNVERIFIABLE"}
            pending={pending}
            onConsent={() => {
              const skipSetup = !needsMarkSetup(overview);
              run(
                () =>
                  acceptConsentAction({
                    disclosureVersionId: disclosure.id,
                  }),
                {
                  successNotice: "Disclosure accepted.",
                  onSuccess: () => {
                    if (skipSetup) guideToFirstRequiredField(overview);
                  },
                },
              );
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your signature and initials</CardTitle>
              <CardDescription>
                {overview.capacityMode === "REPRESENTATIVE"
                  ? "Your signature is the execution wording prepared by your agent. Your initials come from your name on this Signing."
                  : "These come from your name exactly as it appears on this Signing."}{" "}
                They are placed only where you click to sign or initial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                {kinds.has("SIGNATURE") ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Signature</p>
                    <p
                      data-testid="signature-preview"
                      className="truncate rounded-md border border-input bg-muted/30 px-3 py-1 text-3xl"
                      style={{ fontFamily: "HarbaughCaveat, cursive" }}
                    >
                      {overview.expectedTypedSignatureText || overview.displayedName}
                    </p>
                  </div>
                ) : null}
                {kinds.has("INITIALS") ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Initials</p>
                    <p
                      data-testid="initials-preview"
                      className="rounded-md border border-input bg-muted/30 px-3 py-1 text-3xl"
                      style={{ fontFamily: "HarbaughCaveat, cursive" }}
                    >
                      {overview.typedInitials}
                    </p>
                  </div>
                ) : null}
              </div>
              <style>
                {
                  "@font-face{font-family:HarbaughCaveat;src:url(/fonts/Caveat-Regular.ttf) format('truetype');font-display:swap}"
                }
              </style>
              <p className="text-xs text-muted-foreground">
                These cannot be changed here. If your name is wrong, leave for now
                and contact your agent before signing.
              </p>
              {representativeNote}
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => startCeremonySigningAction(), {
                    onSuccess: () => guideToFirstRequiredField(overview),
                  })
                }
              >
                Start signing
              </Button>
            </CardContent>
          </Card>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {leaveButton}
          {declineButton}
        </div>
        {declineDialog}
      </div>
    );
  }

  const entries = ceremonyFieldListEntries(overview.fields, overview.documents);
  const dateSignedBySignature = linkedDateSignedBySignatureField(overview.fields);
  const requiredTotal = entries.filter((entry) => entry.field.isRequired).length;
  const requiredDone = requiredTotal - overview.requiredRemaining;
  const allRequiredComplete = overview.canFinish;

  return (
    <div
      ref={setShellElement}
      className="flex h-dvh flex-col overflow-x-clip"
      data-fields-panel-mode={panelMode}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {overview.signingTitle}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Signing as {overview.displayedName}
            {overview.capacityMode === "REPRESENTATIVE"
              ? `, representing ${overview.representedPartyName}`
              : ""}
          </p>
        </div>
        {requiredTotal > 0 ? (
          <div className="flex items-center gap-2" data-testid="ceremony-progress">
            <div
              className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Required fields complete"
              aria-valuemin={0}
              aria-valuemax={requiredTotal}
              aria-valuenow={requiredDone}
            >
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${(requiredDone / requiredTotal) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {requiredDone} of {requiredTotal} required
            </span>
          </div>
        ) : null}
        {docked ? null : (
          <Button
            ref={fieldsToggleRef}
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={drawerOpen}
            aria-controls="ceremony-your-fields"
            onClick={() => (drawerOpen ? closeFieldsDrawer() : setFieldsPanelOpen(true))}
          >
            Your fields
          </Button>
        )}
        <Button
          ref={finishButtonRef}
          type="button"
          size="sm"
          variant={allRequiredComplete ? "default" : "outline"}
          disabled={pending || !allRequiredComplete}
          onClick={() => setFinishConfirmOpen(true)}
        >
          Finish Signing
        </Button>
        {overview.consent.acceptedDisclosure ? (
          <DisclosureReviewButton disclosure={overview.consent.acceptedDisclosure} />
        ) : null}
        {leaveButton}
      </header>

      {messages}
      {allRequiredComplete ? (
        <div
          role="status"
          data-testid="ceremony-ready"
          className="shrink-0 border-b border-emerald-600/20 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"
        >
          <span className="font-medium">All required fields are complete.</span>{" "}
          Click Finish Signing when you are done reviewing.
        </div>
      ) : null}

      <div
        className={cn(
          "relative grid min-h-0 min-w-0 flex-1 overflow-hidden",
          docked ? "grid-cols-[minmax(0,1fr)_20rem]" : "grid-cols-1",
        )}
      >
        <div className="min-h-0 min-w-0">
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
        </div>

        <aside
          id="ceremony-your-fields"
          aria-label="Your fields"
          data-mode={docked ? "docked" : drawerOpen ? "drawer-open" : "drawer-closed"}
          className={cn(
            "min-h-0 min-w-0 flex-col border-l bg-background",
            docked
              ? "flex"
              : drawerOpen
                ? "absolute inset-y-0 right-0 z-20 flex w-[min(22rem,100%)] shadow-xl"
                : "hidden",
          )}
        >
          <div className="shrink-0 space-y-1 border-b px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Your fields</h2>
              {docked ? null : (
                <Button
                  ref={fieldsCloseRef}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={closeFieldsDrawer}
                >
                  Close
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {overview.requiredRemaining === 0
                ? "All required fields are complete."
                : overview.requiredRemaining === 1
                  ? "One required field still needs you."
                  : `${overview.requiredRemaining} required fields still need you.`}
            </p>
            {representativeNote}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {entries.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                No fields are assigned to you in this Signing.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {entries.map((entry) => {
                  const field = entry.field;
                  const clientRequestId = `${field.fieldId}:${
                    field.placementId ?? "new"
                  }`;
                  const completed = entry.status === "Completed";
                  const where = [
                    entry.documentName,
                    `Page ${entry.pageNumber}`,
                    entry.positionOnPage ? `${entry.positionOnPage} on page` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={field.fieldId}
                      data-ceremony-field-row={field.fieldId}
                      data-status={completed ? "completed" : "remaining"}
                      className={cn(
                        "rounded-md border p-2",
                        focusRequest?.fieldId === field.fieldId
                          ? "border-sky-500 bg-sky-50/60"
                          : "border-input",
                      )}
                    >
                      <button
                        type="button"
                        className="w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        aria-label={`Go to ${entry.kindLabel}, ${where}, ${completed ? "completed" : "remaining"}`}
                        onClick={() => {
                          goToField(field, !completed);
                          setFieldsPanelOpen(false);
                        }}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {entry.kindLabel}
                            {field.isRequired ? "" : (
                              <span className="font-normal text-muted-foreground"> · optional</span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              completed ? "text-emerald-700" : "text-amber-700",
                            )}
                          >
                            {entry.status}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {where}
                        </span>
                        {completed && dateSignedBySignature.has(field.fieldId) ? (
                          <span className="block text-xs text-muted-foreground">
                            Dated {dateSignedBySignature.get(field.fieldId)}
                          </span>
                        ) : null}
                      </button>
                      {completed ? (
                        <div className="mt-1.5 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            disabled={pending}
                            onClick={() => replacePlacement(field, clientRequestId)}
                          >
                            Replace
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            disabled={pending}
                            onClick={() => removePlacement(field, clientRequestId)}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Not going to sign? Declining ends this Signing for everyone.
            </p>
            <div className="-ml-3">{declineButton}</div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={finishConfirmOpen}
        title="Finish signing?"
        confirmLabel="Yes, finish signing"
        confirmingLabel="Finishing…"
        cancelLabel="Keep reviewing"
        isConfirming={pending}
        onCancel={() => setFinishConfirmOpen(false)}
        onConfirm={() => runTerminal(() => finishCeremonyAction())}
      >
        <div className="space-y-2 text-sm text-foreground">
          <p>You are finishing your part of this Signing.</p>
          <p>
            After you finish, you cannot change your signature, initials, or any of
            your fields.
          </p>
          <p className="text-muted-foreground">
            The Signing may still be waiting for other participants or final
            processing.
          </p>
        </div>
      </ConfirmDialog>
      {declineDialog}
    </div>
  );
}
