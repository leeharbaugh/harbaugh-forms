"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type BrokerageProfileInput,
  brokerFullName,
  validateBrokerageProfileInput,
} from "@/lib/types/brokerage-settings";

type BrokerageProfileFormProps = {
  value: BrokerageProfileInput;
  onChange: (value: BrokerageProfileInput) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
};

export function BrokerageProfileForm({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  error,
}: BrokerageProfileFormProps) {
  const setField = <K extends keyof BrokerageProfileInput>(
    key: K,
    fieldValue: BrokerageProfileInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (validateBrokerageProfileInput(value)) {
      return;
    }
    onSubmit();
  };

  const validationError = validateBrokerageProfileInput(value);
  const brokerFullNameDisplay = brokerFullName({
    broker_first_name: value.broker_first_name || null,
    broker_middle_name: value.broker_middle_name || null,
    broker_last_name: value.broker_last_name || null,
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Brokerage / Firm</h3>
          <p className="text-sm text-muted-foreground">
            Firm-level information used on forms and agreements (not the
            individual broker of record).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brokerage_name">Brokerage Name *</Label>
            <Input
              id="brokerage_name"
              value={value.brokerage_name}
              onChange={(event) => setField("brokerage_name", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brokerage_license_number">
              Brokerage License Number
            </Label>
            <Input
              id="brokerage_license_number"
              value={value.brokerage_license_number}
              onChange={(event) =>
                setField("brokerage_license_number", event.target.value)
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brokerage_address">Brokerage Address *</Label>
            <Input
              id="brokerage_address"
              value={value.brokerage_address}
              onChange={(event) =>
                setField("brokerage_address", event.target.value)
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_city">Brokerage City *</Label>
            <Input
              id="brokerage_city"
              value={value.brokerage_city}
              onChange={(event) => setField("brokerage_city", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_state">Brokerage State *</Label>
            <Input
              id="brokerage_state"
              value={value.brokerage_state}
              onChange={(event) => setField("brokerage_state", event.target.value)}
              maxLength={2}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_zip">Brokerage Zip *</Label>
            <Input
              id="brokerage_zip"
              value={value.brokerage_zip}
              onChange={(event) => setField("brokerage_zip", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_office_phone">Brokerage Office Phone *</Label>
            <Input
              id="brokerage_office_phone"
              type="tel"
              value={value.brokerage_office_phone}
              onChange={(event) =>
                setField("brokerage_office_phone", event.target.value)
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_email">Brokerage Email</Label>
            <Input
              id="brokerage_email"
              type="email"
              value={value.brokerage_email}
              onChange={(event) =>
                setField("brokerage_email", event.target.value)
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Broker of Record / Person</h3>
          <p className="text-sm text-muted-foreground">
            Individual broker details for form population (not the firm).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="broker_first_name">Broker First Name *</Label>
            <Input
              id="broker_first_name"
              value={value.broker_first_name}
              onChange={(event) =>
                setField("broker_first_name", event.target.value)
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_middle_name">Broker Middle Name</Label>
            <Input
              id="broker_middle_name"
              value={value.broker_middle_name}
              onChange={(event) =>
                setField("broker_middle_name", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_last_name">Broker Last Name *</Label>
            <Input
              id="broker_last_name"
              value={value.broker_last_name}
              onChange={(event) =>
                setField("broker_last_name", event.target.value)
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_full_name_display">Broker Full Name</Label>
            <Input
              id="broker_full_name_display"
              value={brokerFullNameDisplay}
              readOnly
              tabIndex={-1}
              className="bg-muted/50"
              aria-readonly="true"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_license_number">Broker License Number *</Label>
            <Input
              id="broker_license_number"
              value={value.broker_license_number}
              onChange={(event) =>
                setField("broker_license_number", event.target.value)
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_phone">Broker Phone *</Label>
            <Input
              id="broker_phone"
              type="tel"
              value={value.broker_phone}
              onChange={(event) => setField("broker_phone", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_email">Broker Email *</Label>
            <Input
              id="broker_email"
              type="email"
              value={value.broker_email}
              onChange={(event) => setField("broker_email", event.target.value)}
              required
            />
          </div>
        </div>
      </section>

      {(error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      <Button type="submit" disabled={isSubmitting || Boolean(validationError)}>
        {isSubmitting ? "Saving..." : "Save brokerage profile"}
      </Button>
    </form>
  );
}
