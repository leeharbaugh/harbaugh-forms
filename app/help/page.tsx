import { HelpGettingStarted } from "@/components/help/help-getting-started";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help & Getting Started | Harbaugh Forms",
  description:
    "A short walkthrough for Harbaugh Forms, plus how to reach support.",
};

export default function Page() {
  return (
    <HelpGettingStarted nativeSigningEnabled={isNativeSigningEnabled()} />
  );
}
