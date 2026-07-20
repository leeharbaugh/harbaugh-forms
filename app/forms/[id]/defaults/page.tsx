import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { mySetupEditorPath } from "@/lib/types/field-default-management";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Form Defaults | Harbaugh Forms",
  description: "Manage Private and Organization defaults for a Global form",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ organizationId?: string }>;
};

/**
 * Standalone long-list Defaults UI is no longer the primary entry point.
 * Redirect into visual My setup mode.
 */
export default async function FormDefaultsPage({ params }: PageProps) {
  const { id } = await params;
  const formId = Number(id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  if (!Number.isFinite(formId) || formId <= 0) {
    redirect("/forms");
  }

  redirect(mySetupEditorPath(formId));
}
