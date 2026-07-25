"use client";

import { ContactPicker } from "@/components/contacts/contact-picker";
import { PropertyPicker } from "@/components/properties/property-picker";
import { usePropertyDuplicateConfirm } from "@/components/properties/use-property-duplicate-confirm";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { saveNewPropertyWithDuplicateHandling } from "@/lib/property-duplicate";
import { buildPacketContactAssignments } from "@/lib/types/packet-contact";
import {
  createCustomPacket,
  validateCreateCustomPacketInput,
} from "@/lib/types/packet";
import {
  getPacketCreateFlowCopy,
  getPacketCreateTitle,
} from "@/lib/types/packet-workflow";
import {
  emptyPropertyInput,
  type PropertyInput,
  type PropertySelectionMode,
} from "@/lib/types/property";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CreateCustomPacketFormProps = {
  onCancel: () => void;
};

export function CreateCustomPacketForm({
  onCancel,
}: CreateCustomPacketFormProps) {
  const router = useRouter();
  const flowCopy = getPacketCreateFlowCopy("custom");
  const { promptDuplicate, dialog: duplicateDialog } = usePropertyDuplicateConfirm();

  const [label, setLabel] = useState("");
  const [contactIds, setContactIds] = useState<number[]>([]);
  const [propertyMode, setPropertyMode] =
    useState<PropertySelectionMode>("existing");
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [property, setProperty] = useState<PropertyInput>(emptyPropertyInput());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validationError = validateCreateCustomPacketInput({ label });

  const handleCreate = async () => {
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const supabase = createClient();

    try {
      let resolvedPropertyId: number | null = null;
      if (propertyMode === "new" && property.street_address.trim()) {
        resolvedPropertyId = await saveNewPropertyWithDuplicateHandling(
          supabase,
          property,
          promptDuplicate,
        );
        if (resolvedPropertyId === null) {
          setIsSubmitting(false);
          return;
        }
      } else if (propertyMode === "existing") {
        resolvedPropertyId = propertyId;
      }

      const { packetId } = await createCustomPacket(supabase, {
        label,
        contacts: buildPacketContactAssignments("custom", contactIds),
        propertyId: resolvedPropertyId,
      });

      router.push(`/packets/${packetId}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to create packet.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {duplicateDialog}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">
            {getPacketCreateTitle("custom")}
          </h2>
          <ol className="mt-1 list-none space-y-0.5 text-xs text-muted-foreground">
            {flowCopy.steps.map((stepText) => (
              <li key={stepText}>{stepText}</li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom_packet_label">Packet name *</Label>
          <Input
            id="custom_packet_label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={isSubmitting}
            placeholder="e.g. 123 Main St closing docs"
          />
        </div>

        <div className="space-y-2">
          <ContactPicker
            selectedContactIds={contactIds}
            onChange={setContactIds}
            disabled={isSubmitting}
            searchLabel={flowCopy.contacts.search}
            selectedLabel={flowCopy.contacts.selected}
            emptySelectedMessage={flowCopy.contacts.empty}
          />
        </div>

        <div className="space-y-2">
          <Label>{flowCopy.propertyLabel}</Label>
          <PropertyPicker
            mode={propertyMode}
            propertyId={propertyId}
            property={property}
            onSelectionChange={(patch) => {
              setSubmitError(null);
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
            disabled={isSubmitting}
          />
        </div>

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <FormActions>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSubmitting || !!validationError}
          >
            {isSubmitting ? "Creating…" : "Create custom packet"}
          </Button>
        </FormActions>
      </div>
    </>
  );
}
