"use client";

import { PropertyForm } from "@/components/properties/property-form";
import { usePropertyDuplicateConfirm } from "@/components/properties/use-property-duplicate-confirm";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPageHeader } from "@/components/list-page-header";
import { ListRowActions } from "@/components/list-row-actions";
import {
  ResizableDataTable,
  ResizableDataTableActionsCell,
  ResizableDataTableCell,
  ResizableDataTableRow,
  type ResizableDataTableColumn,
} from "@/components/resizable-data-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { RecordStatusBadge } from "@/components/ui/list-badges";
import { createClient } from "@/lib/supabase/client";
import { saveNewPropertyWithDuplicateHandling } from "@/lib/property-duplicate";
import {
  extractPropertyHoaFormFields,
  loadPrimaryActivePropertyHoa,
  syncPrimaryPropertyHoaFromForm,
} from "@/lib/property-hoa-storage";
import {
  assertNoLiveAddressConflict,
  isUniqueViolationError,
  PROPERTY_DUPLICATE_ADDRESS_MESSAGE,
  restoreProperty,
} from "@/lib/property-uniqueness";
import {
  type Property,
  emptyPropertyInput,
  formatPropertyReference,
  formatPropertyType,
  normalizePropertyInput,
  propertyToInput,
  validatePropertyInput,
} from "@/lib/types/property";
import { useCallback, useEffect, useState } from "react";

type FormMode = "hidden" | "create" | "edit" | "view";

const PROPERTY_TABLE_COLUMNS: ResizableDataTableColumn[] = [
  { id: "id", label: "ID", defaultWidth: 72, minWidth: 48 },
  { id: "street", label: "Street address", defaultWidth: 200 },
  { id: "unit", label: "Unit", defaultWidth: 80, minWidth: 56 },
  { id: "city", label: "City", defaultWidth: 120 },
  { id: "state", label: "State", defaultWidth: 64, minWidth: 48 },
  { id: "zip", label: "ZIP", defaultWidth: 80, minWidth: 56 },
  { id: "county", label: "County", defaultWidth: 120 },
  { id: "propertyType", label: "Property type", defaultWidth: 140 },
  { id: "mls", label: "MLS number", defaultWidth: 120 },
  {
    id: "actions",
    label: "Actions",
    defaultWidth: 224,
    isActions: true,
  },
];

