"use client";

import { AddressAutofillFields } from "@/components/address-autofill-fields";
import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contactHasAddressInfo } from "@/lib/contact-property-from-address";
import {
  type ContactInput,
  type ContactType,
  formatContactDateOfBirth,
  validateContactInput,
} from "@/lib/types/contact";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ContactFormProps = {
  value: ContactInput;
  onChange: (value: ContactInput) => void;
  addAddressAsProperty?: boolean;
  onAddAddressAsPropertyChange?: (checked: boolean) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  mode: "create" | "edit" | "view";
  showActions?: boolean;
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

const PREFERRED_CONTACT_METHOD_OPTIONS = [
  "",
  "Email",
  "Phone",
  "Text",
  "Mail",
] as const;

function ContactSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function ViewField({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  const display = value?.trim() ? value : "—";
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{display}</p>
    </div>
  );
}

export function ContactForm({
  value,
  onChange,
  addAddressAsProperty = false,
  onAddAddressAsPropertyChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = null,
  mode,
  showActions = true,
}: ContactFormProps) {
  const readOnly = mode === "view";
  const showAddAsPropertyOption =
    !readOnly &&
    contactHasAddressInfo(value) &&
    onAddAddressAsPropertyChange != null;

  const setField = <K extends keyof ContactInput>(
    key: K,
    fieldValue: ContactInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly || !onSubmit) return;
    const validationError = validateContactInput(value);
    if (validationError) return;
    onSubmit();
  };

  const validationError = readOnly ? null : validateContactInput(value);
  const isIndividual = value.contact_type === "INDIVIDUAL";
  const FormWrapper = showActions ? "form" : "div";

  return (
    <FormWrapper
      {...(showActions ? { onSubmit: handleSubmit } : {})}
      className="space-y-6"
    >
      <ContactSection title="Identity">
        {readOnly ? (
          <>
            <ViewField
              label="Contact type"
              value={value.contact_type === "ENTITY" ? "Entity" : "Individual"}
            />
            {isIndividual ? (
              <>
                <ViewField label="First name" value={value.first_name} />
                <ViewField label="Middle name" value={value.middle_name} />
                <ViewField label="Last name" value={value.last_name} />
                <ViewField label="Suffix" value={value.suffix} />
                <ViewField label="Preferred name" value={value.preferred_name} />
                <ViewField label="Title" value={value.title} />
              </>
            ) : (
              <>
                <ViewField
                  label="Entity name"
                  value={value.entity_name}
                  className="sm:col-span-2"
                />
                <ViewField label="Entity type" value={value.entity_type} />
              </>
            )}
          </>
        ) : (
          <>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contact_type">Contact type</Label>
              <select
                id="contact_type"
                className={fieldClassName}
                value={value.contact_type}
                onChange={(event) =>
                  setField("contact_type", event.target.value as ContactType)
                }
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="ENTITY">Entity</option>
              </select>
            </div>

            {isIndividual ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="first_name">First name *</Label>
                  <Input
                    id="first_name"
                    value={value.first_name ?? ""}
                    onChange={(event) =>
                      setField("first_name", event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="middle_name">Middle name</Label>
                  <Input
                    id="middle_name"
                    value={value.middle_name ?? ""}
                    onChange={(event) =>
                      setField("middle_name", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last name *</Label>
                  <Input
                    id="last_name"
                    value={value.last_name ?? ""}
                    onChange={(event) =>
                      setField("last_name", event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suffix">Suffix</Label>
                  <Input
                    id="suffix"
                    value={value.suffix ?? ""}
                    onChange={(event) => setField("suffix", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preferred_name">Preferred name</Label>
                  <Input
                    id="preferred_name"
                    value={value.preferred_name ?? ""}
                    onChange={(event) =>
                      setField("preferred_name", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={value.title ?? ""}
                    onChange={(event) => setField("title", event.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="entity_name">Entity name *</Label>
                  <Input
                    id="entity_name"
                    value={value.entity_name ?? ""}
                    onChange={(event) =>
                      setField("entity_name", event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entity_type">Entity type</Label>
                  <Input
                    id="entity_type"
                    value={value.entity_type ?? ""}
                    onChange={(event) =>
                      setField("entity_type", event.target.value)
                    }
                    placeholder="LLC, Corporation, Trust, etc."
                  />
                </div>
              </>
            )}
          </>
        )}
      </ContactSection>

      <ContactSection title="Contact methods">
        {readOnly ? (
          <>
            <ViewField label="Email" value={value.email} />
            <ViewField label="Secondary email" value={value.email_secondary} />
            <ViewField label="Primary phone" value={value.phone_primary} />
            <ViewField label="Secondary phone" value={value.phone_secondary} />
            <ViewField
              label="Preferred contact method"
              value={value.preferred_contact_method}
            />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={value.email ?? ""}
                onChange={(event) => setField("email", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_secondary">Secondary email</Label>
              <Input
                id="email_secondary"
                type="email"
                value={value.email_secondary ?? ""}
                onChange={(event) =>
                  setField("email_secondary", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone_primary">Primary phone</Label>
              <Input
                id="phone_primary"
                type="tel"
                value={value.phone_primary ?? ""}
                onChange={(event) =>
                  setField("phone_primary", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone_secondary">Secondary phone</Label>
              <Input
                id="phone_secondary"
                type="tel"
                value={value.phone_secondary ?? ""}
                onChange={(event) =>
                  setField("phone_secondary", event.target.value)
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="preferred_contact_method">
                Preferred contact method
              </Label>
              <select
                id="preferred_contact_method"
                className={fieldClassName}
                value={value.preferred_contact_method ?? ""}
                onChange={(event) =>
                  setField(
                    "preferred_contact_method",
                    event.target.value || null,
                  )
                }
              >
                {PREFERRED_CONTACT_METHOD_OPTIONS.map((option) => (
                  <option key={option || "none"} value={option}>
                    {option || "—"}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </ContactSection>

      <ContactSection
        title="Mailing address"
        description="Used for correspondence and many form mappings."
      >
        {readOnly ? (
          <>
            <ViewField
              label="Address line 1"
              value={value.mailing_address_line_1}
              className="sm:col-span-2"
            />
            <ViewField
              label="Address line 2"
              value={value.mailing_address_line_2}
              className="sm:col-span-2"
            />
            <ViewField label="City" value={value.mailing_city} />
            <ViewField label="State" value={value.mailing_state} />
            <ViewField label="ZIP" value={value.mailing_zip} />
            <ViewField label="County" value={value.county} />
          </>
        ) : (
          <AddressAutofillFields
            line1={{
              id: "mailing_address_line_1",
              label: "Address line 1",
              value: value.mailing_address_line_1 ?? "",
              onChange: (fieldValue) =>
                setField("mailing_address_line_1", fieldValue),
            }}
            line2={{
              id: "mailing_address_line_2",
              label: "Address line 2",
              value: value.mailing_address_line_2 ?? "",
              onChange: (fieldValue) =>
                setField("mailing_address_line_2", fieldValue),
            }}
            city={{
              id: "mailing_city",
              label: "City",
              value: value.mailing_city ?? "",
              onChange: (fieldValue) => setField("mailing_city", fieldValue),
            }}
            state={{
              id: "mailing_state",
              label: "State",
              value: value.mailing_state ?? "TX",
              onChange: (fieldValue) => setField("mailing_state", fieldValue),
              maxLength: 2,
            }}
            zip={{
              id: "mailing_zip",
              label: "ZIP",
              value: value.mailing_zip ?? "",
              onChange: (fieldValue) => setField("mailing_zip", fieldValue),
            }}
            county={{
              id: "county",
              label: "County",
              value: value.county ?? "",
              onChange: (fieldValue) => setField("county", fieldValue),
            }}
          />
        )}
      </ContactSection>

      <ContactSection
        title="Street address"
        description="Physical or property-related address when different from mailing."
      >
        {readOnly ? (
          <>
            <ViewField
              label="Address line 1"
              value={value.street_address_line_1}
              className="sm:col-span-2"
            />
            <ViewField
              label="Address line 2"
              value={value.street_address_line_2}
              className="sm:col-span-2"
            />
            <ViewField label="City" value={value.street_city} />
            <ViewField label="State" value={value.street_state} />
            <ViewField label="ZIP" value={value.street_zip} />
          </>
        ) : (
          <AddressAutofillFields
            section="shipping"
            line1={{
              id: "street_address_line_1",
              label: "Address line 1",
              value: value.street_address_line_1 ?? "",
              onChange: (fieldValue) =>
                setField("street_address_line_1", fieldValue),
            }}
            line2={{
              id: "street_address_line_2",
              label: "Address line 2",
              value: value.street_address_line_2 ?? "",
              onChange: (fieldValue) =>
                setField("street_address_line_2", fieldValue),
            }}
            city={{
              id: "street_city",
              label: "City",
              value: value.street_city ?? "",
              onChange: (fieldValue) => setField("street_city", fieldValue),
            }}
            state={{
              id: "street_state",
              label: "State",
              value: value.street_state ?? "TX",
              onChange: (fieldValue) => setField("street_state", fieldValue),
              maxLength: 2,
            }}
            zip={{
              id: "street_zip",
              label: "ZIP",
              value: value.street_zip ?? "",
              onChange: (fieldValue) => setField("street_zip", fieldValue),
            }}
          />
        )}
      </ContactSection>

      {showAddAsPropertyOption && (
        <ContactSection
          title="Property"
          description="Optionally create a property record from this contact's address."
        >
          <div className="flex items-start gap-2 sm:col-span-2">
            <AppCheckbox
              id="add_address_as_property"
              checked={addAddressAsProperty}
              onCheckedChange={(checked) =>
                onAddAddressAsPropertyChange?.(checked === true)
              }
            />
            <div className="space-y-1">
              <Label htmlFor="add_address_as_property" className="font-normal">
                Add this address as a property
              </Label>
              <p className="text-xs text-muted-foreground">
                Uses the street address when provided; otherwise the mailing
                address. PO Boxes and mailing-only addresses cannot be added as
                properties.
              </p>
            </div>
          </div>
        </ContactSection>
      )}

      <ContactSection title="Professional & personal">
        {readOnly ? (
          <>
            <ViewField label="Company name" value={value.company_name} />
            <ViewField label="Brokerage name" value={value.brokerage_name} />
            <ViewField
              label="TREC license number"
              value={value.trec_license_number}
            />
            <ViewField
              label="Date of birth"
              value={
                value.date_of_birth
                  ? formatContactDateOfBirth(value.date_of_birth)
                  : null
              }
            />
            <ViewField label="Occupation" value={value.occupation} />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="company_name">Company name</Label>
              <Input
                id="company_name"
                value={value.company_name ?? ""}
                onChange={(event) =>
                  setField("company_name", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brokerage_name">Brokerage name</Label>
              <Input
                id="brokerage_name"
                value={value.brokerage_name ?? ""}
                onChange={(event) =>
                  setField("brokerage_name", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trec_license_number">TREC license number</Label>
              <Input
                id="trec_license_number"
                value={value.trec_license_number ?? ""}
                onChange={(event) =>
                  setField("trec_license_number", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={value.date_of_birth ?? ""}
                onChange={(event) =>
                  setField("date_of_birth", event.target.value || null)
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                value={value.occupation ?? ""}
                onChange={(event) =>
                  setField("occupation", event.target.value)
                }
              />
            </div>
          </>
        )}
      </ContactSection>

      <ContactSection title="Notes">
        {readOnly ? (
          <ViewField
            label="Notes"
            value={value.notes}
            className="sm:col-span-2"
          />
        ) : (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              rows={3}
              className={cn(fieldClassName, "min-h-24 py-2")}
              value={value.notes ?? ""}
              onChange={(event) => setField("notes", event.target.value)}
            />
          </div>
        )}
      </ContactSection>

      {!readOnly && (error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      {showActions && !readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting || !!validationError}>
            {isSubmitting
              ? "Saving..."
              : mode === "create"
                ? "Add Contact"
                : "Save changes"}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </FormWrapper>
  );
}
