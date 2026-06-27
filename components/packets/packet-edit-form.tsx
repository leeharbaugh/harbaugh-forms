"use client";

import { PacketContactsLiveEditor } from "@/components/packets/packet-contacts-live-editor";
import { PacketFormsLiveEditor } from "@/components/packets/packet-forms-live-editor";
import { PropertyPicker } from "@/components/properties/property-picker";
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
import { createClient } from "@/lib/supabase/client";
import { formatCollectionType, type CollectionType } from "@/lib/types/collection";
import {
  PACKET_DETAIL_SELECT,
  type PacketDetail,
  updatePacket,
} from "@/lib/types/packet";
import { sortPacketForms } from "@/lib/types/packet-form";
import {
  formatPacketWorkflowType,
  PACKET_WORKFLOW_TYPES,
  type PacketWorkflowType,
  workflowRequiresProperty,
  workflowToCollectionType,
} from "@/lib/types/packet-workflow";
import {
  emptyPropertyInput,
  formatPropertyAddress,
  propertyToInput,
  type PropertyInput,
  type PropertySelectionMode,
} from "@/lib/types/property";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type PacketEditFormProps = {
  packetId: number;
};

type CollectionOption = {
  id: number;
  collection_name: string;
  collection_type: string;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function PacketEditForm({ packetId }: PacketEditFormProps) {
  const router = useRouter();
  const [packet, setPacket] = useState<PacketDetail | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [label, setLabel] = useState("");
  const [packetType, setPacketType] = useState<PacketWorkflowType | "">("");
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [propertyMode, setPropertyMode] =
    useState<PropertySelectionMode>("existing");
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [property, setProperty] = useState<PropertyInput>(emptyPropertyInput());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPacket = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("packets")
      .select(PACKET_DETAIL_SELECT)
      .eq("id", packetId)
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
      setPacket(null);
      setIsLoading(false);
      return;
    }

    if (!data) {
      setLoadError("Packet not found.");
      setPacket(null);
      setIsLoading(false);
      return;
    }

    const detail = data as PacketDetail;
    setPacket(detail);
    setLabel(detail.label);
    setPacketType((detail.packet_type as PacketWorkflowType) ?? "");
    setCollectionId(detail.collection_id);
    setNotes(detail.notes ?? "");
    setStatus(detail.status);
    setPropertyId(detail.property_id);
    if (detail.properties) {
      setProperty(propertyToInput(detail.properties));
    }
    setIsLoading(false);
  }, [packetId]);

  const loadCollections = useCallback(async (type: PacketWorkflowType | "") => {
    if (!type) {
      setCollections([]);
      return;
    }

    const supabase = createClient();
    const collectionType = workflowToCollectionType(type);

    const { data, error } = await supabase
      .from("collections")
      .select("id, collection_name, collection_type")
      .eq("status", "ACTIVE")
      .eq("collection_type", collectionType)
      .order("collection_name", { ascending: true });

    if (error) {
      setCollections([]);
      return;
    }

    setCollections((data as CollectionOption[]) ?? []);
  }, []);

  useEffect(() => {
    void loadPacket();
  }, [loadPacket]);

  useEffect(() => {
    if (packetType) {
      void loadCollections(packetType);
    }
  }, [packetType, loadCollections]);

  const hasLegacyAgreement = packet?.representation_agreement_id != null;
  const isDeleted = packet?.status === "DELETED";
  const propertyRequired =
    packetType !== "" && workflowRequiresProperty(packetType);

  const activeForms = sortPacketForms(
    (packet?.packet_forms ?? []).filter((form) => form.status === "ACTIVE"),
  );
  const collectionFormIds = activeForms
    .filter((form) => (form.origin ?? "collection") === "collection" && form.form_id)
    .map((form) => form.form_id as number);

  const handleSave = async () => {
    if (!packet || collectionId == null) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      await updatePacket(
        supabase,
        packetId,
        {
          label,
          packetType: packetType || null,
          collectionId,
          propertyId,
          notes,
          status,
        },
        { hasLegacyAgreement },
      );

      router.push(`/packets/${packetId}`);
      router.refresh();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save packet.",
      );
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading packet...</p>
    );
  }

  if (loadError || !packet) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {loadError ?? "Packet not found."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/">Back to packets</Link>
        </Button>
      </div>
    );
  }

  if (isDeleted) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This packet is deleted. Restore it before editing.
        </p>
        <Button variant="outline" asChild>
          <Link href={`/packets/${packetId}`}>View packet</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit packet</h1>
          <p className="text-sm text-muted-foreground">
            Update packet details, contacts, and forms.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/packets/${packetId}`}>Cancel</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Packet details</CardTitle>
          <CardDescription>
            {hasLegacyAgreement
              ? "This packet is linked to a legacy agreement. Packet type and collection cannot be changed."
              : "Core packet metadata."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="packet_label">Packet label *</Label>
            <Input
              id="packet_label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="packet_type">Packet type</Label>
            <select
              id="packet_type"
              className={fieldClassName}
              value={packetType}
              onChange={(event) => {
                const nextType = event.target.value as PacketWorkflowType | "";
                setPacketType(nextType);
                if (nextType) {
                  setCollectionId(null);
                }
              }}
              disabled={isSaving || hasLegacyAgreement}
            >
              <option value="">—</option>
              {PACKET_WORKFLOW_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatPacketWorkflowType(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection_id">Collection *</Label>
            <select
              id="collection_id"
              className={fieldClassName}
              value={collectionId ?? ""}
              onChange={(event) =>
                setCollectionId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              disabled={isSaving || hasLegacyAgreement || !packetType}
            >
              <option value="">Select collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.collection_name} (
                  {formatCollectionType(
                    collection.collection_type as CollectionType,
                  )}
                  )
                </option>
              ))}
            </select>
            {hasLegacyAgreement && packet.collections && (
              <p className="text-xs text-muted-foreground">
                Locked to {packet.collections.collection_name} (legacy agreement
                packet).
              </p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="packet_notes">Notes</Label>
            <Input
              id="packet_notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="packet_status">Status</Label>
            <select
              id="packet_status"
              className={fieldClassName}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={isSaving}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>
              Property{propertyRequired ? " *" : " (optional)"}
            </Label>
            {packet.properties && propertyMode === "existing" && propertyId && (
              <p className="text-sm text-muted-foreground">
                Current: {formatPropertyAddress(packet.properties)}
              </p>
            )}
            <PropertyPicker
              mode={propertyMode}
              propertyId={propertyId}
              property={property}
              onSelectionChange={(patch) => {
                if (patch.property_mode !== undefined) {
                  setPropertyMode(patch.property_mode);
                }
                if (patch.property_id !== undefined) {
                  setPropertyId(patch.property_id);
                }
                if (patch.property !== undefined) {
                  setProperty(patch.property);
                }
              }}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Packet contacts</CardTitle>
          <CardDescription>
            Assign contacts and roles for this packet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PacketContactsLiveEditor
            packetId={packetId}
            packetContacts={packet.packet_contacts ?? []}
            packetType={packetType || null}
            disabled={isSaving}
            onContactsChange={() => void loadPacket()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Packet forms</CardTitle>
          <CardDescription>
            Add internal forms, upload external documents, remove, or reorder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PacketFormsLiveEditor
            packetId={packetId}
            forms={packet.packet_forms ?? []}
            collectionFormIds={collectionFormIds}
            disabled={isSaving}
            onFormsChange={() => void loadPacket()}
          />
        </CardContent>
      </Card>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save packet"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={`/packets/${packetId}`}>Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
