"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import type { FormDefaultsPageData } from "@/lib/field-defaults-management";
import Link from "next/link";

const PdfMySetupEditor = dynamic(
  () =>
    import("@/components/forms/pdf-my-setup-editor").then(
      (module) => module.PdfMySetupEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading My setup…</p>
    ),
  },
);

type PdfMySetupEditorPageProps = {
  formId: number;
  initialDefaults: FormDefaultsPageData;
};

export function PdfMySetupEditorPage({
  formId,
  initialDefaults,
}: PdfMySetupEditorPageProps) {
  if (!Number.isFinite(formId)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid form ID.</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to forms</Link>
        </Button>
      </div>
    );
  }

  return (
    <PdfMySetupEditor formId={formId} initialDefaults={initialDefaults} />
  );
}
