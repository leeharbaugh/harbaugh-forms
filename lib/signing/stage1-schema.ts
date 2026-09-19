/**
 * Shared Stage 1 Native Signing schema identifiers.
 * Keep in sync with migrations:
 * - 20260914200000_native_signing_stage1_foundation.sql
 * - 20260914210000_native_signing_stage1_same_signing_pointers.sql
 * - 20260914211000_native_signing_stage1_shorten_constraint_names.sql
 */

export const SIGNING_ARTIFACTS_BUCKET = "signing-artifacts" as const;

export const NATIVE_SIGNING_STAGE1_TABLES = [
  "signings",
  "signing_agent_associations",
  "signing_documents",
  "signing_document_versions",
  "signing_package_revisions",
  "signing_package_revision_documents",
  "signing_participants",
  "signing_package_revision_participants",
  "signing_fields",
  "signing_adopted_marks",
  "signing_field_placements",
  "signing_artifacts",
  "signing_events",
] as const;

/** Stage 3 additive Draft-preparation table (mutable; not revision evidence). */
export const NATIVE_SIGNING_STAGE3_DRAFT_TABLES = [
  "signing_draft_fields",
] as const;

export const NATIVE_SIGNING_STAGE3_MIGRATIONS = [
  "20260915120000_native_signing_stage3_draft_preparation",
  "20260915130000_native_signing_stage3_draft_document_inclusion",
  "20260915140000_native_signing_stage3_draft_display_order_partial",
] as const;

/**
 * Stage 4 additive tables: Draft source snapshots (preparation state),
 * participant credentials (hash only), operation idempotency, the durable
 * delivery outbox, and participant entry sessions (access plumbing).
 * None of these are signer evidence.
 */
export const NATIVE_SIGNING_STAGE4_TABLES = [
  "signing_draft_source_snapshots",
  "signing_participant_credentials",
  "signing_operation_idempotency",
  "signing_work_items",
  "signing_delivery_instructions",
  "signing_delivery_attempts",
  "signing_entry_sessions",
] as const;

export const NATIVE_SIGNING_STAGE4_MIGRATIONS = [
  "20260915160000_native_signing_stage4_draft_snapshots_activation",
  "20260915161000_native_signing_stage4_credential_wrap",
  "20260915162000_native_signing_stage4_wrap_key_version",
  "20260915163000_native_signing_stage4_entry_sessions",
] as const;

/**
 * Stage 5 additive ceremony tables.
 *
 * Consent disclosure versions are immutable published copy; in-person handoffs
 * and browser sessions are access/authority state; presence leases and
 * amendment locks are temporary server-expiring concurrency records. None of
 * these is signer evidence: participant evidence stays in `signing_participants`
 * (consent reference), `signing_adopted_marks`, `signing_field_placements`, and
 * `signing_events`.
 */
export const NATIVE_SIGNING_CEREMONY_TABLES = [
  "signing_consent_disclosure_versions",
  "signing_in_person_handoffs",
  "signing_browser_sessions",
  "signing_participant_presence_leases",
  "signing_amendment_locks",
  "signing_device_handoff_locks",
] as const;

export const NATIVE_SIGNING_CEREMONY_MIGRATIONS = [
  "20260917120000_native_signing_ceremony_foundation",
  "20260917130000_native_signing_ceremony_disclosure_fingerprint",
  "20260917140000_native_signing_ceremony_device_handoff_lock",
] as const;

/**
 * Transaction Coordinator / operator authority foundation (pre-Stage 6).
 * Persistent delegations + Signing-scoped operator associations.
 * Does not implement Stage 6 finalization.
 */
export const NATIVE_SIGNING_TC_AUTHORITY_TABLES = [
  "signing_operator_delegations",
  "signing_operator_associations",
] as const;

export const NATIVE_SIGNING_TC_AUTHORITY_MIGRATIONS = [
  "20260917150000_native_signing_tc_operator_authority",
  "20260918120000_native_signing_tc_provenance_immutability",
] as const;

/**
 * Stage 6 finalization: work-item leases, completion timestamp, artifact
 * traceability, verified-artifact uniqueness, event-chain genesis state.
 */
export const NATIVE_SIGNING_STAGE6_TABLES = [
  "signing_event_chain_state",
] as const;

