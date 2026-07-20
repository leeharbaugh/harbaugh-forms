import { PdfFieldEditorPage } from "@/components/forms/pdf-field-editor-page";
import { PdfMySetupEditorPage } from "@/components/forms/pdf-my-setup-editor-page";
import { loadFormDefaultsPage } from "@/lib/field-defaults-management";
import {
  canMapFormFields,
  canViewForm,
  isActiveAppAdmin,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import {
  canOfferFormDefaultsManagement,
  parseFormEditorMode,
} from "@/lib/types/field-default-management";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Form Editor | Harbaugh Forms",
  description: "Visual form setup and PDF field mapping",
};

async function PdfFieldEditorGate({
  formId,
  modeParam,
}: {
  formId: number;
  modeParam: string | undefined;
}) {
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

  const mode = parseFormEditorMode(modeParam);
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

  if (mode === "my-setup") {
    if (!canOfferFormDefaultsManagement(form) || !canViewForm(actor, form)) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            My setup is available only for active Global forms.
          </p>
          <Button variant="outline" asChild>
            <Link href="/forms">Back to forms</Link>
          </Button>
        </div>
      );
    }

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

  if (!canMapFormFields(actor, form)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Global forms are managed by the administrator. Field mapping is
          read-only for your account.
        </p>
        {canOfferFormDefaultsManagement(form) ? (
          <Button variant="outline" asChild>
            <Link href={`/forms/${formId}/editor?mode=my-setup`}>
              Open My setup
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" asChild>
          <Link href="/forms">Back to forms</Link>
        </Button>
      </div>
    );
  }

  return <PdfFieldEditorPage formId={formId} />;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  const formId = Number(id);

  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">
          Checking form permissions…
        </p>
      }
    >
      <PdfFieldEditorGate formId={formId} modeParam={mode} />
    </Suspense>
  );
}
