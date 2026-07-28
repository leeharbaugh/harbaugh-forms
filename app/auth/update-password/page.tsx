import { AuthShell } from "@/components/auth-shell";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

async function UpdatePasswordContent({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Session required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Open a fresh invitation or password-reset email link to create or
              change your password. Those links establish a secure session
              before this page can be used.
            </p>
            <p>
              <Link href="/auth/login" className="underline underline-offset-4">
                Return to login
              </Link>
              {" · "}
              <Link
                href="/auth/forgot-password"
                className="underline underline-offset-4"
              >
                Request a password reset
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_status")
    .eq("id", user.id)
    .maybeSingle();

  const inviteMode =
    params.mode === "invite" || profile?.onboarding_status === "INVITED";

  return <UpdatePasswordForm mode={inviteMode ? "invite" : "reset"} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading…</p>
        }
      >
        <UpdatePasswordContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
