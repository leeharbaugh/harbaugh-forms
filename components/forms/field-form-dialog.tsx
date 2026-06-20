"use client";

import { FieldForm } from "@/components/forms/field-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FieldAdminInput } from "@/lib/types/field";

type FieldFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  title: string;
  description: string;
  value: FieldAdminInput;
  onChange: (value: FieldAdminInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  fieldId?: string | null;
};

export function FieldFormDialog({
  open,
  mode,
  title,
  description,
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  fieldId = null,
}: FieldFormDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
        disabled={isSubmitting}
        aria-label="Close field form dialog"
      />
      <Card className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col shadow-lg">
        <CardHeader className="shrink-0">
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          <FieldForm
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            onCancel={onCancel}
            isSubmitting={isSubmitting}
            error={error}
            mode={mode}
            fieldId={fieldId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
