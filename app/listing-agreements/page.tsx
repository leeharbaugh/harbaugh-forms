import { ListingAgreementsPage } from "@/components/listing-agreements/listing-agreements-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Listing Agreements | Harbaugh Forms",
  description: "Manage listing representation agreements for Harbaugh Forms",
};

export default function Page() {
  return <ListingAgreementsPage />;
}
