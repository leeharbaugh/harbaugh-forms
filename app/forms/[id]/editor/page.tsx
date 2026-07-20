import { PdfFieldEditorPage } from "@/components/forms/pdf-field-editor-page";
import { PdfMySetupEditorPage } from "@/components/forms/pdf-my-setup-editor-page";
import { loadFormDefaultsPage } from "@/lib/field-defaults-management";
import {
  canMapFormFields,
  canViewForm,
  isActiveAppAdmin,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import { canOfferFormDefaultsManagement } from "@/lib/types/field-default-management";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Map Fields | Harbaugh Forms",
  description: "Map fields and manage defaults on a form PDF template",
};

/**
 * Unified Map Fields workspace.
 * Application Admins who can structurally edit Global forms open the template
 * editor. Everyone else who may view an active Global form opens the
 * defaults-aware read/placement-locked workspace.
 * Legacy ?mode=my-setup is accepted and treated the same as the unified route.
 */
async function PdfFieldEditorGate({ formId }: { formId: number }) {
  if (!Number.isFinite(formId)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid form ID.</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to forms</Link>
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

  const [{ data: profile }, { data: memberships }, { data: form }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("status, app_role, onboarding_status")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("organization_members")
        .select("organization_id, membership_role, status")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE"),
      supabase
        .from("forms")
        .select("id, scope, owner_user_id, status, form_name")
        .eq("id", formId)
        .maybeSingle(),
    ]);

  if (!form) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Form not found.</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to forms</Link>
        </Button>
      </div>
    );
  }

  const activeMemberships = memberships ?? [];
  const actor = {
    userId: user.id,
    isActiveAdmin: isActiveAppAdmin(profile),
    memberOrganizationIds: activeMemberships.map(
      (row) => row.organization_id as string,
    ),
    orgAdminOrganizationIds: activeMemberships
      .filter((row) => row.membership_role === "ORG_ADMIN")
      .map((row) => row.organization_id as string),
  };

  const canStructure = canMapFormFields(actor, form);
  const canDefaultsWorkspace =
    canOfferFormDefaultsManagement(form) && canViewForm(actor, form);

  if (canStructure) {
    return <PdfFieldEditorPage formId={formId} />;
  }

  if (canDefaultsWorkspace) {
    const defaultsResult = await loadFormDefaultsPage({ formId });
    if (!defaultsResult.ok) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-destructive">{defaultsResult.error}</p>
          <Button variant="outline" asChild>
            <Link href="/forms">Back to forms</Link>
          </Button>
        </div>
      );
    }

    return (
      <PdfMySetupEditorPage
        formId={formId}
        initialDefaults={defaultsResult.data}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Map Fields is available for active Global forms, or for forms you are
        allowed to edit.
      </p>
      <Button variant="outline" asChild>
        <Link href="/forms">Back to forms</Link>
      </Button>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
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
      <PdfFieldEditorGate formId={formId} />
    </Suspense>
  );
}
