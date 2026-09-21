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
  addDraftSigningDocumentAction,
  addDraftSigningParticipantAction,
  listPacketFormsForDraftAction,
  upsertDraftSigningFieldAction,
} from "@/lib/signing/stage3-actions";
import { useCallback, useEffect, useState } from "react";

type PacketFormOption = {
  id: number;
  packetId: number;
  documentName: string;
  packetLabel: string | null;
};

export function SigningDraftPrepPanel({
  signingId,
  canManage,
  firstDocumentId,
  participantsMissingFields,
  onChanged,
}: {
  signingId: string;
  canManage: boolean;
  firstDocumentId: string | null;
  participantsMissingFields: { id: string; fullName: string }[];
  onChanged: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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
    if (rows.length > 0 && !selectedPacketFormId) {
      setSelectedPacketFormId(String(rows[0].id));
    }
  }, [selectedPacketFormId, signingId]);

  useEffect(() => {
    if (!canManage) return;
    void loadPacketForms();
  }, [canManage, loadPacketForms]);

  if (!canManage) {
    return null;
  }

  async function addParticipant() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await addDraftSigningParticipantAction({
      signingId,
      fullName,
      email,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setFullName("");
      setEmail("");
      setNotice("Participant added.");
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
        <CardTitle>Draft preparation</CardTitle>
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
              <Label htmlFor="participant-email">Email</Label>
              <Input
                id="participant-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy || !fullName.trim() || !email.trim()}
            onClick={() => void addParticipant()}
          >
            Add participant
          </Button>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Add document from Packet Form</p>
          {packetForms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No available Packet Forms found on your Packets. Create or open a
              Packet with an AVAILABLE form first.
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
            disabled={busy || !selectedPacketFormId}
            onClick={() => void addDocument()}
          >
            Add document
          </Button>
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
