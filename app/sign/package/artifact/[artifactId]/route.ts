/**
 * Stream a verified completed-package artifact after session validation.
 */
import { appendCompletedPackageAccessLog } from "@/lib/signing/completed-package-access";
import { loadCompletedPackageArtifactForSession } from "@/lib/signing/completed-package-authority";
import {
  SIGNING_COMPLETED_PACKAGE_COOKIE_NAME,
  validateCompletedPackageSession,
} from "@/lib/signing/completed-package-sessions";
import { downloadArtifactBytes } from "@/lib/signing/artifacts";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function notFoundResponse(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ artifactId: string }> },
): Promise<NextResponse> {
  if (!isNativeSigningEnabled()) {
    return notFoundResponse();
  }

  const { artifactId } = await context.params;
  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get(
    SIGNING_COMPLETED_PACKAGE_COOKIE_NAME,
  )?.value;
  if (!rawSessionToken) {
    return notFoundResponse();
  }

  const admin = createAdminClient();
  const session = await validateCompletedPackageSession(admin, rawSessionToken);
  if (!session) {
    return notFoundResponse();
  }

  const artifact = await loadCompletedPackageArtifactForSession({
    admin,
    session,
    artifactId,
  });
  if (!artifact) {
    return notFoundResponse();
  }

  const bytes = await downloadArtifactBytes({ admin, artifact });
  if (!bytes) {
    return notFoundResponse();
  }

  try {
    await appendCompletedPackageAccessLog({
      admin,
      signingId: session.signingId,
      accessKind: "ARTIFACT_DOWNLOADED",
      outcome: "SUCCEEDED",
      completedPackageCredentialId: session.credentialId,
      completedPackageSessionId: session.sessionId,
      signingParticipantId: session.signingParticipantId,
      signingCopyRecipientId: session.signingCopyRecipientId,
      signingArtifactId: artifact.id,
    });
  } catch (error) {
    console.error(
      "[native-signing-completion-delivery] artifact access log failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const filename = artifact.frozen_filename.replace(/"/g, "");
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
