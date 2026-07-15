"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Field } from "@/lib/types/field";
import { formatFieldReference } from "@/lib/types/field";
import type { FieldUsageCounts } from "@/lib/field-retire";
import { isFieldInUse } from "@/lib/field-retire";

type FieldRetireConfirmDialogProps = {
  open: boolean;
  field: Field | null;
  usage: FieldUsageCounts | null;
  isLoadingUsage: boolean;
  isConfirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function UsageCountRow({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{count}</span>
    </div>
  );
}

export function FieldRetireConfirmDialog({
  open,
  field,
  usage,
  isLoadingUsage,
  isConfirming,
  onConfirm,
  onCancel,
}: FieldRetireConfirmDialogProps) {
  if (!field) {
    return null;
  }

  const fieldLabel = field.field_label ?? field.field_key;
  const inUse = usage != null && isFieldInUse(usage);

  return (
    <ConfirmDialog
      open={open}
      title="Retire field globally?"
      confirmLabel="Retire field globally"
      confirmingLabel="Retiring…"
      cancelLabel="Cancel"
      variant="destructive"
      isConfirming={isConfirming}
      confirmDisabled={isLoadingUsage}
      onConfirm={onConfirm}
      onCancel={onCancel}
      className="max-h-[90vh] max-w-lg overflow-y-auto"
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {fieldLabel} ({formatFieldReference(field.id)})
        </p>
        {isLoadingUsage ? (
          <p className="text-muted-foreground">Checking field usage…</p>
        ) : inUse ? (
          <>
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
              This field is currently used on one or more forms and/or packet
              forms. Retiring it will remove it from all form templates, packet
              form values, and packet-specific placement overrides. Use this
              only when you truly want to retire this field globally.
            </p>

            {usage && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="font-medium">Current usage</p>
                <UsageCountRow
                  label="Form template placements"
                  count={usage.formFieldMappings}
                />
                <UsageCountRow
                  label="Packet field values"
                  count={usage.fieldInstances}
                />
                <UsageCountRow
                  label="Packet placement overrides"
                  count={usage.fieldInstanceMappings}
                />
              </div>
            )}

            <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-foreground">
              <p className="font-medium text-warning">Safer alternatives</p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                <li>
                  If you only want to remove this field from one form, open
                  that form&apos;s PDF editor and choose Remove From This Form.
                </li>
                <li>
                  If you only want to rename the field or change its label,
                  edit the field instead of retiring it.
                </li>
              </ul>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            This field is not currently used on any form templates or packet
            forms. Retiring will mark the field definition as deleted globally.
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
