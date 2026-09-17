import { CeremonyShell } from "@/components/sign/ceremony-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  resolveCeremonyBrowserSession,
  SIGNING_CEREMONY_COOKIE_NAME,
} from "@/lib/signing/browser-sessions";
import { loadCeremonyOverview } from "@/lib/signing/ceremony-context";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
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

/** Ceremony state is request-time only; never prerender or cache it. */
export const instant = false;

/**
 * Participant ceremony.
 *
 * Authority is the `hf_signing_ceremony` cookie created by "I am [Name]" — not
 * the Stage 4 entry cookie. An expired or superseded session renders the
 * reopen-link message rather than a bare error, because accepted server state
 * survives and the participant simply needs to affirm identity again.
 */
async function SignCeremonyBody() {
  await connection();

  if (!isNativeSigningEnabled()) {
    notFound();
  }

  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get(SIGNING_CEREMONY_COOKIE_NAME)?.value;
  if (!rawSessionToken) {
    notFound();
  }

  const admin = createAdminClient();
  const resolved = await resolveCeremonyBrowserSession(admin, rawSessionToken);
  if (!resolved.ok) {
    if (resolved.code === "CEREMONY_FORBIDDEN") {
      notFound();
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            This signing session is no longer active
          </CardTitle>
          <CardDescription>{resolved.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Everything you already completed was saved. Reopen your Signing link
            and confirm your identity again to continue.
          </p>
        </CardContent>
      </Card>
    );
  }

  const overview = await loadCeremonyOverview({
    admin,
    session: resolved.session,
  });

  return <CeremonyShell initialOverview={overview} />;
}

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading Signing…</p>
        }
      >
        <SignCeremonyBody />
      </Suspense>
    </main>
  );
}
