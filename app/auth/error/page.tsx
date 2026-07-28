import { AuthShell } from "@/components/auth-shell";
import {
  type AuthConfirmErrorCode,
  userFacingAuthConfirmMessage,
} from "@/lib/auth/email-otp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

const KNOWN_CODES = new Set<string>([
  "missing_token_hash",
  "missing_type",
  "missing_token_hash_and_type",
  "unsupported_type",
  "expired_or_invalid",
  "already_used",
  "otp_verification_failed",
  "pkce_exchange_failed",
  "session_failed",
  "missing_profile",
  "missing_organization_membership",
]);

function resolveMessage(raw: string | undefined): string {
  if (!raw) {
    return "An unexpected authentication error occurred. Ask the Harbaugh Forms administrator for help.";
  }
  if (KNOWN_CODES.has(raw)) {
    return userFacingAuthConfirmMessage(raw as AuthConfirmErrorCode);
  }
  // Never echo raw Supabase token/hash diagnostics from older links.
  if (/token hash|token_hash|otp|verify/i.test(raw)) {
    return userFacingAuthConfirmMessage("expired_or_invalid");
  }
  return "Something went wrong while confirming your email link. Ask the Harbaugh Forms administrator for a new invitation or password-reset email.";
}

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const message = resolveMessage(params?.error);

  return <p className="text-sm text-muted-foreground">{message}</p>;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              Unable to confirm this link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Suspense>
              <ErrorContent searchParams={searchParams} />
            </Suspense>
            <p className="text-sm text-muted-foreground">
              <Link href="/auth/login" className="underline underline-offset-4">
                Return to login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
