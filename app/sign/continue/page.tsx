import { AffirmIdentityButton } from "@/components/sign/affirm-identity-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadPreAffirmationContext } from "@/lib/signing/ceremony-context";
import {
  SIGNING_ENTRY_COOKIE_NAME,
  touchSigningEntrySession,
  validateSigningEntrySession,
} from "@/lib/signing/entry-sessions";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import {
  SIGNING_HANDOFF_COOKIE_NAME,
  validateInPersonHandoff,
} from "@/lib/signing/in-person-handoff";
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
 * Pre-affirmation participant shell.
 *
 * Reached by redirect from `/sign/{token}` (remote invitation) or
 * `/sign/in-person/{token}` (supervised handoff), each of which exchanged its
 * bearer for an HttpOnly cookie read here.
 *
 * Disclosure is deliberately minimal and is the only thing shown before
 * "I am [Name]": the participant's name, the sending agent's name, the agent's
 * brokerage, and the neutral Signing title. No document titles, no PDF bytes,
 * no contractual detail, no field assignments, no signing progress, no other
 * participants' activity — and not the participant's email address either.
 */
async function SignContinueBody() {
  await connection();

  if (!isNativeSigningEnabled()) {
    notFound();
  }

  const cookieStore = await cookies();
  const rawEntryToken = cookieStore.get(SIGNING_ENTRY_COOKIE_NAME)?.value;
  const rawHandoffToken = cookieStore.get(SIGNING_HANDOFF_COOKIE_NAME)?.value;
  if (!rawEntryToken && !rawHandoffToken) {
    notFound();
  }

  const admin = createAdminClient();

  // A supervised handoff wins: the agent just handed the device to this
  // participant, so a stale entry cookie must not resolve a different person.
  let signingId: string | null = null;
  let signingParticipantId: string | null = null;
  let mode: "REMOTE" | "IN_PERSON" = "REMOTE";

  if (rawHandoffToken) {
    const handoff = await validateInPersonHandoff(admin, rawHandoffToken);
    if (handoff) {
      signingId = handoff.signingId;
      signingParticipantId = handoff.signingParticipantId;
      mode = "IN_PERSON";
    }
  }

  if (!signingId && rawEntryToken) {
    const entry = await validateSigningEntrySession(admin, rawEntryToken);
    if (entry) {
      signingId = entry.signingId;
      signingParticipantId = entry.signingParticipantId;
      mode = "REMOTE";
      await touchSigningEntrySession(admin, entry);
    }
  }

  if (!signingId || !signingParticipantId) {
    notFound();
  }

  const context = await loadPreAffirmationContext({
    admin,
    signingId,
    signingParticipantId,
    mode,
  });
  if (!context) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-5 py-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Harbaugh Forms
        </p>
        {context.signingTitle ? (
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {context.signingTitle}
          </h1>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirm who you are</CardTitle>
          <CardDescription>
            {context.mode === "IN_PERSON"
              ? "Your agent handed this device to you to sign."
              : "Continue only if you are the person named below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">You are signing as</dt>
              <dd className="font-medium text-foreground">
                {context.participantFullName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sent by</dt>
              <dd className="font-medium text-foreground">
                {context.senderDisplayName}
              </dd>
            </div>
            {context.brokerageName ? (
              <div>
                <dt className="text-muted-foreground">Brokerage</dt>
                <dd className="font-medium text-foreground">
                  {context.brokerageName}
                </dd>
              </div>
            ) : null}
          </dl>

          <AffirmIdentityButton
            participantFullName={context.participantFullName}
          />

          <p className="text-sm text-muted-foreground">
            Selecting this confirms you are {context.participantFullName} and
            starts your signing session. If this is not you, close this page and
            contact {context.senderDisplayName}.
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
