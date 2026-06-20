import { FormsPage } from "@/components/forms/forms-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forms | Harbaugh Forms",
  description: "Manage blank PDF forms for Harbaugh Forms",
};

export default function Page() {
  return <FormsPage />;
}
