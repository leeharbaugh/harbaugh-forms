"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buildSoftDeleteMessage } from "@/lib/ui/soft-delete-message";

function titleCaseObjectType(objectType: string): string {
  return objectType
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export { buildSoftDeleteMessage };

type ConfirmDeleteDialogProps = {
  open: boolean;
  /** Object type shown in the title, e.g. "contact" → "Delete Contact?" */
  objectType: string;
  itemName?: string | null;
  /** Full body override. When omitted, a soft-delete message is built. */
  description?: string;
  /** Extra consequence sentence after the remove line. */
  consequence?: string;
  /** When true, default wording mentions restore. */
  canRestore?: boolean;
  /** Override the auto-generated title (e.g. "Remove packet form?"). */
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  confirmingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  elevated?: boolean;
};

export function ConfirmDeleteDialog({
  open,
  objectType,
  itemName,
  description,
  consequence,
  canRestore = false,
  title,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isConfirming = false,
  confirmingLabel = "Deleting…",
  onConfirm,
  onCancel,
  elevated = false,
}: ConfirmDeleteDialogProps) {
  const resolvedTitle = title ?? `Delete ${titleCaseObjectType(objectType)}?`;
  const message =
    description ??
    buildSoftDeleteMessage({
      objectType,
      itemName,
      consequence,
      canRestore,
    });

  return (
    <ConfirmDialog
      open={open}
      title={resolvedTitle}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      isConfirming={isConfirming}
      confirmingLabel={confirmingLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
      variant="destructive"
      elevated={elevated}
      initialFocus="cancel"
    />
  );
}
