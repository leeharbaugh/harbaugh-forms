"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type BrokerageProfileInput,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Brokerage</h3>
          <p className="text-sm text-muted-foreground">
            Office information used on forms and agreements.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brokerage_name">Brokerage name *</Label>
            <Input
              id="brokerage_name"
              value={value.brokerage_name}
              onChange={(event) => setField("brokerage_name", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brokerage_address">Address *</Label>
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
            <Label htmlFor="brokerage_city">City *</Label>
            <Input
              id="brokerage_city"
              value={value.brokerage_city}
              onChange={(event) => setField("brokerage_city", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_state">State *</Label>
            <Input
              id="brokerage_state"
              value={value.brokerage_state}
              onChange={(event) => setField("brokerage_state", event.target.value)}
              maxLength={2}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_zip">ZIP *</Label>
            <Input
              id="brokerage_zip"
              value={value.brokerage_zip}
              onChange={(event) => setField("brokerage_zip", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage_office_phone">Office phone *</Label>
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
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-medium">Broker</h3>
          <p className="text-sm text-muted-foreground">
            Designated broker details for form population.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="broker_first_name">First name *</Label>
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
            <Label htmlFor="broker_middle_name">Middle name</Label>
            <Input
              id="broker_middle_name"
              value={value.broker_middle_name}
              onChange={(event) =>
                setField("broker_middle_name", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_last_name">Last name *</Label>
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
            <Label htmlFor="broker_license_number">License number *</Label>
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
            <Label htmlFor="broker_phone">Phone *</Label>
            <Input
              id="broker_phone"
              type="tel"
              value={value.broker_phone}
              onChange={(event) => setField("broker_phone", event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_email">Email *</Label>
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
