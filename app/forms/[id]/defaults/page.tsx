import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { mapFieldsEditorPath } from "@/lib/types/field-default-management";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Map Fields | Harbaugh Forms",
  description: "Map fields and manage defaults for a Global form",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

/** Legacy Defaults route — redirect into the unified Map Fields workspace. */
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

  redirect(mapFieldsEditorPath(formId));
}
