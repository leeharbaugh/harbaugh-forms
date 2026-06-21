import { AppNav } from "@/components/app-nav";
import { PacketsSectionLayout } from "@/components/packets/packets-section-layout";
import { Suspense } from "react";

export default function PacketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <AppNav active="packets" />
      <Suspense>
        <PacketsSectionLayout>{children}</PacketsSectionLayout>
      </Suspense>
    </main>
  );
}
