import { SigningsListPage } from "@/components/signings/signings-list-page";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Signings | Harbaugh Forms",
  description: "Prepare and manage Native Signings",
};

export default function Page() {
  if (!isNativeSigningEnabled()) {
    notFound();
  }

  return <SigningsListPage />;
}
