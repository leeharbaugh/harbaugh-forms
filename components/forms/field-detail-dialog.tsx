"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type Field,
  formatFieldDataType,
  formatFieldReference,
  formatFieldStatus,
  formatFieldWidgetType,
  isBooleanField,
} from "@/lib/types/field";
import {
  formatFieldSourceStatusDisplay,
  formatFieldSourceType,
  formatSourcePathDisplay,
  isFieldSourceType,
} from "@/lib/types/field-source";

type FieldDetailDialogProps = {
  open: boolean;
  field: Field | null;
  onClose: () => void;
  onEdit?: (field: Field) => void;
};

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b py-3 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd
        className={`break-words text-sm ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

export function FieldDetailDialog({
  open,
  field,
  onClose,
  onEdit,
}: FieldDetailDialogProps) {
  if (!open || !field) {
    return null;
  }

  const showDefaultChecked = isBooleanField(field);
  const sourceStatus = formatFieldSourceStatusDisplay(field);
  const sourcePathDisplay = formatSourcePathDisplay(
    field.source_type,
    field.source_path,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close field detail dialog"
      />
      <Card className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col shadow-lg">
        <CardHeader className="shrink-0">
          <CardTitle>{field.field_label ?? field.field_key}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Field {formatFieldReference(field.id)} · {field.field_key}
          </p>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          <dl>
            <DetailRow label="Field key" value={field.field_key} mono />
            <DetailRow label="Field name" value={field.field_name ?? ""} />
            <DetailRow label="Field label" value={field.field_label ?? ""} />
            <DetailRow
              label="Data type"
              value={formatFieldDataType(field.field_data_type)}
            />
            <DetailRow
              label="Widget type"
              value={formatFieldWidgetType(field.field_widget_type)}
            />
            <DetailRow label="Default value" value={field.default_value ?? ""} />
            {showDefaultChecked && (
              <DetailRow
                label="Default checked"
                value={field.default_checked ? "Yes" : "No"}
              />
            )}
            <DetailRow label="Required" value={field.required ? "Yes" : "No"} />
            <DetailRow label="Value source" value={sourceStatus.label} />
            {sourceStatus.status === "globally_mapped" && sourceStatus.detail && (
              <DetailRow label="Source mapping" value={sourceStatus.detail} mono />
            )}
            {sourceStatus.helperText && (
              <DetailRow label="Source notes" value={sourceStatus.helperText} />
            )}
            <DetailRow
              label="Source type"
              value={
                field.source_type && isFieldSourceType(field.source_type)
                  ? formatFieldSourceType(field.source_type)
                  : "—"
              }
            />
            <DetailRow label="Source path" value={sourcePathDisplay.rawPath} mono />
            {sourcePathDisplay.friendlyLabel &&
              sourcePathDisplay.friendlyLabel !== sourcePathDisplay.rawPath && (
                <DetailRow
                  label="Source path label"
                  value={sourcePathDisplay.friendlyLabel}
                />
              )}
            {sourcePathDisplay.example && (
              <DetailRow
                label="Example value"
                value={sourcePathDisplay.example}
              />
            )}
            <DetailRow
              label="Resolver key"
              value={field.resolver_key ?? ""}
              mono
            />
            <DetailRow
              label="Fallback value"
              value={field.fallback_value ?? ""}
            />
            <DetailRow label="Notes" value={field.notes ?? ""} />
            <DetailRow
              label="Status"
              value={formatFieldStatus(field.status)}
            />
            <DetailRow
              label="Created"
              value={formatTimestamp(field.create_date)}
            />
            <DetailRow
              label="Updated"
              value={formatTimestamp(field.update_date)}
            />
          </dl>
        </CardContent>
        <CardFooter className="shrink-0 flex-wrap justify-end gap-2">
          {onEdit && field.status !== "DELETED" && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onEdit(field)}
            >
              Edit field
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
