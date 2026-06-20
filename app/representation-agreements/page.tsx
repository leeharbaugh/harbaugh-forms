import { RepresentationAgreementsPage } from "@/components/representation-agreements/representation-agreements-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Representation Agreements | Harbaugh Forms",
  description: "Manage buyer representation agreements for Harbaugh Forms",
};

export default function Page() {
  return <RepresentationAgreementsPage />;
}
