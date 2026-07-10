"use client";

import { PhoneInput } from "@/components/phone-input";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountInput } from "@/lib/amount-format";
import {
  resolveCheckboxCheckedState,
  resolvePacketFieldEditorControl,
  type PacketFormFieldView,
} from "@/lib/types/packet-form-editor";

type PacketFormFieldValueInputProps = {
  fieldView: PacketFormFieldView;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
};

export function toDateInputValue(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return "";
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

export function PacketFormFieldValueInput({
  fieldView,
  value,
  onChange,
  disabled = false,
  id,
}: PacketFormFieldValueInputProps) {
  const field = fieldView.instance.fields;
  const control = resolvePacketFieldEditorControl(fieldView);
  const inputId = id ?? `packet-field-value-${fieldView.mapping.id}`;

  if (control === "checkbox") {
    const checked = resolveCheckboxCheckedState(
      value,
      field?.default_checked,
    );

    return (
      <div className="flex items-center gap-2">
        <AppCheckbox
          id={inputId}
          checked={checked}
          onCheckedChange={(nextChecked) =>
            onChange(nextChecked === true ? "true" : "false")
          }
          disabled={disabled}
        />
        <Label htmlFor={inputId} className="text-xs font-normal">
          Checked
        </Label>
      </div>
    );
  }

  if (control === "date") {
    return (
      <Input
        id={inputId}
        type="date"
        value={toDateInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-8 text-sm"
      />
    );
  }

  if (control === "currency") {
    return (
      <Input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={formatAmountInput(value)}
        onChange={(event) => onChange(formatAmountInput(event.target.value))}
        disabled={disabled}
        className="h-8 text-sm"
      />
    );
  }

  if (control === "number") {
    return (
      <Input
        id={inputId}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-8 text-sm"
      />
    );
  }

  if (control === "phone") {
    return (
      <PhoneInput
        id={inputId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="h-8 text-sm"
      />
    );
  }

  return (
    <Input
      id={inputId}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-8 text-sm"
      placeholder=""
    />
  );
}