export function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingPropertyId, setEditingPropertyId] = useState<number | null>(
    null,
  );
  const [formValue, setFormValue] = useState(emptyPropertyInput());
  const { promptDuplicate, dialog: duplicateDialog } =
    usePropertyDuplicateConfirm();
  const [propertyPendingDelete, setPropertyPendingDelete] =
    useState<Property | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoringId, setIsRestoringId] = useState<number | null>(null);

  const loadProperties = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("properties")
      .select("*")
      .order("street_address", { ascending: true })
      .order("city", { ascending: true });

    if (showDeleted) {
      query = query.in("status", ["ACTIVE", "DELETED"]);
    } else {
      query = query.eq("status", "ACTIVE");
    }

    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      query = query.or(
        [
          `street_address.ilike.${term}`,
          `city.ilike.${term}`,
          `zip.ilike.${term}`,
          `county.ilike.${term}`,
          `mls_number.ilike.${term}`,
          `tax_id.ilike.${term}`,
          `addition.ilike.${term}`,
        ].join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
      setProperties([]);
    } else {
      setProperties((data as Property[]) ?? []);
    }

    setIsLoading(false);
  }, [searchQuery, showDeleted]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadProperties();
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadProperties]);

  const closeForm = () => {
    setFormMode("hidden");
    setEditingPropertyId(null);
    setFormValue(emptyPropertyInput());
    setFormError(null);
  };

  const openCreateForm = () => {
    setFormMode("create");
    setEditingPropertyId(null);
    setFormValue(emptyPropertyInput());
    setFormError(null);
  };

  const openPropertyForm = (property: Property, mode: "edit" | "view") => {
    setFormMode(mode);
    setEditingPropertyId(property.id);
    setFormValue(propertyToInput(property));
    setFormError(null);

    void (async () => {
      try {
        const supabase = createClient();
        const primaryHoa = await loadPrimaryActivePropertyHoa(
          supabase,
          property.id,
        );
        setFormValue(propertyToInput(property, primaryHoa));
      } catch (loadError) {
        setFormError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load HOA details.",
        );
      }
    })();
  };

  const handleSave = async () => {
    const validationError = validatePropertyInput(formValue);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizePropertyInput(formValue);
    const hoaFields = extractPropertyHoaFormFields(formValue);
    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    try {
      if (formMode === "create") {
        const createdPropertyId = await saveNewPropertyWithDuplicateHandling(
          supabase,
          formValue,
          promptDuplicate,
        );

        if (createdPropertyId === null) {
          setIsSubmitting(false);
          closeForm();
          return;
        }
      }

      if (formMode === "edit" && editingPropertyId !== null) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        await assertNoLiveAddressConflict(
          supabase,
          formValue,
          user?.id ?? null,
          editingPropertyId,
        );

        const { error } = await supabase
          .from("properties")
          .update(normalized)
          .eq("id", editingPropertyId)
          .eq("status", "ACTIVE");

        if (error) {
          if (isUniqueViolationError(error)) {
            setFormError(PROPERTY_DUPLICATE_ADDRESS_MESSAGE);
          } else {
            setFormError(error.message);
          }
          setIsSubmitting(false);
          return;
        }

        await syncPrimaryPropertyHoaFromForm(
          supabase,
          editingPropertyId,
          hoaFields,
        );
      }
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save property.",
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    closeForm();
    await loadProperties();
  };

  const openDeleteDialog = (property: Property) => {
    setPropertyPendingDelete(property);
    setListError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) {
      return;
    }
    setPropertyPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!propertyPendingDelete) {
      return;
    }

    setIsDeleting(true);
    setListError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("properties")
      .update({ status: "DELETED" })
      .eq("id", propertyPendingDelete.id)
      .eq("status", "ACTIVE");

    setIsDeleting(false);

    if (error) {
      setListError(error.message);
      return;
    }

    if (editingPropertyId === propertyPendingDelete.id) {
      closeForm();
    }

    setPropertyPendingDelete(null);
    await loadProperties();
  };

  const handleRestore = async (property: Property) => {
    setIsRestoringId(property.id);
    setListError(null);
    const supabase = createClient();
    try {
      await restoreProperty(supabase, property.id);
      await loadProperties();
    } catch (restoreError) {
      setListError(
        restoreError instanceof Error
          ? restoreError.message
          : "Failed to restore property.",
      );
    } finally {
      setIsRestoringId(null);
    }
  };

  const formTitle =
    formMode === "create"
      ? "Add property"
      : formMode === "edit"
        ? "Edit property"
        : "View property";

  const formDescription =
    formMode === "create"
      ? "Create a new active property record."
      : formMode === "edit"
        ? "Update the selected property record."
        : "Read-only view of the property record.";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {duplicateDialog}
      <ConfirmDeleteDialog
        open={propertyPendingDelete != null}
        objectType="property"
        itemName={
          propertyPendingDelete
            ? `${formatPropertyReference(propertyPendingDelete.id)} at ${propertyPendingDelete.street_address}, ${propertyPendingDelete.city}`
            : null
        }
        canRestore
        isConfirming={isDeleting}
        confirmingLabel="Deleting…"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteDialog}
      />
      <ListPageHeader
        title="Properties"
        description="Manage properties for Harbaugh Forms."
        action={
          formMode === "hidden" ? (
            <Button onClick={openCreateForm}>Add property</Button>
          ) : undefined
        }
      />

      {formMode !== "hidden" && (
        <Card>
          <CardHeader>
            <CardTitle>{formTitle}</CardTitle>
            <CardDescription>{formDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <PropertyForm
              value={formValue}
              onChange={setFormValue}
              onSubmit={() => void handleSave()}
              onCancel={closeForm}
              isSubmitting={isSubmitting}
              error={formError}
              mode={formMode === "view" ? "view" : formMode}
              propertyId={editingPropertyId}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {showDeleted ? "Properties" : "Active properties"}
          </CardTitle>
          <CardDescription>
            Search by street address, city, ZIP, county, MLS number, tax ID, or
            addition.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="Search properties..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="flex-1"
            />
            <div className="flex items-center gap-2">
              <AppCheckbox
                id="show-deleted-properties"
                checked={showDeleted}
                onCheckedChange={(checked) => setShowDeleted(checked === true)}
              />
              <Label htmlFor="show-deleted-properties" className="text-sm">
                Show deleted
              </Label>
            </div>
          </div>

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading properties…</p>
          ) : properties.length === 0 ? (
            <ListEmptyState
              title="No properties yet"
              description="Add a property address to use in packets and agreements."
              action={
                formMode === "hidden" ? (
                  <Button size="sm" onClick={openCreateForm}>
                    Add property
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ResizableDataTable
              storageKey="harbaugh-properties-list-column-widths"
              tablePreferencesKey="properties_list"
              columns={PROPERTY_TABLE_COLUMNS}
            >
              {properties.map((property) => {
                const deleted = property.status === "DELETED";
                return (
                  <ResizableDataTableRow
                    key={property.id}
                    className={deleted ? "bg-muted/30" : undefined}
                  >
                    <ResizableDataTableCell className="text-muted-foreground">
                      {formatPropertyReference(property.id)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell
                      truncate
                      title={property.street_address}
                      className="font-medium"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{property.street_address}</span>
                        {deleted ? (
                          <RecordStatusBadge status="DELETED" />
                        ) : null}
                      </div>
                    </ResizableDataTableCell>
                    <ResizableDataTableCell truncate title={property.unit ?? undefined}>
                      {property.unit ?? "—"}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell truncate title={property.city}>
                      {property.city}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell>{property.state}</ResizableDataTableCell>
                    <ResizableDataTableCell>{property.zip}</ResizableDataTableCell>
                    <ResizableDataTableCell
                      truncate
                      title={property.county ?? undefined}
                    >
                      {property.county ?? "—"}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell truncate>
                      {formatPropertyType(property.property_type)}
                    </ResizableDataTableCell>
                    <ResizableDataTableCell
                      truncate
                      title={property.mls_number ?? undefined}
                    >
                      {property.mls_number ?? "—"}
                    </ResizableDataTableCell>
                    <ResizableDataTableActionsCell>
                      <ListRowActions>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPropertyForm(property, "view")}
                        >
                          View
                        </Button>
                        {!deleted ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPropertyForm(property, "edit")}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeleteDialog(property)}
                            >
                              Delete
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRestoringId === property.id}
                            onClick={() => void handleRestore(property)}
                          >
                            {isRestoringId === property.id
                              ? "Restoring…"
                              : "Restore"}
                          </Button>
                        )}
                      </ListRowActions>
                    </ResizableDataTableActionsCell>
                  </ResizableDataTableRow>
                );
              })}
            </ResizableDataTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
