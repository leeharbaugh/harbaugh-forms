import { CollectionsPage } from "@/components/collections/collections-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collections | Harbaugh Forms",
  description: "Manage form collections for Harbaugh Forms",
};

export default function Page() {
  return <CollectionsPage />;
}
