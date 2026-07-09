"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type InfoDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
};

export function InfoDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  onClose,
}: InfoDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <Card className="relative z-10 w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {message}
          </p>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="button" onClick={onClose}>
            {confirmLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
