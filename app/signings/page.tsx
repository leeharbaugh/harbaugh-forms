import { SigningsListPage } from "@/components/signings/signings-list-page";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Signings | Harbaugh Forms",
  description: "Prepare and manage Native Signings",
};

export const instant = false;

export default async function Page() {
  await connection();
  if (!isNativeSigningEnabled()) {
    notFound();
  }

  return <SigningsListPage />;
}
