"use client";

import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AgentProfileInput,
  validateAgentProfileInput,
} from "@/lib/types/brokerage-settings";

type AgentProfileFormProps = {
  value: AgentProfileInput;
  onChange: (value: AgentProfileInput) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
};

export function AgentProfileForm({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  error,
}: AgentProfileFormProps) {
  const setField = <K extends keyof AgentProfileInput>(
    key: K,
    fieldValue: AgentProfileInput[K],
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (validateAgentProfileInput(value)) {
      return;
    }
    onSubmit();
  };

  const validationError = validateAgentProfileInput(value);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="agent_first_name">First name *</Label>
          <Input
            id="agent_first_name"
            value={value.agent_first_name}
            onChange={(event) => setField("agent_first_name", event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_middle_name">Middle name</Label>
          <Input
            id="agent_middle_name"
            value={value.agent_middle_name}
            onChange={(event) => setField("agent_middle_name", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_last_name">Last name *</Label>
          <Input
            id="agent_last_name"
            value={value.agent_last_name}
            onChange={(event) => setField("agent_last_name", event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_license_number">License number *</Label>
          <Input
            id="agent_license_number"
            value={value.agent_license_number}
            onChange={(event) =>
              setField("agent_license_number", event.target.value)
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_phone">Phone *</Label>
          <PhoneInput
            id="agent_phone"
            value={value.agent_phone}
            onChange={(nextValue) => setField("agent_phone", nextValue)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_email">Email *</Label>
          <Input
            id="agent_email"
            type="email"
            value={value.agent_email}
            onChange={(event) => setField("agent_email", event.target.value)}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="agent_address">Address</Label>
          <Input
            id="agent_address"
            value={value.agent_address}
            onChange={(event) => setField("agent_address", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_city">City</Label>
          <Input
            id="agent_city"
            value={value.agent_city}
            onChange={(event) => setField("agent_city", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_state">State</Label>
          <Input
            id="agent_state"
            value={value.agent_state}
            onChange={(event) => setField("agent_state", event.target.value)}
            maxLength={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent_zip">ZIP</Label>
          <Input
            id="agent_zip"
            value={value.agent_zip}
            onChange={(event) => setField("agent_zip", event.target.value)}
          />
        </div>
      </div>

      {(error || validationError) && (
        <p className="text-sm text-destructive">{error ?? validationError}</p>
      )}

      <Button type="submit" disabled={isSubmitting || Boolean(validationError)}>
        {isSubmitting ? "Saving..." : "Save agent profile"}
      </Button>
    </form>
  );
}