export const NATIVE_SIGNING_STAGE6_MIGRATIONS = [
  "20260918160000_native_signing_stage6_finalization",
] as const;

export type NativeSigningCeremonyTable =
  (typeof NATIVE_SIGNING_CEREMONY_TABLES)[number];

/**
 * `signing-artifacts` object-key namespaces.
 *
 * Two different kinds of immutable bytes live in the same private bucket and
 * must never be confused:
 *
 * - `.../draft-snapshots/{snapshotId}/source.pdf` — a **Draft source snapshot**.
 *   The bytes are immutable once written, but the row is *preparation history*,
 *   not evidence. Superseded snapshots stay for audit/debug of how a package was
 *   prepared, and an evidence-free document's snapshots are deleted with it.
 * - `.../versions/{versionId}.pdf` — a **prepared `signing_document_version`**.
 *   This is evidentiary: it is what a package revision freezes and what
 *   participants sign against. It is never deleted as preparation history.
 * - `.../artifacts/completed|certificate|combined/{artifactId}.pdf` —
 *   **Stage 6 generated artifacts** (completed docs, audit certificate,
 *   optional combined package). Distinct from draft and prepared namespaces.
 *
 * Immutable bytes therefore do not imply evidentiary status; the namespace does.
 */
export const DRAFT_SOURCE_OBJECT_KEY_RE =
  /^signings\/[0-9a-fA-F-]{36}\/documents\/[0-9a-fA-F-]{36}\/draft-snapshots\/[0-9a-fA-F-]{36}\/source\.pdf$/;

export const PREPARED_VERSION_OBJECT_KEY_RE =
  /^signings\/[0-9a-fA-F-]{36}\/documents\/[0-9a-fA-F-]{36}\/versions\/[0-9a-fA-F-]{36}\.pdf$/;

export const COMPLETED_ARTIFACT_OBJECT_KEY_RE =
  /^signings\/[0-9a-fA-F-]{36}\/artifacts\/completed\/[0-9a-fA-F-]{36}\.pdf$/;

export const CERTIFICATE_ARTIFACT_OBJECT_KEY_RE =
  /^signings\/[0-9a-fA-F-]{36}\/artifacts\/certificate\/[0-9a-fA-F-]{36}\.pdf$/;

export const COMBINED_ARTIFACT_OBJECT_KEY_RE =
  /^signings\/[0-9a-fA-F-]{36}\/artifacts\/combined\/[0-9a-fA-F-]{36}\.pdf$/;

/** True for Draft source snapshot bytes (preparation history, not evidence). */
export function isDraftSourceObjectKey(key: unknown): key is string {
  return typeof key === "string" && DRAFT_SOURCE_OBJECT_KEY_RE.test(key);
}

/** True for prepared document-version bytes (evidentiary, never pruned). */
export function isPreparedVersionObjectKey(key: unknown): key is string {
  return typeof key === "string" && PREPARED_VERSION_OBJECT_KEY_RE.test(key);
}

export function isCompletedArtifactObjectKey(key: unknown): key is string {
  return typeof key === "string" && COMPLETED_ARTIFACT_OBJECT_KEY_RE.test(key);
}

export function isCertificateArtifactObjectKey(key: unknown): key is string {
  return typeof key === "string" && CERTIFICATE_ARTIFACT_OBJECT_KEY_RE.test(key);
}

export function isCombinedArtifactObjectKey(key: unknown): key is string {
  return typeof key === "string" && COMBINED_ARTIFACT_OBJECT_KEY_RE.test(key);
}

export type NativeSigningStage4Table =
  (typeof NATIVE_SIGNING_STAGE4_TABLES)[number];


export type NativeSigningStage1Table =
  (typeof NATIVE_SIGNING_STAGE1_TABLES)[number];

export const NATIVE_SIGNING_STAGE1_MIGRATIONS = [
  "20260914200000_native_signing_stage1_foundation",
  "20260914210000_native_signing_stage1_same_signing_pointers",
  "20260914211000_native_signing_stage1_shorten_constraint_names",
] as const;

/** @deprecated Prefer NATIVE_SIGNING_STAGE1_MIGRATIONS */
export const NATIVE_SIGNING_STAGE1_MIGRATION =
  NATIVE_SIGNING_STAGE1_MIGRATIONS[0];
