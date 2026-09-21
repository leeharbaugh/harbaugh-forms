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
  addDraftSigningDocumentAction,
  addDraftSigningParticipantAction,
  listPacketFormsForDraftAction,
  removeDraftSigningParticipantAction,
  upsertDraftSigningFieldAction,
} from "@/lib/signing/stage3-actions";
import { useCallback, useEffect, useState } from "react";

type PacketFormOption = {
  id: number;
  packetId: number;
  documentName: string;
  packetLabel: string | null;
};

const DEFAULT_CAPACITY_LABEL: SigningCapacityLabel = "ATTORNEY_IN_FACT";

export function SigningDraftPrepPanel({
  signingId,
  canManage,
  firstDocumentId,
  participants,
  participantsMissingFields,
  onChanged,
}: {
  signingId: string;
  canManage: boolean;
  firstDocumentId: string | null;
  participants: { id: string; fullName: string }[];
  participantsMissingFields: { id: string; fullName: string }[];
  onChanged: () => Promise<void>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  if (!canManage) {
    return null;
  }

  const canAddRepresentative =
    representedPartyName.trim().length > 0 &&
    capacityWording.trim().length > 0;

  const canAddParticipant =
    fullName.trim().length > 0 &&
    (signingCapacityMode === "PERSONAL" || canAddRepresentative);

  const noPacketForms = packetForms.length === 0;

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
      setNotice("Document added from Packet Form.");
      await onChanged();
    }
    setBusy(false);
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
          Add participants and Packet Form documents, then place default typed
          signature fields so the Signing can become Ready.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
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

        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Add document from Packet Form</p>
          {noPacketForms ? (
            <p className="text-sm text-muted-foreground">
              No available Packet Forms found on your Packets. Create or open a
              Packet with an AVAILABLE form first, then return here to attach
              it to this Signing.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="packet-form">Packet Form</Label>
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
                    {form.packetLabel ? ` (${form.packetLabel})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || noPacketForms || !selectedPacketFormId}
            title={
              noPacketForms
                ? "Add an AVAILABLE Packet Form before attaching a document."
                : undefined
            }
            onClick={() => void addDocument()}
          >
            Add document
          </Button>
          {noPacketForms ? (
            <p className="text-xs text-muted-foreground">
              Add document is unavailable until at least one Packet Form is
              available.
            </p>
          ) : null}
        </div>

        {participantsMissingFields.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Signature fields</p>
            <p className="text-sm text-muted-foreground">
              Place a default typed Signature + Date Signed pair on page 1 of
              the first document.
            </p>
            {participantsMissingFields.map((participant) => (
              <div
                key={participant.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm">{participant.fullName}</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !firstDocumentId}
                    onClick={() => void addDefaultFields(participant.id)}
                  >
                    Add default fields
                  </Button>
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
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
