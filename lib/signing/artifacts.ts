/**
 * Native Signing Stage 6 artifact object keys, idempotency, and verified store.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "./prepare-pdf";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";

export type SigningArtifactCategory =
  | "COMPLETED_DOCUMENT"
  | "AUDIT_CERTIFICATE"
  | "COMBINED_PACKAGE";

export type SigningArtifactRow = {
  id: string;
  signing_id: string;
  package_revision_id: string;
  signing_document_version_id: string | null;
  signing_document_id: string | null;
  package_revision_document_id: string | null;
  artifact_category: SigningArtifactCategory;
  storage_bucket: string;
  storage_object_key: string;
  content_sha256: string | null;
  byte_size: number | null;
  page_count: number | null;
  frozen_filename: string;
  generated_at: string;
  verified_at: string | null;
  audit_history_sequence_boundary: number | null;
  idempotency_key: string | null;
};

export function newOpaqueArtifactId(): string {
  return randomUUID();
}

export function buildCompletedDocumentObjectKey(options: {
  signingId: string;
  artifactId: string;
}): string {
  return `signings/${options.signingId}/artifacts/completed/${options.artifactId}.pdf`;
}

export function buildAuditCertificateObjectKey(options: {
  signingId: string;
  artifactId: string;
}): string {
  return `signings/${options.signingId}/artifacts/certificate/${options.artifactId}.pdf`;
}

export function buildCombinedPackageObjectKey(options: {
  signingId: string;
  artifactId: string;
}): string {
  return `signings/${options.signingId}/artifacts/combined/${options.artifactId}.pdf`;
}

export function completedDocumentIdempotencyKey(options: {
  frozenRevisionId: string;
  packageRevisionDocumentId: string;
}): string {
  return `COMPLETED_DOCUMENT:${options.frozenRevisionId}:${options.packageRevisionDocumentId}`;
}

export function auditCertificateIdempotencyKey(frozenRevisionId: string): string {
  return `AUDIT_CERTIFICATE:${frozenRevisionId}`;
}

export function combinedPackageIdempotencyKey(frozenRevisionId: string): string {
  return `COMBINED_PACKAGE:${frozenRevisionId}`;
}

function mapArtifact(row: Record<string, unknown>): SigningArtifactRow {
  return {
    id: row.id as string,
    signing_id: row.signing_id as string,
    package_revision_id: row.package_revision_id as string,
    signing_document_version_id:
      (row.signing_document_version_id as string | null) ?? null,
    signing_document_id: (row.signing_document_id as string | null) ?? null,
    package_revision_document_id:
      (row.package_revision_document_id as string | null) ?? null,
    artifact_category: row.artifact_category as SigningArtifactCategory,
    storage_bucket: row.storage_bucket as string,
    storage_object_key: row.storage_object_key as string,
    content_sha256: (row.content_sha256 as string | null) ?? null,
    byte_size: row.byte_size == null ? null : Number(row.byte_size),
    page_count: row.page_count == null ? null : Number(row.page_count),
    frozen_filename: row.frozen_filename as string,
    generated_at: row.generated_at as string,
    verified_at: (row.verified_at as string | null) ?? null,
    audit_history_sequence_boundary:
      row.audit_history_sequence_boundary == null
        ? null
        : Number(row.audit_history_sequence_boundary),
    idempotency_key: (row.idempotency_key as string | null) ?? null,
  };
}

export async function findArtifactByIdempotency(options: {
  admin: SupabaseClient;
  signingId: string;
  idempotencyKey: string;
}): Promise<SigningArtifactRow | null> {
  const { data, error } = await options.admin
    .from("signing_artifacts")
    .select("*")
    .eq("signing_id", options.signingId)
    .eq("idempotency_key", options.idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapArtifact(data as Record<string, unknown>) : null;
}

export async function downloadArtifactBytes(options: {
  admin: SupabaseClient;
  artifact: SigningArtifactRow;
}): Promise<Uint8Array | null> {
  const { data, error } = await options.admin.storage
    .from(options.artifact.storage_bucket || SIGNING_ARTIFACTS_BUCKET)
    .download(options.artifact.storage_object_key);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Readback-verify stored bytes against the expected fingerprint.
 * Never rewrites content_sha256 on mismatch.
 */
export async function verifyArtifactReadback(options: {
  admin: SupabaseClient;
  artifact: SigningArtifactRow;
}): Promise<{ matched: boolean; actualSha256: string | null }> {
  if (!options.artifact.content_sha256) {
    return { matched: false, actualSha256: null };
  }
  const bytes = await downloadArtifactBytes(options);
  if (!bytes) return { matched: false, actualSha256: null };
  const actualSha256 = sha256Hex(bytes);
  return {
    matched: actualSha256 === options.artifact.content_sha256,
    actualSha256,
  };
}

export type StoreVerifiedArtifactInput = {
  admin: SupabaseClient;
  signingId: string;
  packageRevisionId: string;
  artifactCategory: SigningArtifactCategory;
  idempotencyKey: string;
  frozenFilename: string;
  bytes: Uint8Array;
  pageCount?: number | null;
  signingDocumentVersionId?: string | null;
  signingDocumentId?: string | null;
  packageRevisionDocumentId?: string | null;
  auditHistorySequenceBoundary?: number | null;
  objectKey: string;
};

