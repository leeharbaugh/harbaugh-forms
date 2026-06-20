import { ContactDetailPage } from "@/components/contacts/contact-detail-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Detail | Harbaugh Forms",
  description: "View a contact and associated packets",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ContactDetailPage contactId={Number(id)} />;
}
