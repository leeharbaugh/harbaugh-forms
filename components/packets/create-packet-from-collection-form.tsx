"use client";

import { ContactPicker } from "@/components/contacts/contact-picker";
import { PacketFormsDraftEditor } from "@/components/packets/packet-forms-draft-editor";
import { PropertyPicker } from "@/components/properties/property-picker";
import { usePropertyDuplicateConfirm } from "@/components/properties/use-property-duplicate-confirm";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { saveNewPropertyWithDuplicateHandling } from "@/lib/property-duplicate";
import { type CollectionFormLink } from "@/lib/types/collection";
import { buildPacketContactAssignments } from "@/lib/types/packet-contact";
import { getListingOwnerKindFromCollection } from "@/lib/types/listing-packet-kind";
import type { DraftExternalPacketForm } from "@/lib/types/packet-form";
import {
  createPacketFromCollection,
  validateCreatePacketFromCollectionInput,
} from "@/lib/types/packet";
import {
  getPacketCreateFlowCopy,
  getPacketCreateTitle,
  getPropertyRequiredMessage,
  NO_COLLECTIONS_MESSAGE,
  type PacketWorkflowType,
  workflowRequiresProperty,
  workflowSupportsPropertySelection,
  workflowToCollectionType,
} from "@/lib/types/packet-workflow";
import {
  emptyPropertyInput,
  type PropertyInput,
  type PropertySelectionMode,
  validatePropertyInput,
} from "@/lib/types/property";
import type { PropertyDuplicatePromptInfo } from "@/lib/property-duplicate";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  onDuplicate: (info: PropertyDuplicatePromptInfo) => Promise<"update" | "cancel">,
): Promise<number | null> {
  const supabase = createClient();

  if (propertyMode === "new") {
    if (!property.street_address.trim()) {
      if (required) {
        throw new Error(getPropertyRequiredMessage(workflowType));
      }
      return null;
    }

    return saveNewPropertyWithDuplicateHandling(
      supabase,
      property,
      onDuplicate,
    );
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
  const showPropertySelection = workflowSupportsPropertySelection(workflowType);
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
  const reviewStepTopRef = useRef<HTMLDivElement>(null);
  const { promptDuplicate, dialog: duplicateDialog } =
    usePropertyDuplicateConfirm();

  useEffect(() => {
    if (step !== "forms") {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (reviewStepTopRef.current) {
        reviewStepTopRef.current.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
        return;
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [step]);

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

  const listingOwnerKind = useMemo(() => {
    if (workflowType !== "listing") {
      return "seller" as const;
    }
    return getListingOwnerKindFromCollection(selectedCollection);
  }, [workflowType, selectedCollection]);

  const createFlow = getPacketCreateFlowCopy(workflowType, listingOwnerKind);
  const contactLabels = createFlow.contacts;

  const selectedForms = (selectedCollection?.collection_forms ?? []).filter(
    (link) => link.status === "ACTIVE",
  );

  const validationError = validateCreatePacketFromCollectionInput({
    collectionId: selectedCollectionId,
    packetType: workflowType,
    contactIds,
    propertyId: showPropertySelection ? propertyId : null,
    listingOwnerKind,
  });

  const propertyValidationError = (() => {
    if (!showPropertySelection || !propertyRequired || propertyId != null) {
      return null;
    }

    if (propertyMode === "new") {
      const fieldError = validatePropertyInput(property);
      if (fieldError) {
        return fieldError;
      }
      return "Save and select the new property before continuing.";
    }

    return getPropertyRequiredMessage(workflowType);
  })();

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
      (selectedCollectionId == null ? "Choose a collection before continuing." : null);

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
      (selectedCollectionId == null ? "Choose a collection before continuing." : null);

    if (error) {
      setSubmitError(error);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();

    try {
      const resolvedPropertyId = showPropertySelection
        ? await resolvePropertyId(
            propertyMode,
            propertyId,
            property,
            propertyRequired,
            workflowType,
            promptDuplicate,
          )
        : null;

      if (
        showPropertySelection &&
        propertyMode === "new" &&
        property.street_address.trim() &&
        resolvedPropertyId === null
      ) {
        setIsSubmitting(false);
        return;
      }

      const { packetId } = await createPacketFromCollection(supabase, {
        collectionId: selectedCollectionId as number,
        packetType: workflowType,
        contacts: buildPacketContactAssignments(
          workflowType,
          contactIds,
          listingOwnerKind,
        ),
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
        <FormActions>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </FormActions>
      </div>
    );
  }

  if (step === "forms") {
    return (
      <>
        {duplicateDialog}
        <div ref={reviewStepTopRef} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Review forms</h2>
            <p className="text-sm text-muted-foreground">
              Confirm the collection forms, add any optional documents, then
              create the packet.
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
            disabled={isSubmitting || !!formsValidationError}
          >
            {isSubmitting ? "Creating..." : "Create packet"}
          </Button>
        </FormActions>
      </div>
      </>
    );
  }

  return (
    <>
      {duplicateDialog}
      <div className="space-y-8">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">
          {getPacketCreateTitle(workflowType)}
        </h2>
        <ol className="list-none space-y-0.5 text-xs text-muted-foreground">
          {createFlow.steps.map((stepText) => (
            <li key={stepText}>{stepText}</li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor="collection_id">
          {createFlow.collectionLabel} *
        </Label>
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {NO_COLLECTIONS_MESSAGE}
          </p>
        ) : (
          <Select
            id="collection_id"
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
          </Select>
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
              ? contactLabels.required
              : null
          }
        />
      </div>

      {showPropertySelection && createFlow.propertyLabel && (
        <div className="space-y-2">
          <Label>
            {createFlow.propertyLabel}
            {propertyRequired ? " *" : " (optional)"}
          </Label>
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
            requireSavedNewProperty={propertyRequired}
          />
        </div>
      )}

      {(submitError || validationError || formsValidationError || propertyValidationError) && (
        <p className="text-sm text-destructive">
          {submitError ??
            propertyValidationError ??
            formsValidationError ??
            validationError}
        </p>
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
      </FormActions>
    </div>
    </>
  );
}
