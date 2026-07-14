import { ContactDetailPage } from "@/components/contacts/contact-detail-page";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Contact Detail | Harbaugh Forms",
  description: "View a contact and associated packets",
};

async function ContactDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ContactDetailPage contactId={Number(id)} />;
}

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ContactDetailRoute params={params} />
    </Suspense>
  );
}
