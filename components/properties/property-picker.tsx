"use client";

import { CadSearchButton } from "@/components/properties/cad-search-button";
import { PropertyForm } from "@/components/properties/property-form";
import { usePropertyDuplicateConfirm } from "@/components/properties/use-property-duplicate-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { saveNewPropertyWithDuplicateHandling } from "@/lib/property-duplicate";
import {
  type Property,
  type PropertyInput,
  type PropertySelectionMode,
  emptyPropertyInput,
  formatPropertyAddress,
  formatPropertyReference,
  formatPropertyType,
  propertyToInput,
  validatePropertyInput,
} from "@/lib/types/property";
import { useCallback, useEffect, useState } from "react";

export type PropertySelectionPatch = {
  property_mode?: PropertySelectionMode;
  property_id?: number | null;
  property?: PropertyInput;
};

type PropertyPickerProps = {
  mode: PropertySelectionMode;
  propertyId: number | null;
  property: PropertyInput;
  onSelectionChange: (patch: PropertySelectionPatch) => void;
  disabled?: boolean;
  /** When true, new properties must be saved before they count as selected. */
  requireSavedNewProperty?: boolean;
};

export function PropertyPicker({
  mode,
  propertyId,
  property,
  onSelectionChange,
  disabled = false,
  requireSavedNewProperty = false,
}: PropertyPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [listResults, setListResults] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null,
  );
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
  const [isSavingNewProperty, setIsSavingNewProperty] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { promptDuplicate, dialog: duplicateDialog } =
    usePropertyDuplicateConfirm();

  const applySelection = useCallback(
    (patch: PropertySelectionPatch) => {
      onSelectionChange(patch);
    },
    [onSelectionChange],
  );

  const loadSelectedProperty = useCallback(async (id: number | null) => {
    if (id == null) {
      setSelectedProperty(null);
      return;
    }

    setIsLoadingSelected(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .eq("status", "ACTIVE")
      .single();

    if (error) {
      setSelectedProperty(null);
    } else {
      setSelectedProperty((data as Property) ?? null);
    }

    setIsLoadingSelected(false);
  }, []);

  const loadProperties = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);

    const supabase = createClient();
    const trimmedSearch = searchQuery.trim();

    let query = supabase
      .from("properties")
      .select("*")
      .eq("status", "ACTIVE")
      .order("street_address", { ascending: true })
      .order("city", { ascending: true })
      .limit(20);

    if (trimmedSearch) {
      const term = `%${trimmedSearch}%`;
      query = query.or(
        [
          `street_address.ilike.${term}`,
          `unit.ilike.${term}`,
          `city.ilike.${term}`,
          `state.ilike.${term}`,
          `zip.ilike.${term}`,
          `mls_number.ilike.${term}`,
        ].join(","),
      );
    }

    const { data, error } = await query;

    if (error) {
      setListError(error.message);
      setListResults([]);
    } else {
      setListResults((data as Property[]) ?? []);
    }

    setIsLoadingList(false);
  }, [searchQuery]);

  useEffect(() => {
    if (mode === "existing") {
      void loadSelectedProperty(propertyId);
    }
  }, [mode, propertyId, loadSelectedProperty]);

  useEffect(() => {
    if (mode !== "existing") {
      return;
    }

    const timeout = setTimeout(() => {
      void loadProperties();
    }, 250);

    return () => clearTimeout(timeout);
  }, [mode, loadProperties]);

  const selectProperty = (nextProperty: Property) => {
    setSaveError(null);
    applySelection({
      property_mode: "existing",
      property_id: nextProperty.id,
      property: propertyToInput(nextProperty),
    });
    setSearchQuery("");
  };

  const switchToNew = () => {
    setSaveError(null);
    applySelection({
      property_mode: "new",
      property_id: null,
      property: emptyPropertyInput(),
    });
    setSelectedProperty(null);
    setListError(null);
  };

  const switchToExisting = () => {
    setSaveError(null);
    applySelection({
      property_mode: "existing",
      property_id: null,
      property: emptyPropertyInput(),
    });
    setSelectedProperty(null);
    setListError(null);
  };

  const handleSaveNewProperty = async () => {
    const validationError = validatePropertyInput(property);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setIsSavingNewProperty(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      const createdPropertyId = await saveNewPropertyWithDuplicateHandling(
        supabase,
        property,
        promptDuplicate,
      );

      if (createdPropertyId == null) {
        setIsSavingNewProperty(false);
        return;
      }

      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", createdPropertyId)
        .eq("status", "ACTIVE")
        .single();

      if (error || !data) {
        throw new Error(
          error?.message ?? "Property was saved but could not be loaded.",
        );
      }

      const savedProperty = data as Property;
      setSelectedProperty(savedProperty);
      applySelection({
        property_mode: "existing",
        property_id: savedProperty.id,
        property: propertyToInput(savedProperty),
      });
      setSearchQuery("");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to save the new property.",
      );
    } finally {
      setIsSavingNewProperty(false);
    }
  };

  const propertyValidationError =
    mode === "new" ? validatePropertyInput(property) : null;

  const countyForCadSearch =
    mode === "existing"
      ? selectedProperty?.county ?? property.county
      : property.county;

  const newPropertyHelpText = requireSavedNewProperty
    ? "Enter the property details, then click Save and select property to use it for this packet."
    : "Enter property details below, then click Save and select property. You can also leave this as a new property and save it with the parent form.";

  return (
    <>
      {duplicateDialog}
      <div className="space-y-4">
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={mode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={switchToExisting}
            >
              Select existing property
            </Button>
            <Button
              type="button"
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={switchToNew}
            >
              Create new property
            </Button>
          </div>
        )}

        {mode === "existing" && (
          <div className="space-y-4">
            {!disabled && (
              <div className="space-y-2">
                <Label htmlFor="property_search">Search properties</Label>
                <Input
                  id="property_search"
                  placeholder="Search by address, unit, city, state, ZIP, or MLS number..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  disabled={disabled}
                />

                <div className="rounded-md border">
                  {isLoadingList ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      Loading properties…
                    </p>
                  ) : listError ? (
                    <p className="p-3 text-sm text-destructive">{listError}</p>
                  ) : listResults.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      {searchQuery.trim()
                        ? "No matching properties found."
                        : "No active properties found. Create a new property instead."}
                    </p>
                  ) : (
                    <div className="divide-y">
                      {listResults.map((result) => {
                        const isSelected = propertyId === result.id;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => selectProperty(result)}
                            disabled={isSelected}
                          >
                            <div>
                              <p className="font-medium">
                                {formatPropertyAddress(result)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatPropertyReference(result.id)}
                                {" · "}
                                {formatPropertyType(result.property_type)}
                                {result.mls_number
                                  ? ` · MLS ${result.mls_number}`
                                  : ""}
                              </p>
                            </div>
                            {isSelected && (
                              <span className="text-xs text-muted-foreground">
                                Selected
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Selected property</Label>
              {isLoadingSelected ? (
                <p className="text-sm text-muted-foreground">
                  Loading property…
                </p>
              ) : propertyId == null ? (
                <p className="text-sm text-muted-foreground">
                  No property selected yet.
                </p>
              ) : selectedProperty ? (
                <div className="rounded-md border p-3">
                  <p className="font-medium">
                    {formatPropertyAddress(selectedProperty)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatPropertyReference(selectedProperty.id)}
                    {" · "}
                    {formatPropertyType(selectedProperty.property_type)}
                    {selectedProperty.mls_number
                      ? ` · MLS ${selectedProperty.mls_number}`
                      : ""}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border p-3">
                  <p className="font-medium">
                    {formatPropertyAddress(property)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatPropertyReference(propertyId)}
                  </p>
                </div>
              )}
            </div>

            <CadSearchButton county={countyForCadSearch} />
          </div>
        )}

        {mode === "new" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{newPropertyHelpText}</p>
            <PropertyForm
              value={property}
              onChange={(nextProperty) => {
                setSaveError(null);
                applySelection({
                  property_mode: "new",
                  property_id: null,
                  property: nextProperty,
                });
              }}
              mode={disabled ? "view" : "create"}
              showActions={false}
            />
            {property.street_address.trim() &&
              property.city.trim() &&
              property.zip.trim() && (
                <div className="rounded-md border border-dashed p-3">
                  <p className="text-sm font-medium">New property preview</p>
                  <p className="text-sm text-muted-foreground">
                    {formatPropertyAddress(property)}
                  </p>
                </div>
              )}
            {!disabled && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => void handleSaveNewProperty()}
                  disabled={isSavingNewProperty || !!propertyValidationError}
                >
                  {isSavingNewProperty
                    ? "Saving property..."
                    : "Save and select property"}
                </Button>
                {propertyValidationError && (
                  <p className="text-sm text-muted-foreground">
                    Complete the required property fields to save.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {propertyId != null && (
          <div className="space-y-2">
            <Label htmlFor="property_id_display">Property ID</Label>
            <Input
              id="property_id_display"
              value={formatPropertyReference(propertyId)}
              disabled
              readOnly
            />
          </div>
        )}

        {(saveError || propertyValidationError) && (
          <p className="text-sm text-destructive">
            {saveError ?? propertyValidationError}
          </p>
        )}
      </div>
    </>
  );
}
