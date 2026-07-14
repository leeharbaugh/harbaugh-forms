import { FieldCleanupPage } from "@/components/forms/field-cleanup-page";
import { Button } from "@/components/ui/button";
import { isActiveAppAdmin } from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Merge Fields | Harbaugh Forms",
  description: "Review duplicate and form-specific field merge candidates",
};

async function FieldCleanupGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, app_role, onboarding_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!isActiveAppAdmin(profile)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Field catalog cleanup is available to administrators only. Global
          fields are managed by the administrator.
        </p>
        <Button variant="outline" asChild>
          <Link href="/forms/fields">Back to fields</Link>
        </Button>
      </div>
    );
  }

  return <FieldCleanupPage />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">
          Checking field permissions…
        </p>
      }
    >
      <FieldCleanupGate />
    </Suspense>
  );
}
