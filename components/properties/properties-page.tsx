"use client";

import { PropertyForm } from "@/components/properties/property-form";
import { ListRowActions } from "@/components/list-row-actions";
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

const LIST_COLUMNS =
  "grid grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-3";

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
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[960px]">
                <div
                  className={`${LIST_COLUMNS} border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground`}
                >
                  <span>ID</span>
                  <span>Street address</span>
                  <span>Unit</span>
                  <span>City</span>
                  <span>State</span>
                  <span>ZIP</span>
                  <span>County</span>
                  <span>Property type</span>
                  <span>MLS number</span>
                </div>
                <div className="divide-y">
                  {properties.map((property) => (
                    <div
                      key={property.id}
                      className="flex flex-col gap-3 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4"
                    >
                      <div className={`${LIST_COLUMNS} items-center px-0 text-sm`}>
                        <span className="text-muted-foreground">
                          {formatPropertyReference(property.id)}
                        </span>
                        <span className="font-medium">
                          {property.street_address}
                        </span>
                        <span>{property.unit ?? "—"}</span>
                        <span>{property.city}</span>
                        <span>{property.state}</span>
                        <span>{property.zip}</span>
                        <span>{property.county ?? "—"}</span>
                        <span>{formatPropertyType(property.property_type)}</span>
                        <span>{property.mls_number ?? "—"}</span>
                      </div>
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
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
