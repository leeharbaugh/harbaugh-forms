import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { validateParticipantCredential } from "@/lib/signing/credentials";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Sign | Harbaugh Forms",
  description: "Review and sign your documents",
};

/** Bearer-token entry may block on request-time credential validation. */
export const instant = false;

/**
 * Participant entry shell.
 *
 * The token is resolved server-side only. There is no workspace navigation and
 * no signing ceremony here: identity confirmation is shown as pending until the
 * ceremony ships in a later stage.
 */
async function SignEntryBody({ token }: { token: string }) {
  await connection();

  if (!isNativeSigningEnabled()) {
    notFound();
  }

  const credential = await validateParticipantCredential(
    createAdminClient(),
    token,
  );
  if (!credential) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-5 py-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Harbaugh Forms
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {credential.signingTitle}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirm who you are</CardTitle>
          <CardDescription>
            Signing ceremony access for this participant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">In Progress</Badge>
            <span className="text-sm text-muted-foreground">
              {credential.participantEmail}
            </span>
          </div>
          <button
            type="button"
            disabled
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground opacity-60"
          >
            I am {credential.participantFullName}
          </button>
          <p className="text-sm text-muted-foreground">
            The signing ceremony is not available yet. Your access link is
            valid; please wait for the agent to complete ceremony enablement.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-5">
          <p className="text-sm text-muted-foreground">Loading Signing…</p>
        </main>
      }
    >
      <SignEntryBody token={token} />
    </Suspense>
  );
}
