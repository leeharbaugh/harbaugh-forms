"use client";

import { ContactPicker } from "@/components/contacts/contact-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AgreementLifecycleStatus,
  type BuyerRepAgreementInput,
  type RepresentationKind,
  formatAgreementReference,
  validateBuyerRepAgreementInput,
} from "@/lib/types/buyer-rep-agreement";
import { cn } from "@/lib/utils";

type BuyerRepAgreementFormProps = {
  value: BuyerRepAgreementInput;
  onChange: (value: BuyerRepAgreementInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  mode: "create" | "edit" | "view";
  agreementId?: number | null;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

const agreementStatuses: AgreementLifecycleStatus[] = [
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
  "COMPLETED",
];

const representationKinds: RepresentationKind[] = ["PURCHASE", "LEASE"];

export function BuyerRepAgreementForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  mode,
  agreementId = null,
}: BuyerRepAgreementFormProps) {
  const readOnly = mode === "view";

  const setField = <K extends keyof BuyerRepAgreementInput>(
    key: K,
    fieldValue: BuyerRepAgreementInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    const validationError = validateBuyerRepAgreementInput(value);
    if (validationError) return;
    onSubmit();
  };

  const validationError = readOnly
    ? null
    : validateBuyerRepAgreementInput(value);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Agreement</h3>
          <p className="text-sm text-muted-foreground">
            Core agreement details and lifecycle status.
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
            <select
              id="agreement_status"
              className={fieldClassName}
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
            </select>
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
          <h3 className="text-lg font-medium">Buyers</h3>
          <p className="text-sm text-muted-foreground">
            Select one or more clients and set their display order.
          </p>
        </div>
        <ContactPicker
          selectedContactIds={value.contact_ids}
          onChange={(contactIds) => setField("contact_ids", contactIds)}
          disabled={readOnly}
          searchLabel="Search clients"
          selectedLabel="Selected buyers"
          emptySelectedMessage="No buyers selected yet."
        />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Buyer rep details</h3>
          <p className="text-sm text-muted-foreground">
            Compensation, market area, and document addenda options.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="representation_kind">Representation kind *</Label>
            <select
              id="representation_kind"
              className={fieldClassName}
              value={value.representation_kind}
              onChange={(event) =>
                setField(
                  "representation_kind",
                  event.target.value as RepresentationKind,
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
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="market_area">Market area</Label>
            <Input
              id="market_area"
              value={value.market_area}
              onChange={(event) => setField("market_area", event.target.value)}
              disabled={readOnly}
            />
          </div>
          {value.representation_kind === "PURCHASE" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="compensation_percent">
                  Purchase compensation percent
                </Label>
                <Input
                  id="compensation_percent"
                  type="number"
                  step="0.001"
                  min="0"
                  value={value.compensation_percent}
                  onChange={(event) =>
                    setField("compensation_percent", event.target.value)
                  }
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase_flat_fee">Purchase flat fee</Label>
                <Input
                  id="purchase_flat_fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={value.purchase_flat_fee}
                  onChange={(event) =>
                    setField("purchase_flat_fee", event.target.value)
                  }
                  disabled={readOnly}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="lease_one_month_rent_percent">
                  Lease one month rent percent
                </Label>
                <Input
                  id="lease_one_month_rent_percent"
                  type="number"
                  step="0.001"
                  min="0"
                  value={value.lease_one_month_rent_percent}
                  onChange={(event) =>
                    setField("lease_one_month_rent_percent", event.target.value)
                  }
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lease_all_rents_percent">
                  Lease all rents percent
                </Label>
                <Input
                  id="lease_all_rents_percent"
                  type="number"
                  step="0.001"
                  min="0"
                  value={value.lease_all_rents_percent}
                  onChange={(event) =>
                    setField("lease_all_rents_percent", event.target.value)
                  }
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lease_flat_fee">Lease flat fee</Label>
                <Input
                  id="lease_flat_fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={value.lease_flat_fee}
                  onChange={(event) =>
                    setField("lease_flat_fee", event.target.value)
                  }
                  disabled={readOnly}
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="construction_compensation">
              Construction compensation
            </Label>
            <Input
              id="construction_compensation"
              value={value.construction_compensation}
              onChange={(event) =>
                setField("construction_compensation", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="other_compensation">Other compensation</Label>
            <Input
              id="other_compensation"
              value={value.other_compensation}
              onChange={(event) =>
                setField("other_compensation", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="protection_period_days">
              Protection period days
            </Label>
            <Input
              id="protection_period_days"
              type="number"
              min="0"
              step="1"
              value={value.protection_period_days}
              onChange={(event) =>
                setField("protection_period_days", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="county_for_payment">County for payment</Label>
            <Input
              id="county_for_payment"
              value={value.county_for_payment}
              onChange={(event) =>
                setField("county_for_payment", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employer_relocation">Employer relocation</Label>
            <Input
              id="employer_relocation"
              value={value.employer_relocation}
              onChange={(event) =>
                setField("employer_relocation", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retainer_amount">Retainer amount</Label>
            <Input
              id="retainer_amount"
              type="number"
              min="0"
              step="0.01"
              value={value.retainer_amount}
              onChange={(event) =>
                setField("retainer_amount", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="retainer_applies_to_fee"
              checked={value.retainer_applies_to_fee}
              onCheckedChange={(checked) =>
                setField("retainer_applies_to_fee", checked === true)
              }
              disabled={readOnly}
            />
            <Label htmlFor="retainer_applies_to_fee" className="font-normal">
              Retainer applies to fee
            </Label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="special_provisions">Special provisions</Label>
            <textarea
              id="special_provisions"
              rows={3}
              className={cn(fieldClassName, "min-h-24 py-2")}
              value={value.special_provisions}
              onChange={(event) =>
                setField("special_provisions", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["intermediary_allowed", "Intermediary allowed"],
              ["add_iabs", "Add IABS"],
              ["add_home_inspection", "Add home inspection"],
              ["add_wire_fraud", "Add wire fraud"],
              ["add_mineral_clauses", "Add mineral clauses"],
              ["add_lead_based_paint", "Add lead-based paint"],
              ["add_mold_remediation", "Add mold remediation"],
              ["add_flood_hazard", "Add flood hazard"],
              ["add_property_insurance", "Add property insurance"],
              [
                "add_general_information_notice",
                "Add general information notice",
              ],
              ["add_other_document", "Add other document"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
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

        {value.add_other_document && (
          <div className="space-y-2">
            <Label htmlFor="add_other_document_description">
              Other document description
            </Label>
            <textarea
              id="add_other_document_description"
              rows={3}
              className={cn(fieldClassName, "min-h-24 py-2")}
              value={value.add_other_document_description}
              onChange={(event) =>
                setField("add_other_document_description", event.target.value)
              }
              disabled={readOnly}
            />
          </div>
        )}
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
