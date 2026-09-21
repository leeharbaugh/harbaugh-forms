import {
  listCompletedPackageArtifactsForSession,
} from "@/lib/signing/completed-package-authority";
import {
  SIGNING_COMPLETED_PACKAGE_COOKIE_NAME,
  validateCompletedPackageSession,
} from "@/lib/signing/completed-package-sessions";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Completed documents | Harbaugh Forms",
  description: "Download your completed Signing package",
};

/** Cookie-backed package session may block on request-time validation. */
export const instant = false;

function categoryLabel(category: string): string {
  switch (category) {
    case "COMPLETED_DOCUMENT":
      return "Completed document";
    case "AUDIT_CERTIFICATE":
      return "Audit certificate";
    case "COMBINED_PACKAGE":
      return "Combined package";
    default:
      return category;
  }
}

async function PackageBody() {
  await connection();

  if (!isNativeSigningEnabled()) {
    redirect("/sign/unavailable");
  }

  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get(
    SIGNING_COMPLETED_PACKAGE_COOKIE_NAME,
  )?.value;
  if (!rawSessionToken) {
    redirect("/sign/unavailable");
  }

  const admin = createAdminClient();
  const session = await validateCompletedPackageSession(admin, rawSessionToken);
  if (!session) {
    redirect("/sign/unavailable");
  }

  const artifacts = await listCompletedPackageArtifactsForSession({
    admin,
    session,
  });

  const senderLine = [session.senderDisplayName, session.brokerageName]
    .filter((part) => Boolean(part && part.trim()))
    .join(" · ");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Harbaugh Forms</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Completed documents
        </h1>
        <p className="text-sm text-muted-foreground">{session.signingTitle}</p>
        {senderLine ? (
          <p className="text-sm text-muted-foreground">{senderLine}</p>
        ) : null}
      </header>

      {artifacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No downloadable documents are available yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {artifacts.map((artifact) => (
            <li key={artifact.artifactId}>
              <a
                className="block rounded-md border border-border px-4 py-3 text-sm hover:bg-muted/40"
                href={`/sign/package/artifact/${artifact.artifactId}`}
              >
                <span className="font-medium">{artifact.frozenFilename}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {categoryLabel(artifact.category)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function SignPackagePage() {
  return (
    <Suspense fallback={null}>
      <PackageBody />
    </Suspense>
  );
}
