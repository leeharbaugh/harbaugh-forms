import { SigningDashboardPage } from "@/components/signings/signing-dashboard-page";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { getSigningDashboardAction } from "@/lib/signing/stage4-actions";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Signing | Harbaugh Forms",
  description: "Prepare and activate a Signing",
};

export const instant = false;

export default async function Page({
  params,
}: {
  params: Promise<{ signingId: string }>;
}) {
  await connection();
  // Gate is server-side only: an incomplete Signing UI is never reachable
  // because the browser was told the feature exists.
  if (!isNativeSigningEnabled()) {
    notFound();
  }

  const { signingId } = await params;
  // Same authorized load as the client action: a Draft is auto-added and
  // identity-synced before this render, so the first paint is current.
  const initial = await getSigningDashboardAction({ signingId });

  return <SigningDashboardPage signingId={signingId} initial={initial} />;
}
