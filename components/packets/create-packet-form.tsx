"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  type BuyerRepAgreementListItem,
  formatAgreementReference,
  formatDate,
  getOrderedContactNames,
} from "@/lib/types/buyer-rep-agreement";
import {
  generatePacketFromAgreement,
  validateGeneratePacketInput,
} from "@/lib/types/packet";
import {
  type CollectionFormLink,
  type CollectionType,
  formatCollectionType,
} from "@/lib/types/collection";
import {
  type PacketWorkflowType,
  workflowToCollectionType,
} from "@/lib/types/packet-workflow";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type CollectionOption = {
  id: number;
  collection_name: string;
  collection_type: string;
  description: string | null;
  collection_forms?: CollectionFormLink[];
};

type CreatePacketFromAgreementFormProps = {
  workflowType: PacketWorkflowType;
  agreementId: number;
  onCancel: () => void;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

const PACKET_TEMPLATE_SELECT = `
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

const AGREEMENT_SELECT = `
  *,
  representation_agreement_clients(
    sort_order,
    status,
    contacts(*)
  )
`;

export function CreatePacketFromAgreementForm({
  workflowType,
  agreementId,
  onCancel,
}: CreatePacketFromAgreementFormProps) {
  const router = useRouter();
  const [agreement, setAgreement] = useState<BuyerRepAgreementListItem | null>(
    null,
  );
  const [templates, setTemplates] = useState<CollectionOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const supabase = createClient();

    const collectionType = workflowToCollectionType(workflowType);

    const [agreementResult, templatesResult] = await Promise.all([
      supabase
        .from("representation_agreements")
        .select(AGREEMENT_SELECT)
        .eq("id", agreementId)
        .eq("status", "ACTIVE")
        .single(),
      supabase
        .from("collections")
        .select(PACKET_TEMPLATE_SELECT)
        .eq("status", "ACTIVE")
        .eq("collection_type", collectionType)
        .order("collection_name", { ascending: true }),
    ]);

    if (agreementResult.error || !agreementResult.data) {
      setLoadError(
        agreementResult.error?.message ?? "Representation agreement not found.",
      );
      setAgreement(null);
      setTemplates([]);
      setIsLoading(false);
      return;
    }

    if (templatesResult.error) {
      setLoadError(templatesResult.error.message);
      setAgreement(agreementResult.data as BuyerRepAgreementListItem);
      setTemplates([]);
      setIsLoading(false);
      return;
    }

    const templateOptions =
      (templatesResult.data as CollectionOption[]) ?? [];

    setAgreement(agreementResult.data as BuyerRepAgreementListItem);
    setTemplates(templateOptions);
    setSelectedTemplateId(templateOptions[0]?.id ?? null);
    setIsLoading(false);
  }, [agreementId, workflowType]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );

  const selectedForms = (selectedTemplate?.collection_forms ?? [])
    .filter((link) => link.status === "ACTIVE")
    .sort((a, b) => a.sort_order - b.sort_order);

  const validationError = validateGeneratePacketInput(
    selectedTemplateId,
    agreementId,
  );

  const formsValidationError =
    selectedTemplate && selectedForms.length === 0
      ? "The selected packet template must contain at least one form."
      : null;

  const handleGenerate = async () => {
    const error =
      validationError ??
      formsValidationError ??
      (selectedTemplateId == null ? "A packet template is required." : null);

    if (error) {
      setSubmitError(error);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();

    try {
      const { packetId } = await generatePacketFromAgreement(
        supabase,
        agreementId,
        selectedTemplateId as number,
      );

      router.push(`/packets/${packetId}`);
    } catch (generateError) {
      setSubmitError(
        generateError instanceof Error
          ? generateError.message
          : "Failed to generate packet.",
      );
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading generation options...</p>
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

  return (
    <div className="space-y-6">
      {agreement && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm">
          <p className="font-medium">{getOrderedContactNames(agreement)}</p>
          <p className="text-muted-foreground">
            {formatAgreementReference(agreement.id)} · Effective{" "}
            {formatDate(agreement.effective_date)}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="collection_id">Collection *</Label>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active {formatCollectionType(workflowToCollectionType(workflowType)).toLowerCase()} collections found.
            Create one under Collections first.
          </p>
        ) : (
          <select
            id="collection_id"
            className={fieldClassName}
            value={selectedTemplateId ?? ""}
            onChange={(event) =>
              setSelectedTemplateId(
                event.target.value ? Number(event.target.value) : null,
              )
            }
            disabled={isSubmitting}
            required
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.collection_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedTemplate && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Packet details</p>
            <p className="text-sm text-muted-foreground">
              {formatCollectionType(selectedTemplate.collection_type as CollectionType)}
              {selectedTemplate.description
                ? ` · ${selectedTemplate.description}`
                : ""}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Included forms</Label>
            {selectedForms.length === 0 ? (
              <p className="text-sm text-destructive">
                This packet template has no active forms.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {selectedForms.map((link, index) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-3 p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {index + 1}.{" "}
                        {link.forms?.form_name ??
                          `Form #${link.form_id}`}
                      </p>
                      {link.forms?.form_code && (
                        <p className="text-muted-foreground">
                          {link.forms.form_code}
                          {link.is_required ? " · Required" : " · Optional"}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className={cn("text-sm text-muted-foreground")}>
            Legacy: packet label is generated from contact names, collection name,
            and today&apos;s date via generatePacketFromAgreement().
          </p>
        </div>
      )}

      {(submitError || validationError || formsValidationError) && (
        <p className="text-sm text-destructive">
          {submitError ?? formsValidationError ?? validationError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={
            isSubmitting ||
            templates.length === 0 ||
            !!validationError ||
            !!formsValidationError
          }
        >
          {isSubmitting ? "Generating..." : "Generate packet"}
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
