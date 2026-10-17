import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SigningPlacementsPage } from "@/components/forms/signing-placements-page";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Signing placements | Harbaugh Forms",
  description: "Signing placement templates for one exact form version",
};

export const instant = false;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FormSigningPlacementsPage({ params }: PageProps) {
  await connection();
  if (!isNativeSigningEnabled()) notFound();
  const { id } = await params;
  const formId = Number(id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  if (!Number.isInteger(formId) || formId <= 0) redirect("/forms");

  return <SigningPlacementsPage formId={formId} />;
}
