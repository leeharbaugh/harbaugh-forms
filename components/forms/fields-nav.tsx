"use client";

import Link from "next/link";
import { navLinkClass } from "@/lib/ui/nav-styles";

type FieldsNavProps = {
  active: "catalog" | "cleanup";
};

export function FieldsNav({ active }: FieldsNavProps) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border pb-3 text-sm"
      aria-label="Fields sections"
    >
      <Link
        href="/forms/fields"
        className={navLinkClass(active === "catalog")}
        aria-current={active === "catalog" ? "page" : undefined}
      >
        Catalog
      </Link>
      <Link
        href="/forms/fields/cleanup"
        className={navLinkClass(active === "cleanup")}
        aria-current={active === "cleanup" ? "page" : undefined}
      >
        Merge Fields
      </Link>
    </nav>
  );
}
