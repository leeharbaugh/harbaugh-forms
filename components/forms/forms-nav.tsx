"use client";

import Link from "next/link";

type FormsNavProps = {
  active: "templates" | "fields";
};

export function FormsNav({ active }: FormsNavProps) {
  const linkClass = (section: FormsNavProps["active"]) =>
    section === active
      ? "border-b-2 border-foreground font-medium text-foreground"
      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground";

  return (
    <nav className="flex gap-6 border-b border-border text-sm">
      <Link href="/forms" className={`-mb-px pb-3 ${linkClass("templates")}`}>
        Templates
      </Link>
      <Link
        href="/forms/fields"
        className={`-mb-px pb-3 ${linkClass("fields")}`}
      >
        Fields
      </Link>
    </nav>
  );
}