/**
 * Upload + insert + readback verify. Reuses an already-verified artifact.
 * On hash mismatch after insert: preserve expected hash, leave verified_at null.
 */
export async function ensureVerifiedArtifact(
  input: StoreVerifiedArtifactInput,
): Promise<{ artifact: SigningArtifactRow; reused: boolean }> {
  const existing = await findArtifactByIdempotency({
    admin: input.admin,
    signingId: input.signingId,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing?.verified_at && existing.content_sha256) {
    const readback = await verifyArtifactReadback({
      admin: input.admin,
      artifact: existing,
    });
    if (readback.matched) {
      return { artifact: existing, reused: true };
    }
    // Verified row no longer matches storage — fail closed without rewriting.
    throw new Error(
      "Verified artifact readback failed; expected fingerprint preserved.",
    );
  }

  const contentSha256 = sha256Hex(input.bytes);
  const artifactId = existing?.id ?? newOpaqueArtifactId();
  const objectKey = existing?.storage_object_key ?? input.objectKey;

  // Upload if object missing.
  const { data: downloaded } = await input.admin.storage
    .from(SIGNING_ARTIFACTS_BUCKET)
    .download(objectKey);

  if (!downloaded) {
    const { error: uploadError } = await input.admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .upload(objectKey, input.bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError && !/already exists|Duplicate/i.test(uploadError.message)) {
      throw new Error(uploadError.message);
    }
  }

  // Readback before trusting.
  const { data: stored, error: downloadError } = await input.admin.storage
    .from(SIGNING_ARTIFACTS_BUCKET)
    .download(objectKey);
  if (downloadError || !stored) {
    throw new Error(downloadError?.message ?? "Artifact readback download failed.");
  }
  const storedBytes = new Uint8Array(await stored.arrayBuffer());
  const actualSha256 = sha256Hex(storedBytes);
  if (actualSha256 !== contentSha256) {
    throw new Error("Artifact upload readback SHA-256 mismatch.");
  }

  const verifiedAt = new Date().toISOString();
  if (existing) {
    if (existing.content_sha256 && existing.content_sha256 !== contentSha256) {
      // Never rewrite a previously recorded expected fingerprint.
      throw new Error(
        "Artifact fingerprint mismatch with existing row; hash not rewritten.",
      );
    }
    const { data, error } = await input.admin
      .from("signing_artifacts")
      .update({
        content_sha256: existing.content_sha256 ?? contentSha256,
        byte_size: storedBytes.byteLength,
        page_count: input.pageCount ?? existing.page_count,
        verified_at: verifiedAt,
        audit_history_sequence_boundary:
          input.auditHistorySequenceBoundary ??
          existing.audit_history_sequence_boundary,
      })
      .eq("id", existing.id)
      .eq("signing_id", input.signingId)
      .is("verified_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      return {
        artifact: mapArtifact(data as Record<string, unknown>),
        reused: false,
      };
    }
    const refreshed = await findArtifactByIdempotency({
      admin: input.admin,
      signingId: input.signingId,
      idempotencyKey: input.idempotencyKey,
    });
    if (refreshed?.verified_at) return { artifact: refreshed, reused: true };
    throw new Error("Failed to verify existing artifact row.");
  }

  const { data: inserted, error: insertError } = await input.admin
    .from("signing_artifacts")
    .insert({
      id: artifactId,
      signing_id: input.signingId,
      package_revision_id: input.packageRevisionId,
      signing_document_version_id: input.signingDocumentVersionId ?? null,
      signing_document_id: input.signingDocumentId ?? null,
      package_revision_document_id: input.packageRevisionDocumentId ?? null,
      artifact_category: input.artifactCategory,
      storage_bucket: SIGNING_ARTIFACTS_BUCKET,
      storage_object_key: objectKey,
      content_sha256: contentSha256,
      byte_size: storedBytes.byteLength,
      page_count: input.pageCount ?? null,
      frozen_filename: input.frozenFilename,
      verified_at: verifiedAt,
      audit_history_sequence_boundary:
        input.auditHistorySequenceBoundary ?? null,
      idempotency_key: input.idempotencyKey,
    })
    .select("*")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505" || /duplicate key/i.test(insertError.message)) {
      const raced = await findArtifactByIdempotency({
        admin: input.admin,
        signingId: input.signingId,
        idempotencyKey: input.idempotencyKey,
      });
      if (raced?.verified_at) return { artifact: raced, reused: true };
      // Unique verified index conflict — another verified row won.
      if (raced) {
        const readback = await verifyArtifactReadback({
          admin: input.admin,
          artifact: raced,
        });
        if (readback.matched && raced.content_sha256) {
          const { data: verified, error: verifyError } = await input.admin
            .from("signing_artifacts")
            .update({ verified_at: verifiedAt })
            .eq("id", raced.id)
            .is("verified_at", null)
            .select("*")
            .maybeSingle();
          if (verifyError) throw new Error(verifyError.message);
          if (verified) {
            return {
              artifact: mapArtifact(verified as Record<string, unknown>),
              reused: true,
            };
          }
        }
      }
    }
    throw new Error(insertError.message);
  }

  if (!inserted) throw new Error("Artifact insert returned no row.");
  return {
    artifact: mapArtifact(inserted as Record<string, unknown>),
    reused: false,
  };
}
