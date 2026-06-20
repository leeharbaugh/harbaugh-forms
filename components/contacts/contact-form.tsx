"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ContactInput,
  type ContactType,
  validateContactInput,
} from "@/lib/types/contact";
import { cn } from "@/lib/utils";

type ContactFormProps = {
  value: ContactInput;
  onChange: (value: ContactInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  mode: "create" | "edit";
};

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export function ContactForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  mode,
}: ContactFormProps) {
  const setField = <K extends keyof ContactInput>(key: K, fieldValue: ContactInput[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateContactInput(value);
    if (validationError) {
      return;
    }
    onSubmit();
  };

  const validationError = validateContactInput(value);
  const isIndividual = value.contact_type === "INDIVIDUAL";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
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
                onChange={(event) => setField("first_name", event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="middle_name">Middle name</Label>
              <Input
                id="middle_name"
                value={value.middle_name ?? ""}
                onChange={(event) => setField("middle_name", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name *</Label>
              <Input
                id="last_name"
                value={value.last_name ?? ""}
                onChange={(event) => setField("last_name", event.target.value)}
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
          </>
        ) : (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="entity_name">Entity name *</Label>
            <Input
              id="entity_name"
              value={value.entity_name ?? ""}
              onChange={(event) => setField("entity_name", event.target.value)}
              required
            />
          </div>
        )}

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
          <Label htmlFor="phone_primary">Primary phone</Label>
          <Input
            id="phone_primary"
            type="tel"
            value={value.phone_primary ?? ""}
            onChange={(event) => setField("phone_primary", event.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="phone_secondary">Secondary phone</Label>
          <Input
            id="phone_secondary"
            type="tel"
            value={value.phone_secondary ?? ""}
            onChange={(event) => setField("phone_secondary", event.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mailing_address_line_1">Mailing address line 1</Label>
          <Input
            id="mailing_address_line_1"
            value={value.mailing_address_line_1 ?? ""}
            onChange={(event) =>
              setField("mailing_address_line_1", event.target.value)
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mailing_address_line_2">Mailing address line 2</Label>
          <Input
            id="mailing_address_line_2"
            value={value.mailing_address_line_2 ?? ""}
            onChange={(event) =>
              setField("mailing_address_line_2", event.target.value)
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mailing_city">City</Label>
          <Input
            id="mailing_city"
            value={value.mailing_city ?? ""}
            onChange={(event) => setField("mailing_city", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mailing_state">State</Label>
          <Input
            id="mailing_state"
            value={value.mailing_state ?? "TX"}
            onChange={(event) => setField("mailing_state", event.target.value)}
            maxLength={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mailing_zip">ZIP</Label>
          <Input
            id="mailing_zip"
            value={value.mailing_zip ?? ""}
            onChange={(event) => setField("mailing_zip", event.target.value)}
          />
        </div>

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
      </div>

      {(error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || !!validationError}>
          {isSubmitting
            ? "Saving..."
            : mode === "create"
              ? "Add Contact"
              : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
