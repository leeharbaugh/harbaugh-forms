"use client";

import { ContactPicker } from "@/components/contacts/contact-picker";
import { PropertyPicker } from "@/components/properties/property-picker";
import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type AgreementLifecycleStatus,
  type ListingAgreementInput,
  type ListingRepresentationKind,
  formatAgreementReference,
  validateListingAgreementInput,
} from "@/lib/types/listing-agreement";

type ListingAgreementFormProps = {
  value: ListingAgreementInput;
  onChange: (value: ListingAgreementInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  mode: "create" | "edit" | "view";
  agreementId?: number | null;
};

const agreementStatuses: AgreementLifecycleStatus[] = [
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
  "COMPLETED",
];

const representationKinds: ListingRepresentationKind[] = ["SALE", "LEASE"];

export function ListingAgreementForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  mode,
  agreementId = null,
}: ListingAgreementFormProps) {
  const readOnly = mode === "view";

  const setField = <K extends keyof ListingAgreementInput>(
    key: K,
    fieldValue: ListingAgreementInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    const validationError = validateListingAgreementInput(value);
    if (validationError) return;
    onSubmit();
  };

  const validationError = readOnly
    ? null
    : validateListingAgreementInput(value);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Agreement</h3>
          <p className="text-sm text-muted-foreground">
            Core listing agreement details and lifecycle status.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {agreementId != null && (
            <div className="space-y-2">
              <Label htmlFor="agreement_reference_id">Reference ID</Label>
              <Input
                id="agreement_reference_id"
                value={formatAgreementReference(agreementId)}
                disabled
                readOnly
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="agreement_status">Agreement status</Label>
            <Select
              id="agreement_status"
              value={value.agreement_status}
              onChange={(event) =>
                setField(
                  "agreement_status",
                  event.target.value as AgreementLifecycleStatus,
                )
              }
              disabled={readOnly}
            >
              {agreementStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="effective_date">Effective date *</Label>
            <Input
              id="effective_date"
              type="date"
              value={value.effective_date}
              onChange={(event) =>
                setField("effective_date", event.target.value)
              }
              disabled={readOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiration_date">Expiration date</Label>
            <Input
              id="expiration_date"
              type="date"
              value={value.expiration_date}
              onChange={(event) =>
                setField("expiration_date", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Sellers</h3>
          <p className="text-sm text-muted-foreground">
            Select one or more seller clients and set their display order.
          </p>
        </div>
        <ContactPicker
          selectedContactIds={value.contact_ids}
          onChange={(contactIds) => setField("contact_ids", contactIds)}
          disabled={readOnly}
          searchLabel="Search sellers"
          selectedLabel="Selected sellers"
          emptySelectedMessage="No sellers selected yet."
        />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Property</h3>
          <p className="text-sm text-muted-foreground">
            Select an existing property or create a new one for this listing.
          </p>
        </div>
        <PropertyPicker
          mode={value.property_mode}
          propertyId={value.property_id}
          property={value.property}
          onSelectionChange={(patch) =>
            onChange({ ...value, ...patch })
          }
          disabled={readOnly}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Listing details</h3>
          <p className="text-sm text-muted-foreground">
            Pricing, fees, disclosures, and access information.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="representation_kind">Representation kind *</Label>
            <Select
              id="representation_kind"
              value={value.representation_kind}
              onChange={(event) =>
                setField(
                  "representation_kind",
                  event.target.value as ListingRepresentationKind,
                )
              }
              disabled={readOnly}
              required
            >
              {representationKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.charAt(0) + kind.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="list_price">
              List price{value.representation_kind === "SALE" ? " *" : ""}
            </Label>
            <Input
              id="list_price"
              type="number"
              min="0"
              step="0.01"
              value={value.list_price}
              onChange={(event) => setField("list_price", event.target.value)}
              disabled={readOnly}
              required={value.representation_kind === "SALE"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seller_broker_fee_percent">
              Seller broker fee percent
            </Label>
            <Input
              id="seller_broker_fee_percent"
              type="number"
              min="0"
              step="0.01"
              value={value.seller_broker_fee_percent}
              onChange={(event) =>
                setField("seller_broker_fee_percent", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buyer_broker_fee_percent">
              Buyer broker fee percent
            </Label>
            <Input
              id="buyer_broker_fee_percent"
              type="number"
              min="0"
              step="0.01"
              value={value.buyer_broker_fee_percent}
              onChange={(event) =>
                setField("buyer_broker_fee_percent", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="showing_service">Showing service</Label>
            <Input
              id="showing_service"
              value={value.showing_service}
              onChange={(event) =>
                setField("showing_service", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service_contract_amount">
              Service contract amount
            </Label>
            <Input
              id="service_contract_amount"
              type="number"
              min="0"
              step="0.01"
              value={value.service_contract_amount}
              onChange={(event) =>
                setField("service_contract_amount", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="preferred_title_company">
              Preferred title company
            </Label>
            <Input
              id="preferred_title_company"
              value={value.preferred_title_company}
              onChange={(event) =>
                setField("preferred_title_company", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="occupancy_status">Occupancy status</Label>
            <Input
              id="occupancy_status"
              value={value.occupancy_status}
              onChange={(event) =>
                setField("occupancy_status", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="exclusions">Exclusions</Label>
            <Textarea
              id="exclusions"
              rows={2}
              className="min-h-20"
              value={value.exclusions}
              onChange={(event) => setField("exclusions", event.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="included_personal_property">
              Included personal property
            </Label>
            <Textarea
              id="included_personal_property"
              rows={2}
              className="min-h-20"
              value={value.included_personal_property}
              onChange={(event) =>
                setField("included_personal_property", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="access_notes">Access notes</Label>
            <Textarea
              id="access_notes"
              rows={2}
              className="min-h-20"
              value={value.access_notes}
              onChange={(event) => setField("access_notes", event.target.value)}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["hoa_exists", "HOA exists"],
              ["lead_based_paint_required", "Lead based paint required"],
              ["seller_disclosure_required", "Seller disclosure required"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <AppCheckbox
                id={key}
                checked={value[key]}
                onCheckedChange={(checked) =>
                  setField(key, checked === true)
                }
                disabled={readOnly}
              />
              <Label htmlFor={key} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </div>
      </section>

      {(error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {!readOnly && (
          <Button
            type="submit"
            disabled={isSubmitting || !!validationError}
          >
            {isSubmitting
              ? "Saving..."
              : mode === "create"
                ? "Create agreement"
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
    </form>
  );
}
