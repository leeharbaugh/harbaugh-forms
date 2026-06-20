"use client";

import { ContactDetail } from "@/components/contacts/contact-detail";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type ContactDetailPageProps = {
  contactId: number;
};

export function ContactDetailPage({ contactId }: ContactDetailPageProps) {
  if (!Number.isFinite(contactId)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid contact ID.</p>
        <Button variant="outline" asChild>
          <Link href="/contacts">Back to contacts</Link>
        </Button>
      </div>
    );
  }

  return <ContactDetail contactId={contactId} />;
}
