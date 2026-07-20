import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { FormDefaultsManager } from "@/components/forms/form-defaults-manager";
import { loadFormDefaultsPage } from "@/lib/field-defaults-management";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Form Defaults | Harbaugh Forms",
  description: "Manage Private and Organization defaults for a Global form",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ organizationId?: string }>;
};

export default async function FormDefaultsPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { organizationId } = await searchParams;
  const formId = Number(id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  if (!Number.isFinite(formId) || formId <= 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid form ID.</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to templates</Link>
        </Button>
      </div>
    );
  }

  const result = await loadFormDefaultsPage({
    formId,
    organizationId: organizationId ?? null,
  });

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{result.error}</p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to templates</Link>
        </Button>
      </div>
    );
  }

  return <FormDefaultsManager initialData={result.data} />;
}
