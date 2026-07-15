"use client";

import {
  dispatchContactsListReset,
  isContactsRoute,
} from "@/lib/contacts-list-reset";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type ContactsNavLinkProps = {
  className?: string;
  active?: boolean;
};

export function ContactsNavLink({ className, active }: ContactsNavLinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Link
      href="/contacts"
      className={className}
      aria-current={active ? "page" : undefined}
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
