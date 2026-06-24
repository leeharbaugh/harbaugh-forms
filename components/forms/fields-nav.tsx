"use client";

import Link from "next/link";

type FieldsNavProps = {
  active: "catalog" | "cleanup";
};

export function FieldsNav({ active }: FieldsNavProps) {
  const linkClass = (section: FieldsNavProps["active"]) =>
    section === active
      ? "border-b-2 border-foreground font-medium text-foreground"
      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground";

  return (
    <nav className="flex gap-5 border-b border-border text-sm">
      <Link
        href="/forms/fields"
        className={`-mb-px pb-2 ${linkClass("catalog")}`}
      >
        Catalog
      </Link>
      <Link
        href="/forms/fields/cleanup"
        className={`-mb-px pb-2 ${linkClass("cleanup")}`}
      >
        Merge Fields
      </Link>
    </nav>
  );
}
