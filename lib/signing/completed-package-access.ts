/**
 * Operational completed-package access log (not Signing event chain).
 * Never records bearer or session secrets.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompletedPackageAccessKind =
  | "PACKAGE_SESSION_OPENED"
  | "ARTIFACT_DOWNLOADED"
  | "CREDENTIAL_REJECTED"
  | "SESSION_REJECTED";

export type CompletedPackageAccessOutcome =
  | "SUCCEEDED"
  | "DENIED"
  | "FAILED";

export async function appendCompletedPackageAccessLog(options: {
  admin: SupabaseClient;
  signingId: string;
  accessKind: CompletedPackageAccessKind;
  outcome?: CompletedPackageAccessOutcome;
  completedPackageCredentialId?: string | null;
  completedPackageSessionId?: string | null;
  signingParticipantId?: string | null;
  signingCopyRecipientId?: string | null;
  signingArtifactId?: string | null;
  safeDetail?: string | null;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_completed_package_access_log")
    .insert({
      signing_id: options.signingId,
      completed_package_credential_id:
        options.completedPackageCredentialId ?? null,
      completed_package_session_id: options.completedPackageSessionId ?? null,
      signing_participant_id: options.signingParticipantId ?? null,
      signing_copy_recipient_id: options.signingCopyRecipientId ?? null,
      signing_artifact_id: options.signingArtifactId ?? null,
      access_kind: options.accessKind,
      outcome: options.outcome ?? "SUCCEEDED",
      safe_detail: options.safeDetail
        ? options.safeDetail.slice(0, 500)
        : null,
    });
  if (error) throw new Error(error.message);
}
