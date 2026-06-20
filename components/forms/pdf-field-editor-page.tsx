"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const PdfFieldEditor = dynamic(
  () =>
    import("@/components/forms/pdf-field-editor").then(
      (module) => module.PdfFieldEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading PDF field mapping editor...</p>
    ),
  },
);

type PdfFieldEditorPageProps = {
  formId: number;
};

export function PdfFieldEditorPage({ formId }: PdfFieldEditorPageProps) {
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

  return <PdfFieldEditor formId={formId} />;
}
