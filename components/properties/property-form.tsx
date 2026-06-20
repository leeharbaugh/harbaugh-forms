"use client";

import { CadSearchButton } from "@/components/properties/cad-search-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type PropertyInput,
  type PropertyType,
  formatPropertyReference,
  formatPropertyType,
  validatePropertyInput,
} from "@/lib/types/property";
import { cn } from "@/lib/utils";

type PropertyFormProps = {
  value: PropertyInput;
  onChange: (value: PropertyInput) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  mode: "create" | "edit" | "view";
  propertyId?: number | null;
  showActions?: boolean;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

const propertyTypes: PropertyType[] = [
  "SINGLE_FAMILY",
  "CONDO",
  "TOWNHOME",
  "MULTI_FAMILY",
  "COMMERCIAL",
  "LAND",
  "OTHER",
];

export function PropertyForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = null,
  mode,
  propertyId = null,
  showActions = true,
}: PropertyFormProps) {
  const readOnly = mode === "view";

  const setField = <K extends keyof PropertyInput>(
    key: K,
    fieldValue: PropertyInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly || !onSubmit) return;
    const validationError = validatePropertyInput(value);
    if (validationError) return;
    onSubmit();
  };

  const validationError = readOnly ? null : validatePropertyInput(value);
  const FormWrapper = showActions ? "form" : "div";

  return (
    <FormWrapper
      {...(showActions
        ? { onSubmit: handleSubmit }
        : { role: "group", "aria-label": "Property details" })}
      className="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {propertyId != null && (
          <div className="space-y-2">
            <Label htmlFor="property_reference_id">ID</Label>
            <Input
              id="property_reference_id"
              value={formatPropertyReference(propertyId)}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="street_address">Street address *</Label>
          <Input
            id="street_address"
            value={value.street_address}
            onChange={(event) => setField("street_address", event.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={value.unit}
            onChange={(event) => setField("unit", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="property_type">Property type *</Label>
          <select
            id="property_type"
            className={fieldClassName}
            value={value.property_type}
            onChange={(event) =>
              setField("property_type", event.target.value as PropertyType)
            }
            disabled={readOnly}
            required
          >
            {propertyTypes.map((type) => (
              <option key={type} value={type}>
                {formatPropertyType(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={value.city}
            onChange={(event) => setField("city", event.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State *</Label>
          <Input
            id="state"
            value={value.state}
            onChange={(event) => setField("state", event.target.value)}
            disabled={readOnly}
            maxLength={2}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zip">ZIP *</Label>
          <Input
            id="zip"
            value={value.zip}
            onChange={(event) => setField("zip", event.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="county">County</Label>
          <Input
            id="county"
            value={value.county}
            onChange={(event) => setField("county", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <CadSearchButton county={value.county} />

        <div className="space-y-2">
          <Label htmlFor="parcel_id">Parcel ID</Label>
          <Input
            id="parcel_id"
            value={value.parcel_id}
            onChange={(event) => setField("parcel_id", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mls_number">MLS number</Label>
          <Input
            id="mls_number"
            value={value.mls_number}
            onChange={(event) => setField("mls_number", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bedrooms">Bedrooms</Label>
          <Input
            id="bedrooms"
            type="number"
            min="0"
            step="1"
            value={value.bedrooms}
            onChange={(event) => setField("bedrooms", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bathrooms">Bathrooms</Label>
          <Input
            id="bathrooms"
            type="number"
            min="0"
            step="0.1"
            value={value.bathrooms}
            onChange={(event) => setField("bathrooms", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sqft">Square feet</Label>
          <Input
            id="sqft"
            type="number"
            min="0"
            step="1"
            value={value.sqft}
            onChange={(event) => setField("sqft", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lot_sqft">Lot square feet</Label>
          <Input
            id="lot_sqft"
            type="number"
            min="0"
            step="1"
            value={value.lot_sqft}
            onChange={(event) => setField("lot_sqft", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="year_built">Year built</Label>
          <Input
            id="year_built"
            type="number"
            min="0"
            step="1"
            value={value.year_built}
            onChange={(event) => setField("year_built", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="legal_description">Legal description</Label>
          <textarea
            id="legal_description"
            rows={3}
            className={cn(fieldClassName, "min-h-24 py-2")}
            value={value.legal_description}
            onChange={(event) =>
              setField("legal_description", event.target.value)
            }
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            rows={3}
            className={cn(fieldClassName, "min-h-24 py-2")}
            value={value.notes}
            onChange={(event) => setField("notes", event.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      {(error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      {showActions && onCancel && (
        <div className="flex flex-wrap gap-2">
          {!readOnly && onSubmit && (
            <Button
              type="submit"
              disabled={isSubmitting || !!validationError}
            >
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                  ? "Add property"
                  : "Save changes"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {readOnly ? "Close" : "Cancel"}
          </Button>
        </div>
      )}
    </FormWrapper>
  );
}
