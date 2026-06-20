import { FieldModelGuidePage } from "@/components/form-field-mappings/field-model-guide-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Field model | Harbaugh Forms",
  description: "How fields, template placement, and packet values work",
};

export default function Page() {
  return <FieldModelGuidePage />;
}
