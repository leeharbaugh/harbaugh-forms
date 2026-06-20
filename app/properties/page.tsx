import { PropertiesPage } from "@/components/properties/properties-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Properties | Harbaugh Forms",
  description: "Manage properties for Harbaugh Forms",
};

export default function Page() {
  return <PropertiesPage />;
}
