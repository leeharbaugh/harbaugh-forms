import { FieldCleanupPage } from "@/components/forms/field-cleanup-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Merge Fields | Harbaugh Forms",
  description: "Review duplicate and form-specific field merge candidates",
};

export default function Page() {
  return <FieldCleanupPage />;
}
