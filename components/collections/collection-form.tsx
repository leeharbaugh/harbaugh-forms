"use client";

import { FormPicker } from "@/components/collections/form-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLECTION_TYPES,
  type CollectionCreateScope,
  type CollectionInput,
  type CollectionType,
  formatCollectionReference,
  formatCollectionStatus,
  formatCollectionType,
  isCollectionDeleted,
  validateCollectionInput,
} from "@/lib/types/collection";

type OrganizationOption = {
  id: string;
  name: string;
};

type CollectionFormProps = {
  value: CollectionInput;
  onChange: (value: CollectionInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  mode: "create" | "edit" | "view";
  packetTemplateId?: number | null;
  status?: string;
  onDelete?: () => void;
  onRestore?: () => void;
  isDeleting?: boolean;
  isRestoring?: boolean;
  /** When creating, available organizations for ORG_ADMIN / app admin. */
  organizationOptions?: OrganizationOption[];
  /** View/edit: organization display name for organization-scoped collections. */
  organizationName?: string | null;
  /** View/edit: library scope of the existing collection. */
  existingScope?: string | null;
};

export function CollectionForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  mode,
  packetTemplateId = null,
  status = "ACTIVE",
  onDelete,
  onRestore,
  isDeleting = false,
  isRestoring = false,
  organizationOptions = [],
  organizationName = null,
  existingScope = null,
}: CollectionFormProps) {
  const readOnly = mode === "view";
  const isDeleted = isCollectionDeleted({ status });
  const canChooseOrganization =
    mode === "create" && organizationOptions.length > 0;

  const setField = <K extends keyof CollectionInput>(
    key: K,
    fieldValue: CollectionInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;

    const validationError = validateCollectionInput(value, {
      forCreate: mode === "create",
    });
    if (validationError) return;
    onSubmit();
  };

  const validationError = readOnly
    ? null
    : validateCollectionInput(value, { forCreate: mode === "create" });

  const formsValidationError =
    validationError &&
    (validationError.includes("form template") ||
      validationError.includes("form templates") ||
      validationError.includes("form is required") ||
      validationError.includes("form can only"))
      ? validationError
      : null;

  const generalValidationError =
    validationError && !formsValidationError ? validationError : null;

  const scopeLabel =
    existingScope === "ORGANIZATION"
      ? organizationName
        ? `Organization · ${organizationName}`
        : "Organization"
      : existingScope === "PRIVATE"
        ? "Private"
        : existingScope === "GLOBAL"
          ? "Organization"
          : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {packetTemplateId != null && (
          <div className="space-y-2">
            <Label htmlFor="packet_template_reference_id">ID</Label>
            <Input
              id="packet_template_reference_id"
              value={formatCollectionReference(packetTemplateId)}
              disabled
              readOnly
            />
          </div>
        )}

        {readOnly && isDeleted && (
          <div className="space-y-2">
            <Label>Status</Label>
            <div>
              <Badge variant="destructive">
                {formatCollectionStatus(status)}
              </Badge>
            </div>
          </div>
        )}

        {(readOnly || mode === "edit") && scopeLabel ? (
          <div className="space-y-2">
            <Label>Scope</Label>
            <p className="text-sm text-muted-foreground">{scopeLabel}</p>
            {mode === "edit" ? (
              <p className="text-xs text-muted-foreground">
                Scope and organization ownership cannot be changed here.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="collection_name">Packet name *</Label>
          <Input
            id="collection_name"
            value={value.collection_name}
            onChange={(event) => setField("collection_name", event.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="collection_type">Collection type *</Label>
          <Select
            id="collection_type"
            value={value.collection_type}
            onChange={(event) =>
              setField("collection_type", event.target.value as CollectionType)
            }
            disabled={readOnly}
            required
          >
            {COLLECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatCollectionType(type)}
              </option>
            ))}
          </Select>
        </div>

        {canChooseOrganization ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="collection_scope">Scope *</Label>
              <Select
                id="collection_scope"
                value={value.scope}
                onChange={(event) => {
                  const scope = event.target.value as CollectionCreateScope;
                  onChange({
                    ...value,
                    scope,
                    organization_id:
                      scope === "ORGANIZATION"
                        ? value.organization_id ??
                          organizationOptions[0]?.id ??
                          null
                        : null,
                  });
                }}
              >
                <option value="PRIVATE">Private</option>
                <option value="ORGANIZATION">Organization</option>
              </Select>
            </div>
            {value.scope === "ORGANIZATION" ? (
              <div className="space-y-2">
                <Label htmlFor="collection_organization">Organization *</Label>
                <Select
                  id="collection_organization"
                  value={value.organization_id ?? ""}
                  onChange={(event) =>
                    setField(
                      "organization_id",
                      event.target.value || null,
                    )
                  }
                  required
                >
                  <option value="" disabled>
                    Select organization
                  </option>
                  {organizationOptions.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={3}
            value={value.description}
            onChange={(event) => setField("description", event.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      <FormPicker
        selectedForms={value.forms}
        onChange={(forms) => setField("forms", forms)}
        disabled={readOnly}
        error={formsValidationError}
      />

      {(error || generalValidationError) && (
        <p className="text-sm text-destructive">
          {error ?? generalValidationError}
        </p>
      )}

      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting || isDeleting || isRestoring}
        >
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {readOnly && !isDeleted && onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={isDeleting || isRestoring}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        )}
        {readOnly && isDeleted && onRestore && (
          <Button
            type="button"
            onClick={onRestore}
            disabled={isDeleting || isRestoring}
          >
            {isRestoring ? "Restoring..." : "Restore"}
          </Button>
        )}
        {!readOnly && (
          <Button
            type="submit"
            disabled={isSubmitting || !!validationError}
          >
            {isSubmitting
              ? "Saving…"
              : mode === "create"
                ? "Add packet template"
                : "Save changes"}
          </Button>
        )}
      </FormActions>
    </form>
  );
}
