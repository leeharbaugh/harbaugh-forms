"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function titleCaseObjectType(objectType: string): string {
  return objectType
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function buildSoftDeleteMessage(options: {
  objectType: string;
  itemName?: string | null;
  consequence?: string;
  canRestore?: boolean;
}): string {
  const { objectType, itemName, consequence, canRestore = false } = options;
  const trimmedName = itemName?.trim();
  const removeLine = trimmedName
    ? `This will remove ${trimmedName}.`
    : `This will remove this ${objectType.toLowerCase()}.`;

  const consequenceLine =
    consequence ??
    (canRestore
      ? "It will be hidden from normal use and can be restored later."
      : "This marks it as deleted and hides it from normal use.");

  return `${removeLine} ${consequenceLine}`;
}

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
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isConfirming = false,
  confirmingLabel = "Deleting...",
  onConfirm,
  onCancel,
  elevated = false,
}: ConfirmDeleteDialogProps) {
  const title = `Delete ${titleCaseObjectType(objectType)}?`;
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
      title={title}
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
