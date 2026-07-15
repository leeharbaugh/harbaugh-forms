"use client";

import { AddressAutofillFields } from "@/components/address-autofill-fields";
import { PhoneInput } from "@/components/phone-input";
import { CadSearchButton } from "@/components/properties/cad-search-button";
import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { FormActions } from "@/components/ui/form-actions";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PROPERTY_BOOLEAN_FIELDS,
  PROPERTY_BOOLEAN_FIELD_LABELS,
  type PropertyBooleanField,
  type PropertyInput,
  type PropertyType,
  formatPropertyReference,
  formatPropertyType,
  validatePropertyInput,
} from "@/lib/types/property";
import { useEffect, useRef } from "react";

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

const propertyTypes: PropertyType[] = [
  "SINGLE_FAMILY",
  "CONDO",
  "TOWNHOME",
  "MULTI_FAMILY",
  "COMMERCIAL",
  "LAND",
  "OTHER",
];

const OCCUPANCY_STATUS_OPTIONS = [
  "",
  "Owner Occupied",
  "Tenant Occupied",
  "Vacant",
  "Under Construction",
] as const;

const HOA_DUES_FREQUENCY_OPTIONS = [
  "",
  "Monthly",
  "Quarterly",
  "Semi-Annually",
  "Annually",
] as const;

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
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const setField = <K extends keyof PropertyInput>(
    key: K,
    fieldValue: PropertyInput[K],
  ) => {
    const nextValue = { ...valueRef.current, [key]: fieldValue };
    valueRef.current = nextValue;
    onChange(nextValue);
  };

  const setBooleanField = (key: PropertyBooleanField, checked: boolean) => {
    onChange({ ...value, [key]: checked });
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
      {!readOnly && (
        <p className="text-xs text-muted-foreground">
          Required fields are marked with *
        </p>
      )}

      <FormSection
        title="Address"
        className={!readOnly ? "border-t-0 pt-0" : undefined}
      >
        {propertyId != null && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="property_reference_id">ID</Label>
            <Input
              id="property_reference_id"
              value={formatPropertyReference(propertyId)}
              disabled
              readOnly
            />
          </div>
        )}

        {!readOnly ? (
          <div className="sm:col-span-2">
            <AddressAutofillFields
            line1={{
              id: "street_address",
              label: "Street address",
              value: value.street_address,
              onChange: (fieldValue) => setField("street_address", fieldValue),
              required: true,
            }}
            line2={{
              id: "unit",
              label: "Unit",
              value: value.unit,
              onChange: (fieldValue) => setField("unit", fieldValue),
            }}
            line1Label="Street address *"
            line2Label="Unit"
            city={{
              id: "city",
              label: "City",
              value: value.city,
              onChange: (fieldValue) => setField("city", fieldValue),
              required: true,
            }}
            state={{
              id: "state",
              label: "State",
              value: value.state,
              onChange: (fieldValue) => setField("state", fieldValue),
              maxLength: 2,
              required: true,
            }}
            zip={{
              id: "zip",
              label: "ZIP",
              value: value.zip,
              onChange: (fieldValue) => setField("zip", fieldValue),
              required: true,
            }}
            county={{
              id: "county",
              label: "County",
              value: value.county,
              onChange: (fieldValue) => setField("county", fieldValue),
            }}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="street_address">Street address *</Label>
              <Input
                id="street_address"
                value={value.street_address}
                disabled
                readOnly
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" value={value.unit} disabled readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input id="city" value={value.city} disabled readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Input id="state" value={value.state} disabled readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zip">ZIP *</Label>
              <Input id="zip" value={value.zip} disabled readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="county">County</Label>
              <Input id="county" value={value.county} disabled readOnly />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="property_type">Property type *</Label>
          <Select
            id="property_type"
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
          </Select>
        </div>

        <CadSearchButton county={value.county} />

        <div className="space-y-2">
          <Label htmlFor="municipality">Municipality</Label>
          <Input
            id="municipality"
            value={value.municipality}
            onChange={(event) => setField("municipality", event.target.value)}
            disabled={readOnly}
            placeholder="City of Arlington"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="etj">ETJ</Label>
          <Input
            id="etj"
            value={value.etj}
            onChange={(event) => setField("etj", event.target.value)}
            disabled={readOnly}
            placeholder="Extraterritorial jurisdiction"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="school_district">School district</Label>
          <Input
            id="school_district"
            value={value.school_district}
            onChange={(event) =>
              setField("school_district", event.target.value)
            }
            disabled={readOnly}
          />
        </div>
      </FormSection>

      <FormSection
        title="Legal & identifiers"
        description="Plat references, tax identifiers, and legal description."
      >
        <div className="space-y-2">
          <Label htmlFor="lot">Lot</Label>
          <Input
            id="lot"
            value={value.lot}
            onChange={(event) => setField("lot", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="block">Block</Label>
          <Input
            id="block"
            value={value.block}
            onChange={(event) => setField("block", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="addition">Addition</Label>
          <Input
            id="addition"
            value={value.addition}
            onChange={(event) => setField("addition", event.target.value)}
            disabled={readOnly}
          />
        </div>

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
          <Label htmlFor="tax_id">Tax ID</Label>
          <Input
            id="tax_id"
            value={value.tax_id}
            onChange={(event) => setField("tax_id", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="geo_id">Geo ID</Label>
          <Input
            id="geo_id"
            value={value.geo_id}
            onChange={(event) => setField("geo_id", event.target.value)}
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

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="legal_description">Legal description</Label>
          <Textarea
            id="legal_description"
            rows={3}
            value={value.legal_description}
            onChange={(event) =>
              setField("legal_description", event.target.value)
            }
            disabled={readOnly}
          />
        </div>
      </FormSection>

      <FormSection title="Structure & size">
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

        <div className="space-y-2">
          <Label htmlFor="stories">Stories</Label>
          <Input
            id="stories"
            type="number"
            min="0"
            step="1"
            value={value.stories}
            onChange={(event) => setField("stories", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="garage_spaces">Garage spaces</Label>
          <Input
            id="garage_spaces"
            type="number"
            min="0"
            step="1"
            value={value.garage_spaces}
            onChange={(event) => setField("garage_spaces", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="garage_type">Garage type</Label>
          <Input
            id="garage_type"
            value={value.garage_type}
            onChange={(event) => setField("garage_type", event.target.value)}
            disabled={readOnly}
            placeholder="Attached, Detached, Carport"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="occupancy_status">Occupancy status</Label>
          <Select
            id="occupancy_status"
            value={value.occupancy_status}
            onChange={(event) =>
              setField("occupancy_status", event.target.value)
            }
            disabled={readOnly}
          >
            {OCCUPANCY_STATUS_OPTIONS.map((option) => (
              <option key={option || "unset"} value={option}>
                {option || "—"}
              </option>
            ))}
          </Select>
        </div>
      </FormSection>

      <FormSection
        title="Features"
        description="Property characteristics commonly referenced on Texas forms."
      >
        {PROPERTY_BOOLEAN_FIELDS.filter((key) => key !== "has_hoa").map((key) => (
          <div key={key} className="flex items-center gap-2 sm:col-span-1">
            <AppCheckbox
              id={`property_${key}`}
              checked={value[key]}
              onCheckedChange={(checked) =>
                setBooleanField(key, checked === true)
              }
              disabled={readOnly}
            />
            <Label htmlFor={`property_${key}`} className="font-normal">
              {PROPERTY_BOOLEAN_FIELD_LABELS[key]}
            </Label>
          </div>
        ))}
      </FormSection>

      <FormSection title="Utilities">
        <div className="space-y-2">
          <Label htmlFor="electric_provider">Electric provider</Label>
          <Input
            id="electric_provider"
            value={value.electric_provider}
            onChange={(event) =>
              setField("electric_provider", event.target.value)
            }
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gas_provider">Gas provider</Label>
          <Input
            id="gas_provider"
            value={value.gas_provider}
            onChange={(event) => setField("gas_provider", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="water_provider">Water provider</Label>
          <Input
            id="water_provider"
            value={value.water_provider}
            onChange={(event) =>
              setField("water_provider", event.target.value)
            }
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sewer_provider">Sewer provider</Label>
          <Input
            id="sewer_provider"
            value={value.sewer_provider}
            onChange={(event) =>
              setField("sewer_provider", event.target.value)
            }
            disabled={readOnly}
          />
        </div>
      </FormSection>

      <FormSection title="HOA">
        <div className="flex items-center gap-2 sm:col-span-2">
          <AppCheckbox
            id="property_has_hoa"
            checked={value.has_hoa}
            onCheckedChange={(checked) =>
              setBooleanField("has_hoa", checked === true)
            }
            disabled={readOnly}
          />
          <Label htmlFor="property_has_hoa" className="font-normal">
            {PROPERTY_BOOLEAN_FIELD_LABELS.has_hoa}
          </Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_name">HOA name</Label>
          <Input
            id="hoa_name"
            value={value.hoa_name}
            onChange={(event) => setField("hoa_name", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_management_company">Management company</Label>
          <Input
            id="hoa_management_company"
            value={value.hoa_management_company}
            onChange={(event) =>
              setField("hoa_management_company", event.target.value)
            }
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_contact_name">Contact name</Label>
          <Input
            id="hoa_contact_name"
            value={value.hoa_contact_name}
            onChange={(event) =>
              setField("hoa_contact_name", event.target.value)
            }
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_phone">Phone</Label>
          <PhoneInput
            id="hoa_phone"
            value={value.hoa_phone}
            onChange={(nextValue) => setField("hoa_phone", nextValue)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_email">Email</Label>
          <Input
            id="hoa_email"
            type="email"
            value={value.hoa_email}
            onChange={(event) => setField("hoa_email", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_website">Website</Label>
          <Input
            id="hoa_website"
            value={value.hoa_website}
            onChange={(event) => setField("hoa_website", event.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_dues_amount">Dues amount</Label>
          <Input
            id="hoa_dues_amount"
            type="number"
            min="0"
            step="0.01"
            value={value.hoa_dues_amount}
            onChange={(event) =>
              setField("hoa_dues_amount", event.target.value)
            }
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hoa_dues_frequency">Dues frequency</Label>
          <Select
            id="hoa_dues_frequency"
            value={value.hoa_dues_frequency}
            onChange={(event) =>
              setField("hoa_dues_frequency", event.target.value)
            }
            disabled={readOnly}
          >
            {HOA_DUES_FREQUENCY_OPTIONS.map((option) => (
              <option key={option || "unset"} value={option}>
                {option || "—"}
              </option>
            ))}
          </Select>
        </div>
      </FormSection>

      <FormSection title="Notes">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            value={value.notes}
            onChange={(event) => setField("notes", event.target.value)}
            disabled={readOnly}
          />
        </div>
      </FormSection>

      {(error || validationError) && (
        <p className="pt-2 text-sm text-destructive">{error ?? validationError}</p>
      )}

      {showActions && onCancel && (
        <FormActions>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {readOnly ? "Close" : "Cancel"}
          </Button>
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
        </FormActions>
      )}
    </FormWrapper>
  );
}
