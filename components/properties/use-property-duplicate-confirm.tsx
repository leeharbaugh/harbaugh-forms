"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  formatPropertyDuplicateConfirmMessage,
  PROPERTY_DUPLICATE_TITLE,
  type PropertyDuplicateChoice,
  type PropertyDuplicatePromptInfo,
} from "@/lib/property-duplicate";
import { useCallback, useRef, useState } from "react";

type PendingPrompt = {
  formattedAddress: string;
  resolve: (choice: PropertyDuplicateChoice) => void;
};

export function usePropertyDuplicateConfirm() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const pendingRef = useRef<PendingPrompt | null>(null);

  const promptDuplicate = useCallback(
    (info: PropertyDuplicatePromptInfo): Promise<PropertyDuplicateChoice> => {
      return new Promise((resolve) => {
        const next: PendingPrompt = {
          formattedAddress: info.formattedAddress,
          resolve,
        };
        pendingRef.current = next;
        setPending(next);
      });
    },
    [],
  );

  const finish = useCallback((choice: PropertyDuplicateChoice) => {
    const current = pendingRef.current;
    if (!current) {
      return;
    }

    pendingRef.current = null;
    setPending(null);
    current.resolve(choice);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={pending != null}
      title={PROPERTY_DUPLICATE_TITLE}
      message={
        pending
          ? formatPropertyDuplicateConfirmMessage(pending.formattedAddress)
          : ""
      }
      confirmLabel="Update property"
      cancelLabel="No, go back"
      onConfirm={() => finish("update")}
      onCancel={() => finish("cancel")}
    />
  );

  return { promptDuplicate, dialog };
}
