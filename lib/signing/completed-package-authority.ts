/**
 * Completed-package authority helpers.
 *
 * After COMPLETE, `canManage` is false but association/admin fields remain
 * populated — reconstruct management eligibility for copy-recipient and
 * delivery operations without reopening unfinished Signing manage.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SigningAuthorityResult } from "./authority";
import type { SigningArtifactRow } from "./artifacts";
import type { ValidatedCompletedPackageSession } from "./completed-package-sessions";

/**
 * True only when lifecycle is COMPLETE and the actor would manage if the
 * Signing were still unfinished (PRIMARY/CO_AGENT, active TC, or ORG_ADMIN).
 * Revoked TC retains only historicalOperatorAssociation → false.
 */
export function canManageCompletedSigningOperations(
  authority: SigningAuthorityResult,
  lifecycleState: string,
): boolean {
  if (lifecycleState !== "COMPLETE") {
    return false;
  }
  if (authority.isBrokerageAdministrator) {
    return true;
  }
  if (
    authority.activeAssociation &&
    (authority.activeAssociation.associationRole === "PRIMARY" ||
      authority.activeAssociation.associationRole === "CO_AGENT")
  ) {
    return true;
  }
  if (authority.activeOperatorAssociation) {
    return true;
  }
  return false;
}

export type CompletedPackageArtifactListItem = {
  artifactId: string;
  category: SigningArtifactRow["artifact_category"];
  frozenFilename: string;
  byteSize: number | null;
};

/**
 * List verified completed-package artifacts for a valid package session.
 * COMPLETE-only (enforced by session validation). Includes COMPLETED_DOCUMENT,
 * AUDIT_CERTIFICATE, and COMBINED_PACKAGE when present.
 */
export async function listCompletedPackageArtifactsForSession(options: {
  admin: SupabaseClient;
  session: ValidatedCompletedPackageSession;
}): Promise<CompletedPackageArtifactListItem[]> {
  const { data: signing, error: signingError } = await options.admin
    .from("signings")
    .select("id, lifecycle_state, frozen_package_revision_id")
    .eq("id", options.session.signingId)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);
  if (!signing || signing.lifecycle_state !== "COMPLETE") {
    return [];
  }

  const frozenRevisionId = signing.frozen_package_revision_id as string | null;
  if (!frozenRevisionId) {
    return [];
  }

  const { data, error } = await options.admin
    .from("signing_artifacts")
    .select(
      "id, artifact_category, frozen_filename, byte_size, verified_at, package_revision_document_id",
    )
    .eq("signing_id", options.session.signingId)
    .eq("package_revision_id", frozenRevisionId)
    .in("artifact_category", [
      "COMPLETED_DOCUMENT",
      "AUDIT_CERTIFICATE",
      "COMBINED_PACKAGE",
    ])
    .not("verified_at", "is", null)
    .order("artifact_category", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    artifact_category: SigningArtifactRow["artifact_category"];
    frozen_filename: string;
    byte_size: number | null;
    package_revision_document_id: string | null;
  }>;

  // Stable order: completed docs by revision-document id, then certificate, then combined.
  const completed = rows
    .filter((row) => row.artifact_category === "COMPLETED_DOCUMENT")
    .sort((a, b) =>
      String(a.package_revision_document_id ?? "").localeCompare(
        String(b.package_revision_document_id ?? ""),
      ),
    );
  const certificate = rows.filter(
    (row) => row.artifact_category === "AUDIT_CERTIFICATE",
  );
  const combined = rows.filter(
    (row) => row.artifact_category === "COMBINED_PACKAGE",
  );

  return [...completed, ...certificate, ...combined].map((row) => ({
    artifactId: row.id,
    category: row.artifact_category,
    frozenFilename: row.frozen_filename,
    byteSize: row.byte_size == null ? null : Number(row.byte_size),
  }));
}

/**
 * Load one verified artifact belonging to the session's completed Signing.
 */
export async function loadCompletedPackageArtifactForSession(options: {
  admin: SupabaseClient;
  session: ValidatedCompletedPackageSession;
  artifactId: string;
}): Promise<SigningArtifactRow | null> {
  const { data: signing, error: signingError } = await options.admin
    .from("signings")
    .select("id, lifecycle_state, frozen_package_revision_id")
    .eq("id", options.session.signingId)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);
  if (!signing || signing.lifecycle_state !== "COMPLETE") {
    return null;
  }
  const frozenRevisionId = signing.frozen_package_revision_id as string | null;
  if (!frozenRevisionId) {
    return null;
  }

  const { data, error } = await options.admin
    .from("signing_artifacts")
    .select("*")
    .eq("id", options.artifactId)
    .eq("signing_id", options.session.signingId)
    .eq("package_revision_id", frozenRevisionId)
    .in("artifact_category", [
      "COMPLETED_DOCUMENT",
      "AUDIT_CERTIFICATE",
      "COMBINED_PACKAGE",
    ])
    .not("verified_at", "is", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id as string,
    signing_id: data.signing_id as string,
    package_revision_id: data.package_revision_id as string,
    signing_document_version_id:
      (data.signing_document_version_id as string | null) ?? null,
    signing_document_id: (data.signing_document_id as string | null) ?? null,
    package_revision_document_id:
      (data.package_revision_document_id as string | null) ?? null,
    artifact_category: data.artifact_category as SigningArtifactRow["artifact_category"],
    storage_bucket: data.storage_bucket as string,
    storage_object_key: data.storage_object_key as string,
    content_sha256: (data.content_sha256 as string | null) ?? null,
    byte_size: data.byte_size == null ? null : Number(data.byte_size),
    page_count: data.page_count == null ? null : Number(data.page_count),
    frozen_filename: data.frozen_filename as string,
    generated_at: data.generated_at as string,
    verified_at: (data.verified_at as string | null) ?? null,
    audit_history_sequence_boundary:
      data.audit_history_sequence_boundary == null
        ? null
        : Number(data.audit_history_sequence_boundary),
    idempotency_key: (data.idempotency_key as string | null) ?? null,
  };
}
