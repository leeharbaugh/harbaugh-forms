import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  parseSigningCeremonyExitOutcome,
  SIGNING_CEREMONY_EXIT_COPY,
} from "@/lib/signing/ceremony-exit";
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Sign | Harbaugh Forms",
  description: "Your signing session has ended",
};

export const instant = false;

/** Where a remote participant lands after Finish, Decline, or Exit. */
export default async function SignDonePage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string | string[] }>;
}) {
  await connection();
  if (!isNativeSigningEnabled()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <p className="text-sm text-muted-foreground">
          {SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE}
        </p>
      </main>
    );
  }

  const { outcome } = await searchParams;
  const copy = SIGNING_CEREMONY_EXIT_COPY[parseSigningCeremonyExitOutcome(outcome)];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </CardContent>
      </Card>
    </main>
  );
}
