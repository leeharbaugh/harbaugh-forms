import { AuthShell } from "@/components/auth-shell";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function ChangePasswordContent() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Session required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Sign in to change your password.</p>
          <p>
            <Link href="/auth/login" className="underline underline-offset-4">
              Return to login
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.must_change_password) {
    redirect("/");
  }

  return <UpdatePasswordForm mode="forced" />;
}

export default function ChangePasswordPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading…</p>
        }
      >
        <ChangePasswordContent />
      </Suspense>
    </AuthShell>
  );
}
