/**
 * Manager access to a Complete Signing's immutable completed artifacts.
 *
 * The only source is verified `signing_artifacts` rows of the Signing's frozen
 * package revision (written by finalization before Complete). Nothing here
 * renders, regenerates or writes. Authority is checked before any service-role
 * read, and bytes are re-hashed against the recorded fingerprint on every
 * serve; a mismatch is never served.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { SigningArtifactCategory } from "./artifacts";
import { canReadCompletedSigningArtifacts } from "./authority";
import { loadSigningAuthorityBundle } from "./authority-context";
import { SigningError } from "./errors";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type CompletedArtifactKind = "DOCUMENT" | "CERTIFICATE" | "COMBINED";

export type ManagerCompletedArtifact = {
  artifactId: string;
  kind: CompletedArtifactKind;
  label: string;
  filename: string;
  pageCount: number | null;
};

/**
 * The combined package is optional and generated after Complete
 * (GENERATE_COMBINED_PACKAGE, enqueued once finalization commits Complete).
 * READY: verified and listed. PREPARING: its work item is pending, running or
 * retrying, or finalization finished moments ago and has yet to enqueue it.
 * UNAVAILABLE: the work stopped without a usable artifact. NOT_EXPECTED: no
 * combined work exists for this Signing.
 */
export type CombinedPackageState = "READY" | "PREPARING" | "UNAVAILABLE" | "NOT_EXPECTED";

export const COMBINED_PACKAGE_WORK_TYPE = "GENERATE_COMBINED_PACKAGE";
export const FINALIZE_WORK_TYPE = "FINALIZE_SIGNING";
/** Failed attempts after which the package is no longer presented as on its way. */
export const COMBINED_PACKAGE_MAX_PREPARING_ATTEMPTS = 3;
/** Finalization enqueues the combined work just after committing Complete. */
export const COMBINED_PACKAGE_ENQUEUE_GRACE_MS = 120_000;

export function deriveCombinedPackageState(input: {
  combinedArtifactListed: boolean;
  combinedWork: { processingState: string; attemptCount: number } | null;
  finalizeCompletedAt: string | null;
  now: number;
}): CombinedPackageState {
  if (input.combinedArtifactListed) return "READY";
  const work = input.combinedWork;
  if (work) {
    if (work.processingState === "PENDING" || work.processingState === "PROCESSING") return "PREPARING";
    if (work.processingState === "FAILED" && work.attemptCount < COMBINED_PACKAGE_MAX_PREPARING_ATTEMPTS) {
      return "PREPARING";
    }
    return "UNAVAILABLE";
  }
  const finalizedAt = input.finalizeCompletedAt ? Date.parse(input.finalizeCompletedAt) : NaN;
  if (Number.isFinite(finalizedAt) && input.now - finalizedAt < COMBINED_PACKAGE_ENQUEUE_GRACE_MS) {
    return "PREPARING";
  }
  return "NOT_EXPECTED";
}

/** Settled once nothing listed or expected can still change on its own. */
export function completedArtifactsSettled(combinedPackage: CombinedPackageState | null): boolean {
  return combinedPackage !== "PREPARING";
}

const KIND_BY_CATEGORY: Record<SigningArtifactCategory, CompletedArtifactKind> = {
  COMPLETED_DOCUMENT: "DOCUMENT",
  AUDIT_CERTIFICATE: "CERTIFICATE",
  COMBINED_PACKAGE: "COMBINED",
};

const CATEGORIES = Object.keys(KIND_BY_CATEGORY) as SigningArtifactCategory[];

/** Stable, document-based download name; never the Signing title or a storage key. */
export function completedArtifactFilename(kind: CompletedArtifactKind, label: string): string {
  if (kind === "CERTIFICATE") return "Audit certificate.pdf";
  if (kind === "COMBINED") return "Combined signed package.pdf";
  const safe = label
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return `${safe || "Document"} - signed.pdf`;
}

/** `attachment` / `inline` header with an ASCII fallback and an RFC 5987 UTF-8 name. */
export function completedArtifactContentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
): string {
  const ascii = filename.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\;]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

type ArtifactRecord = {
  id: string;
  artifact_category: SigningArtifactCategory;
  storage_bucket: string;
  storage_object_key: string;
  content_sha256: string | null;
  byte_size: number | null;
  page_count: number | null;
  package_revision_document_id: string | null;
  signing_document_version_id: string | null;
};

type RevisionDocument = {
  id: string;
  display_order: number;
  frozen_display_name: string | null;
  signing_document_version_id: string | null;
};

/**
 * Authority + lifecycle gate. Returns the Signing's frozen revision only when
 * the actor may read completed artifacts (COMPLETE and `canRead`); otherwise
 * null, without revealing whether the Signing exists.
 */
