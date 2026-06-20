import { FormDetailPage } from "@/components/forms/form-detail-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Form Template Detail | Harbaugh Forms",
  description: "View a form template and open the PDF field mapping editor",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const formId = Number(id);

  return <FormDetailPage formId={formId} />;
}
