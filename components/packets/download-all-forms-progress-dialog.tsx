"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type DownloadAllFormsProgressDialogProps = {
  open: boolean;
  completed: number;
  total: number;
  currentDocumentName: string | null;
};

export function DownloadAllFormsProgressDialog({
  open,
  completed,
  total,
  currentDocumentName,
}: DownloadAllFormsProgressDialogProps) {
  if (!open) {
    return null;
  }

  const percent =
    total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const preparing = completed === 0 && !currentDocumentName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <Card className="relative z-10 w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Downloading forms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {preparing
              ? "Preparing download..."
              : currentDocumentName
                ? `Saving ${currentDocumentName} (${completed} of ${total})`
                : `Saved ${completed} of ${total} forms`}
          </p>
          <div className="space-y-2">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Download progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{percent}% complete</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