async function completedRevisionForActor(
  actor: SigningActor,
  signingId: unknown,
  admin: SupabaseClient,
): Promise<{ signingId: string; frozenRevisionId: string } | null> {
  if (!isUuid(signingId)) return null;
  const bundle = await loadSigningAuthorityBundle(admin, actor, signingId);
  if (!bundle) return null;
  const lifecycleState = bundle.signing.lifecycle_state as string;
  if (!canReadCompletedSigningArtifacts(bundle.authority, lifecycleState)) return null;
  const frozenRevisionId = bundle.signing.frozen_package_revision_id as string | null;
  if (!frozenRevisionId) return null;
  return { signingId: bundle.signing.id as string, frozenRevisionId };
}

async function loadRevisionDocuments(
  admin: SupabaseClient,
  signingId: string,
  frozenRevisionId: string,
): Promise<Map<string, RevisionDocument>> {
  const { data, error } = await admin
    .from("signing_package_revision_documents")
    .select("id, display_order, frozen_display_name, signing_document_version_id")
    .eq("signing_id", signingId)
    .eq("package_revision_id", frozenRevisionId)
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as RevisionDocument[]).map((row) => [row.id, row]));
}

/** A verified artifact still bound to this Signing, its frozen revision and (for documents) its revision document. */
function artifactBelongs(
  artifact: ArtifactRecord,
  signingId: string,
  revisionDocuments: Map<string, RevisionDocument>,
): boolean {
  if (artifact.storage_bucket !== SIGNING_ARTIFACTS_BUCKET) return false;
  if (!artifact.storage_object_key.startsWith(`signings/${signingId}/artifacts/`)) return false;
  if (!artifact.content_sha256) return false;
  if (artifact.artifact_category !== "COMPLETED_DOCUMENT") return true;
  const document = artifact.package_revision_document_id
    ? revisionDocuments.get(artifact.package_revision_document_id)
    : undefined;
  if (!document) return false;
  return (
    !document.signing_document_version_id ||
    !artifact.signing_document_version_id ||
    document.signing_document_version_id === artifact.signing_document_version_id
  );
}

function documentLabel(document: RevisionDocument | undefined): string {
  return document?.frozen_display_name?.trim() || "Document";
}

