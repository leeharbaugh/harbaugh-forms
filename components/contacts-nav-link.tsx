"use client";

import {
  CONTACTS_LIST_RESET_EVENT,
  dispatchContactsListReset,
  isContactsRoute,
} from "@/lib/contacts-list-reset";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type ContactsNavLinkProps = {
  className?: string;
};

export function ContactsNavLink({ className }: ContactsNavLinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Link
      href="/contacts"
      className={className}
      onClick={(event) => {
        if (!isContactsRoute(pathname)) {
          return;
        }

        event.preventDefault();

        if (pathname !== "/contacts") {
          router.push("/contacts");
        }

        dispatchContactsListReset();
      }}
    >
      Contacts
    </Link>
  );
}
