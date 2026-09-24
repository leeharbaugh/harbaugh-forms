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
import {
  addAdHocDraftSigningDocumentAction,
  addDraftSigningDocumentAction,
  addDraftSigningParticipantAction,
  addRemainingPacketDocumentsAction,
  listPacketFormsForDraftAction,
  removeDraftSigningDocumentAction,
  removeDraftSigningParticipantAction,
  upsertDraftSigningFieldAction,
} from "@/lib/signing/stage3-actions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const DEFAULT_CAPACITY_LABEL: SigningCapacityLabel = "ATTORNEY_IN_FACT";

export function SigningDraftPrepPanel({
  signingId,
  canManage,
  sourcePacketId,
  firstDocumentId,
  documents,
  participants,
  participantsMissingFields,
  onChanged,
  onResolveDrift,
  busyDocumentId,
  onPrepareDocument,
}: {
  signingId: string;
  canManage: boolean;
  sourcePacketId: number | null;
  firstDocumentId: string | null;
  documents: DraftDocument[];
  participants: { id: string; fullName: string }[];
  participantsMissingFields: { id: string; fullName: string }[];
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
  const [signingCapacityMode, setSigningCapacityMode] =
    useState<SigningCapacityMode>("PERSONAL");
  const [representedPartyName, setRepresentedPartyName] = useState("");
  const [capacityLabel, setCapacityLabel] =
    useState<SigningCapacityLabel>(DEFAULT_CAPACITY_LABEL);
  const [capacityWording, setCapacityWording] = useState("");
  const [capacityWordingTouched, setCapacityWordingTouched] = useState(false);

  const [packetForms, setPacketForms] = useState<PacketFormOption[]>([]);
  const [selectedPacketFormId, setSelectedPacketFormId] = useState("");
  const [selectedPacketId, setSelectedPacketId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const packetOptions = useMemo(() => {
    const byId = new Map<number, string | null>();
    for (const form of packetForms) {
      if (!byId.has(form.packetId)) {
        byId.set(form.packetId, form.packetLabel);
      }
    }
    return Array.from(byId.entries()).map(([id, label]) => ({
      id,
      label: label ?? `Packet ${id}`,
    }));
  }, [packetForms]);

  const formsForSelectedPacket = useMemo(() => {
    if (sourcePacketId != null) return packetForms;
    if (!selectedPacketId) return packetForms;
    return packetForms.filter(
      (form) => String(form.packetId) === selectedPacketId,
    );
  }, [packetForms, selectedPacketId, sourcePacketId]);

  const loadPacketForms = useCallback(async () => {
    const result = await listPacketFormsForDraftAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const rows = (result.data as PacketFormOption[] | undefined) ?? [];
    setPacketForms(rows);
    setSelectedPacketId((previous) => {
      if (sourcePacketId != null) return String(sourcePacketId);
      if (rows.length === 0) return "";
      if (previous && rows.some((row) => String(row.packetId) === previous)) {
        return previous;
      }
      return String(rows[0].packetId);
    });
    setSelectedPacketFormId((previous) => {
      if (rows.length === 0) return "";
      if (previous && rows.some((row) => String(row.id) === previous)) {
        return previous;
      }
      return String(rows[0].id);
    });
  }, [signingId, sourcePacketId]);

  useEffect(() => {
    if (!canManage) return;
    void loadPacketForms();
  }, [canManage, loadPacketForms]);

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

  useEffect(() => {
    if (sourcePacketId != null) return;
    if (!selectedPacketId) return;
    setSelectedPacketFormId((previous) => {
      const scoped = packetForms.filter(
        (form) => String(form.packetId) === selectedPacketId,
      );
      if (scoped.length === 0) return "";
      if (previous && scoped.some((row) => String(row.id) === previous)) {
        return previous;
      }
      return String(scoped[0].id);
    });
  }, [selectedPacketId, packetForms, sourcePacketId]);

  if (!canManage) {
    return null;
  }

  const canAddRepresentative =
    representedPartyName.trim().length > 0 &&
    capacityWording.trim().length > 0;

  const canAddParticipant =
    fullName.trim().length > 0 &&
    (signingCapacityMode === "PERSONAL" || canAddRepresentative);

  const noPacketForms = formsForSelectedPacket.length === 0;
  const packetIdForBulk =
    sourcePacketId != null
      ? sourcePacketId
      : selectedPacketId
        ? Number(selectedPacketId)
        : null;
  const canAddEntirePacket = packetIdForBulk != null && !noPacketForms;

  async function addParticipant() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addDraftSigningParticipantAction({
      signingId,
      fullName,
      email: email.trim() ? email : undefined,
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
      setNotice(
        added === 0
          ? skipped > 0
            ? "All eligible Packet documents are already in this Signing."
            : "No eligible Packet documents were available to add."
          : `Added ${added} document${added === 1 ? "" : "s"} from the Packet${
              skipped > 0 ? ` (${skipped} already included)` : ""
            }.`,
      );
      await onChanged();
      await loadPacketForms();
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

  async function addDefaultFields(participantId: string) {
    if (!firstDocumentId) {
      setError("Add a document before placing signature fields.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const signature = await upsertDraftSigningFieldAction({
      signingId,
      signingDocumentId: firstDocumentId,
      signingParticipantId: participantId,
      fieldType: "SIGNATURE",
      pageNumber: 1,
      x: 72,
      y: 720,
      width: 160,
      height: 40,
    });
    if (!signature.ok) {
      setError(signature.error);
      setBusy(false);
      return;
    }
    const signatureId = (signature.data as { id?: string } | undefined)?.id;
    if (!signatureId) {
      setError("Signature field was created without an id.");
      setBusy(false);
      return;
    }
    const dateSigned = await upsertDraftSigningFieldAction({
      signingId,
      signingDocumentId: firstDocumentId,
      signingParticipantId: participantId,
      fieldType: "DATE_SIGNED",
      linkedSignatureDraftFieldId: signatureId,
      pageNumber: 1,
      x: 250,
      y: 720,
      width: 100,
      height: 24,
    });
    if (!dateSigned.ok) {
      setError(dateSigned.error);
    } else {
      setNotice("Default Signature and Date Signed fields added.");
      await onChanged();
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prepare Signing</CardTitle>
        <CardDescription>
          Add Packet documents or upload a PDF, add participants, then use
          Prepare Documents to place Signature, Initials, and Date Signed
          fields visually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}

        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Documents</p>
          {sourcePacketId == null ? (
            <div className="space-y-2">
              <Label htmlFor="source-packet">Packet</Label>
              <select
                id="source-packet"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={selectedPacketId}
                onChange={(event) => setSelectedPacketId(event.target.value)}
                disabled={busy || packetOptions.length === 0}
              >
                {packetOptions.length === 0 ? (
                  <option value="">No owned Packets available</option>
                ) : (
                  packetOptions.map((packet) => (
                    <option key={packet.id} value={packet.id}>
                      #{packet.id} · {packet.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Documents come from source Packet #{sourcePacketId}. Already
              included forms are hidden from the picker.
            </p>
          )}

          {noPacketForms ? (
            <p className="text-sm text-muted-foreground">
              {documents.length > 0
                ? "All eligible Packet documents are already in this Signing, or none remain available."
                : "No available Packet Forms found on your Packets. Create or open a Packet with an available form first, or upload a PDF."}
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
                {formsForSelectedPacket.map((form) => (
                  <option key={form.id} value={form.id}>
                    #{form.id} · {form.documentName}
                    {form.packetLabel ? ` (${form.packetLabel})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !canAddEntirePacket}
              onClick={() => void addEntirePacket()}
            >
              {sourcePacketId != null
                ? "Add all remaining packet documents"
                : "Add entire packet"}
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
          </div>

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

        {participants.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Draft participants</p>
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm">{participant.fullName}</span>
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
            ))}
          </div>
        ) : null}

        {participantsMissingFields.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Optional quick fields</p>
            <p className="text-sm text-muted-foreground">
              Prefer Prepare Documents for visual placement. Add default fields
              remains available as a quick fixture that places a typed Signature
              + Date Signed pair on page 1 of the first document.
            </p>
            {participantsMissingFields.map((participant) => (
              <div
                key={participant.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm">{participant.fullName}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !firstDocumentId}
                  onClick={() => void addDefaultFields(participant.id)}
                >
                  Add default fields
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
