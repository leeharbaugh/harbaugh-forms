import { PdfFieldEditorPage } from "@/components/forms/pdf-field-editor-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF Field Mapping Editor | Harbaugh Forms",
  description: "Map reusable fields onto a form PDF template",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const formId = Number(id);

  return <PdfFieldEditorPage formId={formId} />;
}
