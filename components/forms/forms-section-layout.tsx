"use client";

import { FormsNav } from "@/components/forms/forms-nav";
import { usePathname } from "next/navigation";

export function FormsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname.startsWith("/forms/fields") ? "fields" : "templates";
  const isPdfEditor = /\/forms\/\d+\/editor\/?$/.test(pathname);

  if (isPdfEditor) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8">
      <FormsNav active={active} />
      {children}
    </div>
  );
}
