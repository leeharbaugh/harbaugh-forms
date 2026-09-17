/**
 * Native Signing Stage 5 ceremony document bytes.
 *
 * Participants review the exact immutable prepared PDF their package revision
 * froze — a `signing_document_versions` object in the evidentiary `versions/`
 * namespace. Draft source snapshots are preparation history and must never be
 * served here, so the object key is checked against
 * `isPreparedVersionObjectKey` before the bytes are read.
 *
 * Bytes are hashed on the way out and compared to the recorded fingerprint: a
 * document whose stored bytes no longer match what the revision froze fails
 * closed rather than being shown to a participant about to sign it.
 *
 * Nothing here is reachable before identity affirmation: it takes a validated
 * ceremony browser session, and re-checks that the requested document belongs
 * to the revision this participant is actually a party to.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedCeremonySession } from "./browser-sessions";
import { resolveActionableRevisionId } from "./ceremony-context";
import { SigningError } from "./errors";
import {
  isPreparedVersionObjectKey,
  SIGNING_ARTIFACTS_BUCKET,
} from "./stage1-schema";
import { isUuid } from "./types";

export type CeremonyDocumentBytes = {
  revisionDocumentId: string;
  signingDocumentVersionId: string;
  packageRevisionId: string;
  filename: string;
  displayName: string;
  contentSha256: string;
  bytes: Uint8Array;
};

export async function loadCeremonyDocumentBytes(options: {
  admin: SupabaseClient;
  session: ValidatedCeremonySession;
  revisionDocumentId: unknown;
}): Promise<CeremonyDocumentBytes> {
  const { admin, session } = options;
  if (!isUuid(options.revisionDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid document id.");
  }

  const packageRevisionId = resolveActionableRevisionId(session);

  // The participant must be a party to this exact revision.
  const { data: revisionParticipant, error: revisionParticipantError } =
    await admin
      .from("signing_package_revision_participants")
      .select("id")
      .eq("signing_id", session.signingId)
      .eq("package_revision_id", packageRevisionId)
      .eq("signing_participant_id", session.signingParticipantId)
      .maybeSingle();
  if (revisionParticipantError) {
    throw new Error(revisionParticipantError.message);
  }
  if (!revisionParticipant) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "You are not a participant in the current version of this Signing.",
    );
  }

  const { data: revisionDocument, error: revisionDocumentError } = await admin
    .from("signing_package_revision_documents")
    .select("id, signing_document_version_id, frozen_display_name, frozen_filename")
    .eq("id", options.revisionDocumentId)
    .eq("signing_id", session.signingId)
    .eq("package_revision_id", packageRevisionId)
    .maybeSingle();
  if (revisionDocumentError) throw new Error(revisionDocumentError.message);
  if (!revisionDocument) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "That document is not part of this Signing.",
    );
  }

  const versionId = revisionDocument.signing_document_version_id as string;
  const { data: version, error: versionError } = await admin
    .from("signing_document_versions")
    .select("id, storage_bucket, storage_object_key, content_sha256")
    .eq("id", versionId)
    .eq("signing_id", session.signingId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) {
    throw new SigningError("NOT_FOUND", "Document version not found.");
  }

  const bucket =
    (version.storage_bucket as string | null) ?? SIGNING_ARTIFACTS_BUCKET;
  const objectKey = (version.storage_object_key as string | null) ?? null;
  const expectedSha256 = (version.content_sha256 as string | null) ?? null;

  // Evidence only: a `draft-snapshots/` key here would mean preparation history
  // was about to be served as the document being signed.
  if (
    bucket !== SIGNING_ARTIFACTS_BUCKET ||
    !objectKey ||
    !isPreparedVersionObjectKey(objectKey) ||
    !expectedSha256
  ) {
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "This document is not available for review. Please contact the sending agent.",
    );
  }

  const { data: downloaded, error: downloadError } = await admin.storage
    .from(bucket)
    .download(objectKey);
  if (downloadError || !downloaded) {
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "This document is not available for review. Please contact the sending agent.",
    );
  }

  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    // The recorded fingerprint is never rewritten to match altered bytes.
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "This document failed its integrity check and cannot be shown.",
    );
  }

  return {
    revisionDocumentId: revisionDocument.id as string,
    signingDocumentVersionId: versionId,
    packageRevisionId,
    filename: revisionDocument.frozen_filename as string,
    displayName: revisionDocument.frozen_display_name as string,
    contentSha256: expectedSha256,
    bytes,
  };
}
