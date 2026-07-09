"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "destructive" | "default";
  /** Use elevated z-index when shown over another modal (e.g. download progress). */
  elevated?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isConfirming = false,
  onConfirm,
  onCancel,
  variant = "default",
  elevated = false,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${elevated ? "z-[60]" : "z-50"}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
        disabled={isConfirming}
        aria-label="Close dialog"
      />
      <Card className="relative z-10 w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? "Working..." : confirmLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
