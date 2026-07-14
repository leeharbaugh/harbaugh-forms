import { PdfFieldEditorPage } from "@/components/forms/pdf-field-editor-page";
import {
  canMapFormFields,
  isActiveAppAdmin,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "PDF Field Mapping Editor | Harbaugh Forms",
  description: "Map reusable fields onto a form PDF template",
};

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

  const [{ data: profile }, { data: form }] = await Promise.all([
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

  const actor = {
    userId: user.id,
    isActiveAdmin: isActiveAppAdmin(profile),
  };

  if (!canMapFormFields(actor, form)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Global forms are managed by the administrator. Field mapping is
          read-only for your account.
        </p>
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
      <PdfFieldEditorGate formId={formId} />
    </Suspense>
  );
}
