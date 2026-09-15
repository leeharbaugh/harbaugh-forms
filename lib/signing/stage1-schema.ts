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
 * participant credentials (hash only), operation idempotency, and the
 * durable delivery outbox. None of these are signer evidence.
 */
export const NATIVE_SIGNING_STAGE4_TABLES = [
  "signing_draft_source_snapshots",
  "signing_participant_credentials",
  "signing_operation_idempotency",
  "signing_work_items",
  "signing_delivery_instructions",
  "signing_delivery_attempts",
] as const;

export const NATIVE_SIGNING_STAGE4_MIGRATIONS = [
  "20260915160000_native_signing_stage4_draft_snapshots_activation",
  "20260915161000_native_signing_stage4_credential_wrap",
] as const;

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
