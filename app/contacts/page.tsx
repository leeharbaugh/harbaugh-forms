import { ContactsPage } from "@/components/contacts/contacts-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contacts | Harbaugh Forms",
  description: "Manage contacts for Harbaugh Forms",
};

export default function Page() {
  return <ContactsPage />;
}
