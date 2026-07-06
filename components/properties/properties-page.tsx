"use client";

import { PropertyForm } from "@/components/properties/property-form";
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
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editingPropertyId, setEditingPropertyId] = useState<number | null>(
    null,
  );
  const [formValue, setFormValue] = useState(emptyPropertyInput());

  const loadProperties = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setListError(null);

    let query = supabase
      .from("properties")
      .select("*")
      .eq("status", "ACTIVE")
      .order("street_address", { ascending: true })
      .order("city", { ascending: true });

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
  }, [searchQuery]);

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
  };

  const handleSave = async () => {
    const validationError = validatePropertyInput(formValue);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalized = normalizePropertyInput(formValue);
    setIsSubmitting(true);
    setFormError(null);

    const supabase = createClient();

    if (formMode === "create") {
      const { error } = await supabase.from("properties").insert(normalized);

      if (error) {
        setFormError(error.message);
        setIsSubmitting(false);
        return;
      }
    }

    if (formMode === "edit" && editingPropertyId !== null) {
      const { error } = await supabase
        .from("properties")
        .update(normalized)
        .eq("id", editingPropertyId)
        .eq("status", "ACTIVE");

      if (error) {
        setFormError(error.message);
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
    closeForm();
    await loadProperties();
  };

  const handleDelete = async (property: Property) => {
    const confirmed = window.confirm(
      `Delete property ${formatPropertyReference(property.id)} at ${property.street_address}, ${property.city}? This will mark the property as deleted.`,
    );

    if (!confirmed) {
      return;
    }

    setListError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("properties")
      .update({ status: "DELETED" })
      .eq("id", property.id)
      .eq("status", "ACTIVE");

    if (error) {
      setListError(error.message);
      return;
    }

    if (editingPropertyId === property.id) {
      closeForm();
    }

    await loadProperties();
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground">
            Manage active properties for Harbaugh Forms.
          </p>
        </div>
        {formMode === "hidden" && (
          <Button onClick={openCreateForm}>Add property</Button>
        )}
      </div>

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
          <CardTitle>Active properties</CardTitle>
          <CardDescription>
            Search by street address, city, ZIP, county, MLS number, tax ID, or
            addition.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search properties..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          {listError && <p className="text-sm text-destructive">{listError}</p>}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading properties...</p>
          ) : properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active properties found.
            </p>
          ) : (
            <ResizableDataTable
              storageKey="harbaugh-properties-list-column-widths"
              tablePreferencesKey="properties_list"
              columns={PROPERTY_TABLE_COLUMNS}
            >
              {properties.map((property) => (
                <ResizableDataTableRow key={property.id}>
                  <ResizableDataTableCell className="text-muted-foreground">
                    {formatPropertyReference(property.id)}
                  </ResizableDataTableCell>
                  <ResizableDataTableCell
                    truncate
                    title={property.street_address}
                    className="font-medium"
                  >
                    {property.street_address}
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
                        onClick={() => void handleDelete(property)}
                      >
                        Delete
                      </Button>
                    </ListRowActions>
                  </ResizableDataTableActionsCell>
                </ResizableDataTableRow>
              ))}
            </ResizableDataTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
