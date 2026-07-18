import { FormDefaultsPage } from "@/components/forms/form-defaults-page";
import { Button } from "@/components/ui/button";
import {
  canOpenManageDefaults,
  isActiveAppAdmin,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Manage Defaults | Harbaugh Forms",
  description: "Configure My Defaults and Organization Defaults for a Global form",
};

async function FormDefaultsGate({ formId }: { formId: number }) {
  if (!Number.isFinite(formId)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid form ID.</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to Forms</Link>
        </Button>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [{ data: profile }, { data: form }, { data: memberships }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("status, app_role, onboarding_status")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("forms")
        .select("id, scope, owner_user_id, status, form_name")
        .eq("id", formId)
        .maybeSingle(),
      supabase
        .from("organization_members")
        .select("organization_id, membership_role, status")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE"),
    ]);

  if (!form) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Form not found.</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to Forms</Link>
        </Button>
      </div>
    );
  }

  const active = memberships ?? [];
  const actor = {
    userId: user.id,
    isActiveAdmin: isActiveAppAdmin(profile),
    memberOrganizationIds: active.map((row) => row.organization_id as string),
    orgAdminOrganizationIds: active
      .filter((row) => row.membership_role === "ORG_ADMIN")
      .map((row) => row.organization_id as string),
  };

  if (!canOpenManageDefaults(actor, form)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Manage Defaults is available only for active Global forms you can
          view. It does not edit the Global form template.
        </p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to Forms</Link>
        </Button>
      </div>
    );
  }

  return <FormDefaultsPage formId={formId} />;
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const formId = Number(id);

  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">
          Checking form permissions…
        </p>
      }
    >
      <FormDefaultsGate formId={formId} />
    </Suspense>
  );
}
