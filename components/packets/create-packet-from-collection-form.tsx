"use client";

import { ContactPicker } from "@/components/contacts/contact-picker";
import { PacketFormsDraftEditor } from "@/components/packets/packet-forms-draft-editor";
import { PropertyPicker } from "@/components/properties/property-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { type CollectionFormLink } from "@/lib/types/collection";
import { buildPacketContactAssignments } from "@/lib/types/packet-contact";
import type { DraftExternalPacketForm } from "@/lib/types/packet-form";
import {
  createPacketFromCollection,
  validateCreatePacketFromCollectionInput,
} from "@/lib/types/packet";
import {
  formatPacketWorkflowType,
  getPacketContactLabels,
  getPacketCreateTitle,
  getPropertyRequiredMessage,
  NO_COLLECTIONS_MESSAGE,
  type PacketWorkflowType,
  workflowRequiresProperty,
  workflowToCollectionType,
} from "@/lib/types/packet-workflow";
import {
  emptyPropertyInput,
  normalizePropertyInput,
  type PropertyInput,
  type PropertySelectionMode,
  validatePropertyInput,
} from "@/lib/types/property";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type CollectionOption = {
  id: number;
  collection_name: string;
  collection_type: string;
  description: string | null;
  collection_forms?: CollectionFormLink[];
};

type CreatePacketFromCollectionFormProps = {
  workflowType: PacketWorkflowType;
  onCancel: () => void;
};

type CreateStep = "details" | "forms";

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

const COLLECTION_SELECT = `
  *,
  collection_forms(
    id,
    form_id,
    sort_order,
    is_required,
    status,
    forms(
      id,
      form_name,
      form_code
    )
  )
`;

async function resolvePropertyId(
  propertyMode: PropertySelectionMode,
  propertyId: number | null,
  property: PropertyInput,
  required: boolean,
  workflowType: PacketWorkflowType,
): Promise<number | null> {
  const supabase = createClient();

  if (propertyMode === "new") {
    if (!property.street_address.trim()) {
      if (required) {
        throw new Error(getPropertyRequiredMessage(workflowType));
      }
      return null;
    }

    const validationError = validatePropertyInput(property);
    if (validationError) {
      throw new Error(validationError);
    }

    const { data, error } = await supabase
      .from("properties")
      .insert(normalizePropertyInput(property))
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create property.");
    }

    return data.id as number;
  }

  if (propertyId == null) {
    if (required) {
      throw new Error(getPropertyRequiredMessage(workflowType));
    }
    return null;
  }

  return propertyId;
}

