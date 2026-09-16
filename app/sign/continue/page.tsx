import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import {
  SIGNING_ENTRY_COOKIE_NAME,
  touchSigningEntrySession,
  validateSigningEntrySession,
} from "@/lib/signing/entry-sessions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Sign | Harbaugh Forms",
  description: "Review and sign your documents",
};

/** Cookie-backed entry may block on request-time session validation. */
export const instant = false;

/**
 * Participant entry shell.
 *
 * Reached only by redirect from `/sign/{token}`, which exchanged the invitation
 * bearer for the HttpOnly entry-session cookie read here. The session is
 * re-validated on every render — Signing still In Progress, credential still
 * current — and there is no signing ceremony yet: identity confirmation is shown
 * as pending until the ceremony ships in a later stage.
 */
async function SignContinueBody() {
  await connection();

  if (!isNativeSigningEnabled()) {
    notFound();
  }

  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get(SIGNING_ENTRY_COOKIE_NAME)?.value;
  if (!rawSessionToken) {
    notFound();
  }

  const admin = createAdminClient();
  const session = await validateSigningEntrySession(admin, rawSessionToken);
  if (!session) {
    notFound();
  }
  await touchSigningEntrySession(admin, session);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-5 py-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Harbaugh Forms
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {session.signingTitle}
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
              {session.participantEmail}
            </span>
          </div>
          <button
            type="button"
            disabled
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground opacity-60"
          >
            I am {session.participantFullName}
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

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-5">
          <p className="text-sm text-muted-foreground">Loading Signing…</p>
        </main>
      }
    >
      <SignContinueBody />
    </Suspense>
  );
}
