"use client";

import Link from "next/link";
import { navLinkClass } from "@/lib/ui/nav-styles";

type FormsNavProps = {
  active: "templates" | "fields";
};

export function FormsNav({ active }: FormsNavProps) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border pb-3 text-sm"
      aria-label="Forms sections"
    >
      <Link
        href="/forms"
        className={navLinkClass(active === "templates")}
        aria-current={active === "templates" ? "page" : undefined}
      >
        Templates
      </Link>
      <Link
        href="/forms/fields"
        className={navLinkClass(active === "fields")}
        aria-current={active === "fields" ? "page" : undefined}
      >
        Fields
      </Link>
    </nav>
  );
}