export function CreatePacketFromCollectionForm({
  workflowType,
  onCancel,
}: CreatePacketFromCollectionFormProps) {
  const router = useRouter();
  const contactLabels = getPacketContactLabels(workflowType);
  const propertyRequired = workflowRequiresProperty(workflowType);

  const [step, setStep] = useState<CreateStep>("details");
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(
    null,
  );
  const [contactIds, setContactIds] = useState<number[]>([]);
  const [propertyMode, setPropertyMode] =
    useState<PropertySelectionMode>("existing");
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [property, setProperty] = useState<PropertyInput>(emptyPropertyInput());
  const [additionalInternalFormIds, setAdditionalInternalFormIds] = useState<
    number[]
  >([]);
  const [externalForms, setExternalForms] = useState<DraftExternalPacketForm[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const collectionType = workflowToCollectionType(workflowType);

    const { data, error } = await supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .eq("status", "ACTIVE")
      .eq("collection_type", collectionType)
      .order("collection_name", { ascending: true });

    if (error) {
      setLoadError(error.message);
      setCollections([]);
      setIsLoading(false);
      return;
    }

    const options = (data as CollectionOption[]) ?? [];
    setCollections(options);
    setSelectedCollectionId(options[0]?.id ?? null);
    setIsLoading(false);
  }, [workflowType]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  const selectedCollection = collections.find(
    (collection) => collection.id === selectedCollectionId,
  );

  const selectedForms = (selectedCollection?.collection_forms ?? []).filter(
    (link) => link.status === "ACTIVE",
  );

  const validationError = validateCreatePacketFromCollectionInput({
    collectionId: selectedCollectionId,
    packetType: workflowType,
    contactIds,
    propertyId: propertyRequired
      ? propertyMode === "existing"
        ? propertyId
        : null
      : propertyMode === "existing"
        ? propertyId
        : null,
  });

  const propertyValidationError =
    propertyRequired && propertyMode === "existing" && propertyId == null
      ? getPropertyRequiredMessage(workflowType)
      : propertyRequired &&
          propertyMode === "new" &&
          !property.street_address.trim()
        ? getPropertyRequiredMessage(workflowType)
        : propertyRequired &&
            propertyMode === "new" &&
            property.street_address.trim()
          ? validatePropertyInput(property)
          : !propertyRequired &&
              propertyMode === "new" &&
              property.street_address.trim()
            ? validatePropertyInput(property)
            : null;

  const formsValidationError =
    selectedCollection && selectedForms.length === 0
      ? "The selected collection must contain at least one active form."
      : null;

  const handleCollectionChange = (nextCollectionId: number | null) => {
    setSelectedCollectionId(nextCollectionId);
    setAdditionalInternalFormIds([]);
    setExternalForms([]);
  };

  const handleContinueToForms = () => {
    const error =
      validationError ??
      formsValidationError ??
      propertyValidationError ??
      (selectedCollectionId == null ? "A collection is required." : null);

    if (error) {
      setSubmitError(error);
      return;
    }

    setSubmitError(null);
    setStep("forms");
  };

  const handleCreate = async () => {
    const error =
      validationError ??
      formsValidationError ??
      propertyValidationError ??
      (selectedCollectionId == null ? "A collection is required." : null);

    if (error) {
      setSubmitError(error);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();

    try {
      const resolvedPropertyId = await resolvePropertyId(
        propertyMode,
        propertyId,
        property,
        propertyRequired,
        workflowType,
      );

      const { packetId } = await createPacketFromCollection(supabase, {
        collectionId: selectedCollectionId as number,
        packetType: workflowType,
        contacts: buildPacketContactAssignments(workflowType, contactIds),
        propertyId: resolvedPropertyId,
        additionalInternalFormIds,
        externalForms,
      });

      router.push(`/packets/${packetId}`);
    } catch (createError) {
      setSubmitError(
        createError instanceof Error
          ? createError.message
          : "Failed to create packet.",
      );
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading collections...</p>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  if (step === "forms") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Review forms</h2>
            <p className="text-sm text-muted-foreground">
              Confirm default collection forms and add optional or external
              documents before creating the packet.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep("details")}
            disabled={isSubmitting}
          >
            Back
          </Button>
        </div>

        <PacketFormsDraftEditor
          collectionForms={selectedCollection?.collection_forms ?? []}
          additionalInternalFormIds={additionalInternalFormIds}
          onAdditionalInternalFormIdsChange={setAdditionalInternalFormIds}
          externalForms={externalForms}
          onExternalFormsChange={setExternalForms}
          disabled={isSubmitting}
        />

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSubmitting || !!formsValidationError}
          >
            {isSubmitting ? "Creating..." : "Create packet"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {getPacketCreateTitle(workflowType)}
        </h2>
      </div>

      <div className="space-y-2">
        <Label htmlFor="collection_id">
          {formatPacketWorkflowType(workflowType)} collection *
        </Label>
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {NO_COLLECTIONS_MESSAGE}
          </p>
        ) : (
          <select
            id="collection_id"
            className={fieldClassName}
            value={selectedCollectionId ?? ""}
            onChange={(event) =>
              handleCollectionChange(
                event.target.value ? Number(event.target.value) : null,
              )
            }
            disabled={isSubmitting}
            required
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.collection_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <ContactPicker
          selectedContactIds={contactIds}
          onChange={setContactIds}
          disabled={isSubmitting}
          searchLabel={contactLabels.search}
          selectedLabel={contactLabels.selected}
          emptySelectedMessage={contactLabels.empty}
          error={
            contactIds.length === 0 && submitError
              ? "At least one contact is required."
              : null
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Property{propertyRequired ? " *" : " (optional)"}</Label>
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
          disabled={isSubmitting}
        />
      </div>

      {(submitError || validationError || formsValidationError || propertyValidationError) && (
        <p className="text-sm text-destructive">
          {submitError ??
            propertyValidationError ??
            formsValidationError ??
            validationError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleContinueToForms}
          disabled={
            isSubmitting ||
            collections.length === 0 ||
            !!validationError ||
            !!formsValidationError ||
            !!propertyValidationError
          }
        >
          Continue to review forms
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
