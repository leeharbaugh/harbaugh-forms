"use client";

import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PacketFormFieldView } from "@/lib/types/packet-form-editor";
import { formatPacketFieldDisplayValue } from "@/lib/types/packet-form-editor";

type PacketFormFieldValueDialogProps = {
  open: boolean;
  fieldView: PacketFormFieldView | null;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onResetPlacement: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  isResettingPlacement: boolean;
  error: string | null;
};

export function PacketFormFieldValueDialog({
  open,
  fieldView,
  value,
  onChange,
  onSubmit,
  onResetPlacement,
  onCancel,
  isSubmitting,
  isResettingPlacement,
  error,
}: PacketFormFieldValueDialogProps) {
  if (!open || !fieldView) {
    return null;
  }

  const field = fieldView.instance.fields;
  const isBusy = isSubmitting || isResettingPlacement;
  const isCheckbox = fieldView.field_type === "CHECKBOX";
  const checkboxChecked = ["true", "1", "yes", "on"].includes(
    value.trim().toLowerCase(),
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
        disabled={isBusy}
        aria-label="Close field value dialog"
      />
      <Card className="relative z-10 w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle>Edit field value</CardTitle>
          <p className="text-sm text-muted-foreground">
            {field?.field_key ?? "Field"} · packet form only
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              This updates the value for this packet form. The same catalog field
              shares one value across multiple placements on this form.
            </p>

            <div className="space-y-2">
              <Label htmlFor="packet_field_label">Field label</Label>
              <Input
                id="packet_field_label"
                value={field?.field_label ?? ""}
                disabled
                readOnly
              />
            </div>

            {isCheckbox ? (
              <div className="flex items-center gap-2">
                <AppCheckbox
                  id="packet_field_checkbox_value"
                  checked={checkboxChecked}
                  onCheckedChange={(checked) =>
                    onChange(checked === true ? "true" : "false")
                  }
                  disabled={isBusy}
                />
                <Label htmlFor="packet_field_checkbox_value" className="font-normal">
                  Checked
                </Label>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="packet_field_value">Value</Label>
                <Input
                  id="packet_field_value"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  disabled={isBusy}
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Current display:{" "}
              {formatPacketFieldDisplayValue(value, fieldView.field_type)}
            </p>

            {fieldView.hasPlacementOverride && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Placement override active</p>
                <p className="text-xs text-muted-foreground">
                  This field uses a packet-specific position. Reset to use the
                  template placement from the form definition.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetPlacement}
                  disabled={isBusy}
                >
                  {isResettingPlacement
                    ? "Resetting..."
                    : "Reset placement to template"}
                </Button>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isSubmitting ? "Saving..." : "Save value"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
