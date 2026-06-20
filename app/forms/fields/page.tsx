import { FieldsPage } from "@/components/forms/fields-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fields | Harbaugh Forms",
  description: "Manage reusable business field definitions",
};

export default function Page() {
  return <FieldsPage />;
}