async function verifiedArtifacts(
  admin: SupabaseClient,
  signingId: string,
  frozenRevisionId: string,
  artifactId?: string,
): Promise<ArtifactRecord[]> {
  let query = admin
    .from("signing_artifacts")
    .select(
      "id, artifact_category, storage_bucket, storage_object_key, content_sha256, byte_size, page_count, package_revision_document_id, signing_document_version_id",
    )
    .eq("signing_id", signingId)
    .eq("package_revision_id", frozenRevisionId)
    .in("artifact_category", CATEGORIES)
    .not("verified_at", "is", null);
  if (artifactId) query = query.eq("id", artifactId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ArtifactRecord[];
}

/**
 * Completed documents (in package order), then the audit certificate, then the
 * combined package when it exists. Null when the actor may not read completed
 * artifacts or the Signing is not Complete.
 */
export async function listCompletedArtifactsForActor(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<ManagerCompletedArtifact[] | null> {
  const scope = await completedRevisionForActor(actor, signingIdRaw, admin);
  if (!scope) return null;
  return listForScope(admin, scope);
}

/**
 * Completed artifacts plus the combined package's preparation state, for the
 * manager dashboard. Read-only: it never enqueues, retries or kicks work.
 */
export async function loadCompletedArtifactsStateForActor(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<{ artifacts: ManagerCompletedArtifact[]; combinedPackage: CombinedPackageState } | null> {
  const scope = await completedRevisionForActor(actor, signingIdRaw, admin);
  if (!scope) return null;
  const [artifacts, work] = await Promise.all([
    listForScope(admin, scope),
    admin
      .from("signing_work_items")
      .select("work_type, idempotency_key, processing_state, attempt_count, completed_at")
      .eq("signing_id", scope.signingId)
      .in("work_type", [COMBINED_PACKAGE_WORK_TYPE, FINALIZE_WORK_TYPE]),
  ]);
  if (work.error) throw new Error(work.error.message);
  const rows = (work.data ?? []) as Array<Record<string, unknown>>;
  const combined = rows.find(
    (row) =>
      row.work_type === COMBINED_PACKAGE_WORK_TYPE &&
      row.idempotency_key === `${COMBINED_PACKAGE_WORK_TYPE}:${scope.frozenRevisionId}`,
  );
  const finalizeCompletedAt =
    rows
      .filter((row) => row.work_type === FINALIZE_WORK_TYPE && row.processing_state === "SUCCEEDED")
      .map((row) => (row.completed_at as string | null) ?? "")
      .sort()
      .pop() || null;
  return {
    artifacts,
    combinedPackage: deriveCombinedPackageState({
      combinedArtifactListed: artifacts.some((artifact) => artifact.kind === "COMBINED"),
      combinedWork: combined
        ? { processingState: String(combined.processing_state), attemptCount: Number(combined.attempt_count ?? 0) }
        : null,
      finalizeCompletedAt,
      now: Date.now(),
    }),
  };
}

async function listForScope(
  admin: SupabaseClient,
  scope: { signingId: string; frozenRevisionId: string },
): Promise<ManagerCompletedArtifact[]> {
  const [revisionDocuments, artifacts] = await Promise.all([
    loadRevisionDocuments(admin, scope.signingId, scope.frozenRevisionId),
    verifiedArtifacts(admin, scope.signingId, scope.frozenRevisionId),
  ]);
  const usable = artifacts.filter((artifact) =>
    artifactBelongs(artifact, scope.signingId, revisionDocuments),
  );
  const order = (artifact: ArtifactRecord) => {
    if (artifact.artifact_category === "COMPLETED_DOCUMENT") {
      return revisionDocuments.get(artifact.package_revision_document_id!)?.display_order ?? 0;
    }
    return artifact.artifact_category === "AUDIT_CERTIFICATE" ? 1e6 : 1e6 + 1;
  };
  usable.sort((a, b) => order(a) - order(b));

  const labelCounts = new Map<string, number>();
  for (const artifact of usable) {
    if (artifact.artifact_category !== "COMPLETED_DOCUMENT") continue;
    const label = documentLabel(revisionDocuments.get(artifact.package_revision_document_id!));
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  let documentNumber = 0;
  return usable.map((artifact) => {
    const kind = KIND_BY_CATEGORY[artifact.artifact_category];
    const baseLabel =
      kind === "CERTIFICATE"
        ? "Audit certificate"
        : kind === "COMBINED"
          ? "Combined signed package"
          : documentLabel(revisionDocuments.get(artifact.package_revision_document_id!));
    let label = baseLabel;
    if (kind === "DOCUMENT") {
      documentNumber += 1;
      if ((labelCounts.get(label) ?? 0) > 1) label = `${label} (document ${documentNumber})`;
    }
    return {
      artifactId: artifact.id,
      kind,
      label,
      filename: completedArtifactFilename(kind, baseLabel),
      pageCount: artifact.page_count == null ? null : Number(artifact.page_count),
    };
  });
}

/**
 * Bytes of one completed artifact for an authorized manager. Throws NOT_FOUND
 * for anything the actor may not read (other Signings, other brokerages,
 * non-Complete lifecycles, unverified or foreign artifacts) and
 * INTEGRITY_MISMATCH when stored bytes no longer match the recorded SHA-256.
 */
export async function loadCompletedArtifactForActor(options: {
  actor: SigningActor;
  signingId: unknown;
  artifactId: unknown;
  admin: SupabaseClient;
}): Promise<{ bytes: Uint8Array; filename: string; sha256: string }> {
  const notFound = () => new SigningError("NOT_FOUND", "Completed document not found.");
  if (!isUuid(options.artifactId)) throw notFound();
  const scope = await completedRevisionForActor(options.actor, options.signingId, options.admin);
  if (!scope) throw notFound();

  const [revisionDocuments, [artifact]] = await Promise.all([
    loadRevisionDocuments(options.admin, scope.signingId, scope.frozenRevisionId),
    verifiedArtifacts(options.admin, scope.signingId, scope.frozenRevisionId, options.artifactId),
  ]);
  if (!artifact || !artifactBelongs(artifact, scope.signingId, revisionDocuments)) throw notFound();

  const { data, error } = await options.admin.storage
    .from(SIGNING_ARTIFACTS_BUCKET)
    .download(artifact.storage_object_key);
  if (error || !data) {
    throw new SigningError("INTEGRITY_MISMATCH", "The completed document could not be read.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    sha256 !== artifact.content_sha256 ||
    (artifact.byte_size != null && Number(artifact.byte_size) !== bytes.byteLength)
  ) {
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "This completed document failed its integrity check and was not served.",
    );
  }

  const kind = KIND_BY_CATEGORY[artifact.artifact_category];
  const label =
    kind === "DOCUMENT"
      ? documentLabel(revisionDocuments.get(artifact.package_revision_document_id!))
      : "";
  return { bytes, filename: completedArtifactFilename(kind, label), sha256 };
}
