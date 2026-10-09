"use client";

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
  SIGNING_CAPACITY_LABEL_OPTIONS,
  type SigningCapacityLabel,
  type SigningCapacityMode,
  suggestCapacityWording,
} from "@/lib/signing/capacity-notices";
import type { InternalSignerOptions } from "@/lib/signing/draft-participants";
import {
  SIGNING_PARTICIPANT_ROLE_CODES,
  participantRoleDisplay,
  signingParticipantRoleLabel,
} from "@/lib/signing/participant-roles";
import {
  addAdHocDraftSigningDocumentAction,
  addDraftSigningDocumentAction,
  addDraftSigningParticipantAction,
  addRemainingPacketDocumentsAction,
  getDraftPacketParticipantRefreshAction,
  getDraftSourcePacketStateAction,
  getInternalSignerOptionsAction,
  includeInternalSignerAction,
  listPacketFormsForDraftAction,
  refreshDraftParticipantsFromPacketAction,
  removeDraftSigningDocumentAction,
  removeDraftSigningParticipantAction,
  selectDraftSourcePacketAction,
  updateDraftSigningParticipantAction,
} from "@/lib/signing/stage3-actions";
import type {
  DraftPacketParticipantRefresh,
  DraftSourcePacketState,
  SelectDraftSourcePacketResult,
} from "@/lib/signing/source-packet";
import { useCallback, useEffect, useRef, useState } from "react";

type PacketFormOption = {
  id: number;
  packetId: number;
  documentName: string;
  packetLabel: string | null;
};

type DraftDocument = {
  id: string;
  displayName: string;
  sourceStatus: string;
  selectedDraftSourceSnapshotId: string | null;
  sourceKind?: string | null;
};

type DraftParticipant = {
  id: string;
  fullName: string;
  email: string;
  optionalRole: string | null;
  roleCode?: string | null;
  hasSignatureOrInitialsField: boolean;
  capacityMode?: SigningCapacityMode;
  representedPartyName?: string | null;
  capacityLabel?: SigningCapacityLabel | null;
};

const DEFAULT_CAPACITY_LABEL: SigningCapacityLabel = "ATTORNEY_IN_FACT";

