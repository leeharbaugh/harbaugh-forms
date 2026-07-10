"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  confirmingLabel?: string;
  /** Extra disable for confirm (e.g. still loading prerequisite data). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "destructive" | "default";
  /** Use elevated z-index when shown over another modal (e.g. download progress). */
  elevated?: boolean;
  /** Prefer focusing the cancel button (default for destructive). */
  initialFocus?: "cancel" | "confirm";
  className?: string;
};

export function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isConfirming = false,
  confirmingLabel = "Working...",
  confirmDisabled = false,
  onConfirm,
  onCancel,
  variant = "default",
  elevated = false,
  initialFocus,
  className,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const isConfirmingRef = useRef(isConfirming);

  onCancelRef.current = onCancel;
  isConfirmingRef.current = isConfirming;

  const resolvedInitialFocus =
    initialFocus ?? (variant === "destructive" ? "cancel" : "confirm");

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusTarget =
      resolvedInitialFocus === "cancel"
        ? cancelButtonRef.current
        : confirmButtonRef.current;
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isConfirmingRef.current) {
          return;
        }
        event.preventDefault();
        onCancelRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, resolvedInitialFocus]);

  if (!open) {
    return null;
  }

  const description = children ?? (
    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
      {message}
    </p>
  );

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${elevated ? "z-[60]" : "z-50"}`}
    >
      <div
        role="presentation"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => {
          if (!isConfirming) {
            onCancel();
          }
        }}
      />
      <Card
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn("relative z-10 w-full max-w-md shadow-lg", className)}
      >
        <CardHeader>
          <CardTitle id={titleId}>{title}</CardTitle>
        </CardHeader>
        <CardContent id={descriptionId}>{description}</CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isConfirming || confirmDisabled}
          >
            {isConfirming ? confirmingLabel : confirmLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
