"use client";

import { usePathname } from "next/navigation";

export function PacketsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFillFormEditor = /\/packets\/\d+\/forms\/\d+\/?$/.test(pathname);

  if (isFillFormEditor) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-5 py-8">{children}</div>
  );
}