export function SigningDraftPrepPanel({
  signingId,
  canManage,
  sourcePacketId,
  documents,
  participants,
  onChanged,
  onResolveDrift,
  busyDocumentId,
  onPrepareDocument,
}: {
  signingId: string;
  canManage: boolean;
  sourcePacketId: number | null;
  documents: DraftDocument[];
  participants: DraftParticipant[];
  onChanged: () => Promise<void>;
  onResolveDrift: (
    documentId: string,
    choice: "KEEP_CURRENT" | "UPDATE_TO_LATEST",
  ) => Promise<void>;
  busyDocumentId: string | null;
  onPrepareDocument: (documentId: string | null) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [internalSigners, setInternalSigners] = useState<InternalSignerOptions | null>(
    null,
  );
  const [packetRefresh, setPacketRefresh] =
    useState<DraftPacketParticipantRefresh | null>(null);
  const [signingCapacityMode, setSigningCapacityMode] =
    useState<SigningCapacityMode>("PERSONAL");
  const [representedPartyName, setRepresentedPartyName] = useState("");
  const [capacityLabel, setCapacityLabel] =
    useState<SigningCapacityLabel>(DEFAULT_CAPACITY_LABEL);
  const [capacityWording, setCapacityWording] = useState("");
  const [capacityWordingTouched, setCapacityWordingTouched] = useState(false);

  const [packetForms, setPacketForms] = useState<PacketFormOption[]>([]);
  const [selectedPacketFormId, setSelectedPacketFormId] = useState("");
  const [sourceState, setSourceState] = useState<DraftSourcePacketState | null>(
    null,
  );
  const [packetChoice, setPacketChoice] = useState("");
  const [changingPacket, setChangingPacket] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const loadPacketForms = useCallback(async () => {
    const result = await listPacketFormsForDraftAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const rows = (result.data as PacketFormOption[] | undefined) ?? [];
    setPacketForms(rows);
    setSelectedPacketFormId((previous) => {
      if (rows.length === 0) return "";
      if (previous && rows.some((row) => String(row.id) === previous)) {
        return previous;
      }
      return String(rows[0].id);
    });
  }, [signingId]);

  const loadSourceState = useCallback(async () => {
    const result = await getDraftSourcePacketStateAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const state = result.data as DraftSourcePacketState;
    setSourceState(state);
    setPacketChoice((previous) => {
      if (
        previous &&
        state.selectablePackets.some((packet) => String(packet.id) === previous)
      ) {
        return previous;
      }
      return state.selectablePackets[0] ? String(state.selectablePackets[0].id) : "";
    });
    if (!state.canChangeSourcePacket) setChangingPacket(false);
  }, [signingId]);

  const loadParticipantSources = useCallback(async () => {
    const [signers, refresh] = await Promise.all([
      getInternalSignerOptionsAction({ signingId }),
      getDraftPacketParticipantRefreshAction({ signingId }),
    ]);
    if (signers.ok) setInternalSigners(signers.data as InternalSignerOptions);
    if (refresh.ok) setPacketRefresh(refresh.data as DraftPacketParticipantRefresh);
  }, [signingId]);

  const packetDocumentCount = documents.filter(
    (document) => document.sourceKind !== "AD_HOC_PDF",
  ).length;

  useEffect(() => {
    if (!canManage) return;
    void loadPacketForms();
    void loadSourceState();
    void loadParticipantSources();
  }, [
    canManage,
    loadPacketForms,
    loadSourceState,
    loadParticipantSources,
    sourcePacketId,
    packetDocumentCount,
    participants.length,
  ]);

  useEffect(() => {
    if (signingCapacityMode !== "REPRESENTATIVE") return;
    if (capacityWordingTouched) return;
    const suggested = suggestCapacityWording({
      signatoryName: fullName,
      representedPartyName,
      capacityLabel,
    });
    setCapacityWording(suggested);
  }, [
    signingCapacityMode,
    fullName,
    representedPartyName,
    capacityLabel,
    capacityWordingTouched,
  ]);

  useEffect(() => {
    if (signingCapacityMode === "PERSONAL") {
      setCapacityWordingTouched(false);
    }
  }, [signingCapacityMode]);

  if (!canManage) {
    return null;
  }

  const canAddRepresentative =
    representedPartyName.trim().length > 0 &&
    capacityWording.trim().length > 0;

  const canAddParticipant =
    fullName.trim().length > 0 &&
    roleCode !== "" &&
    (signingCapacityMode === "PERSONAL" || canAddRepresentative);
  const newPacketParticipants = packetRefresh?.newParticipants ?? [];

  const noPacketForms = packetForms.length === 0;
  const packetIdForBulk = sourcePacketId;
  const canAddEntirePacket = packetIdForBulk != null && !noPacketForms;
  const showPacketChooser =
    sourceState != null &&
    sourceState.canChangeSourcePacket &&
    (sourceState.sourcePacket == null || changingPacket);

  async function selectSourcePacket() {
    if (!packetChoice) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await selectDraftSourcePacketAction({
      signingId,
      packetId: Number(packetChoice),
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      const data = result.data as SelectDraftSourcePacketResult;
      const added = data.addedParticipantCount;
      setChangingPacket(false);
      await onChanged();
      await loadPacketForms();
      await loadSourceState();
      const skipped = data.skippedExistingParticipantCount;
      setNotice(
        added > 0
          ? `Packet selected. Added ${added} participant${added === 1 ? "" : "s"} from the Packet.${
              data.reviewNote?.includes("not available to you")
                ? ` ${data.reviewNote}`
                : ""
            }`
          : skipped > 0
            ? "Packet selected. Its parties are already participants."
            : `Packet selected. ${data.reviewNote ?? "No Packet transaction parties were found."}`,
      );
    }
    setBusy(false);
  }

  async function addParticipant() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addDraftSigningParticipantAction({
      signingId,
      fullName,
      email: email.trim() ? email : undefined,
      roleCode,
      optionalRole: roleLabel.trim() ? roleLabel : undefined,
      signingCapacityMode,
      ...(signingCapacityMode === "REPRESENTATIVE"
        ? {
            representedPartyName,
            capacityLabel,
            capacityWording,
          }
        : {}),
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setFullName("");
      setEmail("");
      setRoleCode("");
      setRoleLabel("");
      setSigningCapacityMode("PERSONAL");
      setRepresentedPartyName("");
      setCapacityLabel(DEFAULT_CAPACITY_LABEL);
      setCapacityWording("");
      setCapacityWordingTouched(false);
      setNotice("Participant added.");
      await onChanged();
    }
    setBusy(false);
  }

  async function changeParticipantRole(participantId: string, nextRoleCode: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await updateDraftSigningParticipantAction({
      signingId,
      participantId,
      roleCode: nextRoleCode,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice("Participant role updated.");
      await onChanged();
    }
    setBusy(false);
  }

  async function includeInternalSigner(kind: "SELF" | "BROKER") {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await includeInternalSignerAction({ signingId, kind });
    if (!result.ok) {
      setError(result.error);
    } else {
      const data = result.data as { added: boolean; participant: { full_name: string } };
      setNotice(
        data.added
          ? `${data.participant.full_name} added as a signer.`
          : `${data.participant.full_name} is already a signer on this Signing.`,
      );
      await onChanged();
      await loadParticipantSources();
    }
    setBusy(false);
  }

  async function addFromPacket() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await refreshDraftParticipantsFromPacketAction({ signingId });
    if (!result.ok) {
      setError(result.error);
    } else {
      const added =
        (result.data as { addedParticipantCount?: number } | undefined)
          ?.addedParticipantCount ?? 0;
      setNotice(
        added > 0
          ? `Added ${added} participant${added === 1 ? "" : "s"} from the Packet.`
          : "Every eligible Packet party is already a participant.",
      );
      await onChanged();
      await loadParticipantSources();
    }
    setBusy(false);
  }

  async function removeParticipant(participantId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await removeDraftSigningParticipantAction({
      signingId,
      participantId,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice("Participant removed.");
      await onChanged();
    }
    setBusy(false);
  }

  async function addDocument() {
    if (!selectedPacketFormId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addDraftSigningDocumentAction({
      signingId,
      sourcePacketFormId: Number(selectedPacketFormId),
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice("Document added.");
      await onChanged();
      await loadPacketForms();
    }
    setBusy(false);
  }

  async function addEntirePacket() {
    if (packetIdForBulk == null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addRemainingPacketDocumentsAction({
      signingId,
      packetId: packetIdForBulk,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      const data = result.data as
        | { addedCount?: number; skippedDuplicateCount?: number }
        | undefined;
      const added = data?.addedCount ?? 0;
      const skipped = data?.skippedDuplicateCount ?? 0;
      await onChanged();
      await loadPacketForms();
      setNotice(
        added === 0
          ? skipped > 0
            ? "All eligible Packet documents are already in this Signing."
            : "No eligible Packet documents were available to add."
          : `Added ${added} document${added === 1 ? "" : "s"} from the Packet${
              skipped > 0 ? ` (${skipped} already included)` : ""
            }.`,
      );
    }
    setBusy(false);
  }

  async function removeDocument(documentId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await removeDraftSigningDocumentAction({
      signingId,
      signingDocumentId: documentId,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice("Document removed.");
      await onChanged();
      await loadPacketForms();
    }
    setBusy(false);
  }

  async function uploadPdf(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addAdHocDraftSigningDocumentAction({
      signingId,
      filename: file.name,
      pdfFile: file,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setNotice("PDF uploaded to this Signing.");
      await onChanged();
    }
    setBusy(false);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prepare Signing</CardTitle>
        <CardDescription>
          Choose the source Packet, add its documents or upload a PDF, review
          participants, then use Prepare Documents to place signing fields.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}

        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Documents</p>
          {sourceState?.sourcePacket ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Source Packet
                </p>
                <p className="truncate text-sm font-semibold">
                  #{sourceState.sourcePacket.id} · {sourceState.sourcePacket.label}
                </p>
              </div>
              {sourceState.canChangeSourcePacket && !changingPacket ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setChangingPacket(true)}
                >
                  Change Packet
                </Button>
              ) : null}
            </div>
          ) : null}
          {sourceState?.sourcePacket && !sourceState.canChangeSourcePacket ? (
            <p className="text-xs text-muted-foreground">
              A Signing uses one source Packet. Start a new Signing to use a
              different Packet.
            </p>
          ) : null}

          {showPacketChooser ? (
            <div className="space-y-2">
              <Label htmlFor="source-packet">
                {sourceState?.sourcePacket ? "Change source Packet" : "Source Packet"}
              </Label>
              <div className="flex flex-wrap gap-2">
                <select
                  id="source-packet"
                  className="flex h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={packetChoice}
                  onChange={(event) => setPacketChoice(event.target.value)}
                  disabled={busy || (sourceState?.selectablePackets.length ?? 0) === 0}
                >
                  {(sourceState?.selectablePackets.length ?? 0) === 0 ? (
                    <option value="">No owned Packets available</option>
                  ) : (
                    sourceState?.selectablePackets.map((packet) => (
                      <option key={packet.id} value={packet.id}>
                        #{packet.id} · {packet.label}
                      </option>
                    ))
                  )}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !packetChoice}
                  onClick={() => void selectSourcePacket()}
                >
                  Use this Packet
                </Button>
                {sourceState?.sourcePacket ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setChangingPacket(false)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecting a Packet adds its buyers, sellers, and other parties
                as participants. You can still upload PDFs.
              </p>
            </div>
          ) : null}

          {sourcePacketId == null ? null : noPacketForms ? (
            <p className="text-sm text-muted-foreground">
              All eligible documents from this Packet are already in this
              Signing, or none are available.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="packet-form">Individual document</Label>
              <select
                id="packet-form"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={selectedPacketFormId}
                onChange={(event) => setSelectedPacketFormId(event.target.value)}
                disabled={busy}
              >
                {packetForms.map((form) => (
                  <option key={form.id} value={form.id}>
                    #{form.id} · {form.documentName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {sourcePacketId != null ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !canAddEntirePacket}
                  onClick={() => void addEntirePacket()}
                >
                  Add all remaining packet documents
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || noPacketForms || !selectedPacketFormId}
                  onClick={() => void addDocument()}
                >
                  Add document from packet
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => uploadInputRef.current?.click()}
            >
              Upload PDF
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) =>
                void uploadPdf(event.target.files?.[0] ?? null)
              }
            />
            <Button
              type="button"
              size="sm"
              disabled={busy || documents.length === 0}
              onClick={() => onPrepareDocument(null)}
            >
              Prepare Documents
            </Button>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Included documents</p>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents have been added yet.
              </p>
            ) : (
              documents.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-2 rounded-md border border-border/80 bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">
                      {document.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {document.sourceKind === "AD_HOC_PDF"
                        ? "Uploaded PDF"
                        : document.sourceStatus === "CURRENT"
                          ? "Current source"
                          : document.sourceStatus === "SOURCE_CHANGED"
                            ? "Source changed"
                            : "Source unavailable"}
                      {document.selectedDraftSourceSnapshotId
                        ? null
                        : " · No prepared source captured"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {document.sourceStatus === "SOURCE_CHANGED" ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy || busyDocumentId === document.id}
                          onClick={() =>
                            void onResolveDrift(document.id, "KEEP_CURRENT")
                          }
                        >
                          Keep Current
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || busyDocumentId === document.id}
                          onClick={() =>
                            void onResolveDrift(document.id, "UPDATE_TO_LATEST")
                          }
                        >
                          Update to Latest
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        busy ||
                        busyDocumentId === document.id ||
                        !document.selectedDraftSourceSnapshotId
                      }
                      onClick={() => onPrepareDocument(document.id)}
                    >
                      Open / Prepare
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || busyDocumentId === document.id}
                      onClick={() => void removeDocument(document.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <section className="space-y-3" aria-labelledby="draft-participants-heading">
          <p id="draft-participants-heading" className="text-sm font-medium">
            Participants
          </p>
          {newPacketParticipants.length > 0 ? (
            <div
              className="space-y-2 rounded-lg border border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/40"
              data-testid="packet-new-participants"
              role="status"
            >
              <p className="text-sm font-medium">
                The source Packet has {newPacketParticipants.length} new
                participant{newPacketParticipants.length === 1 ? "" : "s"}
              </p>
              <ul className="text-sm text-muted-foreground">
                {newPacketParticipants.map((party) => (
                  <li key={party.linkedContactId}>
                    {party.fullName}
                    {" — "}
                    {participantRoleDisplay(party.roleCode, party.optionalRole)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Adding them never changes or removes current participants.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void addFromPacket()}
              >
                Add from Packet
              </Button>
            </div>
          ) : null}
          {internalSigners ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="internal-signers">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  !internalSigners.self.available ||
                  internalSigners.self.alreadyIncluded
                }
                title={internalSigners.self.unavailableReason ?? undefined}
                onClick={() => void includeInternalSigner("SELF")}
              >
                {internalSigners.self.alreadyIncluded
                  ? "You are a signer"
                  : "Include me as a signer"}
              </Button>
              {internalSigners.broker.available ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || internalSigners.broker.alreadyIncluded}
                  onClick={() => void includeInternalSigner("BROKER")}
                >
                  {internalSigners.broker.alreadyIncluded
                    ? `Broker ${internalSigners.broker.fullName} is a signer`
                    : `Include broker as a signer (${internalSigners.broker.fullName})`}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Add participant</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="participant-name">Full name</Label>
                <Input
                  id="participant-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participant-email">Email (optional)</Label>
                <Input
                  id="participant-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participant-role">Role</Label>
                <select
                  id="participant-role"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={roleCode}
                  onChange={(event) => setRoleCode(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Choose a role</option>
                  {SIGNING_PARTICIPANT_ROLE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {signingParticipantRoleLabel(code)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="participant-role-label">Role label (optional)</Label>
                <Input
                  id="participant-role-label"
                  value={roleLabel}
                  placeholder="e.g. Co-buyer"
                  onChange={(event) => setRoleLabel(event.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Role labels the participant for preparation. It is not identity
              proof and does not grant representative authority.
            </p>

            <div className="space-y-2">
              <Label htmlFor="signing-capacity-mode">Signing as</Label>
              <select
                id="signing-capacity-mode"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={signingCapacityMode}
                onChange={(event) =>
                  setSigningCapacityMode(
                    event.target.value as SigningCapacityMode,
                  )
                }
                disabled={busy}
              >
                <option value="PERSONAL">Personal</option>
                <option value="REPRESENTATIVE">Representative</option>
              </select>
            </div>

            {signingCapacityMode === "REPRESENTATIVE" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="represented-party">Representing</Label>
                  <Input
                    id="represented-party"
                    value={representedPartyName}
                    onChange={(event) =>
                      setRepresentedPartyName(event.target.value)
                    }
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity-label">Capacity</Label>
                  <select
                    id="capacity-label"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={capacityLabel}
                    onChange={(event) => {
                      setCapacityWordingTouched(false);
                      setCapacityLabel(
                        event.target.value as SigningCapacityLabel,
                      );
                    }}
                    disabled={busy}
                  >
                    {SIGNING_CAPACITY_LABEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="capacity-wording">Exact execution wording</Label>
                  <Input
                    id="capacity-wording"
                    value={capacityWording}
                    onChange={(event) => {
                      setCapacityWordingTouched(true);
                      setCapacityWording(event.target.value);
                    }}
                    disabled={busy}
                  />
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              size="sm"
              disabled={busy || !canAddParticipant}
              onClick={() => void addParticipant()}
            >
              Add participant
            </Button>
          </div>

          <div className="space-y-2" data-testid="draft-participant-list">
            {participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No participants have been added yet.
              </p>
            ) : (
              participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{participant.fullName}</span>
                      {participantRoleDisplay(participant.roleCode, participant.optionalRole) ? (
                        <span className="text-muted-foreground" data-testid="participant-role">
                          {participantRoleDisplay(participant.roleCode, participant.optionalRole)}
                        </span>
                      ) : null}
                      {participant.capacityMode === "REPRESENTATIVE" ? (
                        <span className="text-muted-foreground">
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
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {participant.email || "No email"}
                    </p>
                    {!participant.hasSignatureOrInitialsField ? (
                      <p className="text-xs text-warning-foreground">
                        Needs at least one Signature or Initials field.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Role for ${participant.fullName}`}
                      className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
                      value={participant.roleCode ?? ""}
                      onChange={(event) =>
                        void changeParticipantRole(participant.id, event.target.value)
                      }
                      disabled={busy}
                    >
                      <option value="">No role</option>
                      {SIGNING_PARTICIPANT_ROLE_CODES.map((code) => (
                        <option key={code} value={code}>
                          {signingParticipantRoleLabel(code)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void removeParticipant(participant.id)}
                    >
                      Remove participant
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
