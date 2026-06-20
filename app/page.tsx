import { AppNav } from "@/components/app-nav";
import { PacketsPage } from "@/components/packets/packets-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Packets | Harbaugh Forms",
  description: "View generated packets for Harbaugh Forms",
};

export default function Home() {
  return (
    <main className="min-h-screen">
      <AppNav active="packets" />
      <div className="mx-auto flex max-w-6xl flex-col px-5 py-8">
        <PacketsPage />
      </div>
    </main>
  );
}
