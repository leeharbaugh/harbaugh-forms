import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import { sha256Hex } from "./prepare-pdf";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";
import { isUuid } from "./types";

export type IntegrityVerificationResult = {
  versionId: string;
  signingId: string;
  expectedSha256: string | null;
  actualSha256: string | null;
  matched: boolean;
  trusted: boolean;
  reason:
    | "MATCH"
    | "MISSING_EXPECTED_HASH"
    | "MISSING_OBJECT"
    | "MISMATCH"
    | "MISSING_STORAGE_KEY";
};

/**
 * Trusted prepared-document integrity verification.
 * Never rewrites the recorded fingerprint.
 */
export async function verifyPreparedDocumentVersionIntegrity(
  admin: SupabaseClient,
  versionIdRaw: unknown,
): Promise<IntegrityVerificationResult> {
  if (!isUuid(versionIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid document version id.");
  }

  const { data: version, error } = await admin
    .from("signing_document_versions")
    .select(
      "id, signing_id, content_sha256, storage_bucket, storage_object_key",
    )
    .eq("id", versionIdRaw)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!version) {
    throw new SigningError("NOT_FOUND", "Document version not found.");
  }

  const expectedSha256 = (version.content_sha256 as string | null) ?? null;
  const objectKey = (version.storage_object_key as string | null) ?? null;
  const bucket =
    (version.storage_bucket as string | null) ?? SIGNING_ARTIFACTS_BUCKET;

  if (!expectedSha256) {
    return {
      versionId: version.id as string,
      signingId: version.signing_id as string,
      expectedSha256: null,
      actualSha256: null,
      matched: false,
      trusted: false,
      reason: "MISSING_EXPECTED_HASH",
    };
  }
  if (!objectKey) {
    return {
      versionId: version.id as string,
      signingId: version.signing_id as string,
      expectedSha256,
      actualSha256: null,
      matched: false,
      trusted: false,
      reason: "MISSING_STORAGE_KEY",
    };
  }

  const { data: downloaded, error: downloadError } = await admin.storage
    .from(bucket)
    .download(objectKey);

  if (downloadError || !downloaded) {
    return {
      versionId: version.id as string,
      signingId: version.signing_id as string,
      expectedSha256,
      actualSha256: null,
      matched: false,
      trusted: false,
      reason: "MISSING_OBJECT",
    };
  }

  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  const actualSha256 = sha256Hex(bytes);
  const matched = actualSha256 === expectedSha256;

  return {
    versionId: version.id as string,
    signingId: version.signing_id as string,
    expectedSha256,
    actualSha256,
    matched,
    trusted: matched,
    reason: matched ? "MATCH" : "MISMATCH",
  };
}

export function assertTrustedIntegrity(
  result: IntegrityVerificationResult,
): void {
  if (!result.trusted) {
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "Prepared document integrity verification failed.",
    );
  }
}
