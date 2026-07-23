import {
  APPROVED_COLLECTION_IDS,
  APPROVED_CONTACT_IDS,
  APPROVED_DEFAULT_COUNT,
  APPROVED_FORM_IDS,
  APPROVED_PACKET_IDS,
  APPROVED_PROPERTY_IDS,
  DGR_ORGANIZATION_ID,
  EXCLUDED_COLLECTION_IDS,
  EXCLUDED_FORM_IDS,
  LEE_AUTH_EMAIL,
  LEE_AUTH_UUID,
  LEE_IDENTITY_ID,
  LEE_ORG_MEMBERSHIP_ID,
  PACKET_2_DELETED_FORM_IDS,
  PACKET_2_FIELD_INSTANCE_COUNT,
  PACKET_5_FIELD_INSTANCE_COUNT,
  PACKET_5_OVERRIDE_COUNT,
  YAHOO_AUTH_UUID,
} from "./constants.ts";
import type { ProductionSelectionManifest } from "./manifest.ts";
import { SelectiveMigrationSafetyError } from "./safety.ts";

export type ValidationSnapshot = {
  authUserIds: string[];
  authEmails: string[];
  identityIds: string[];
  profileIds: string[];
  profileAppRoles: Record<string, string>;
  organizationIds: string[];
  membershipIds: string[];
  formIds: number[];
  collectionIds: number[];
  contactIds: number[];
  propertyIds: number[];
  packetIds: number[];
  packetFormStatuses: Record<number, string>;
  packet2FieldInstanceCount: number;
  packet5FieldInstanceCount: number;
  packet5OverrideCount: number;
  defaultCount: number;
  defaultFormIds: Array<number | null>;
  storagePathsPresent: string[];
  storagePathsAbsent: string[];
  formsWithCopiedFrom: Array<{ id: number; copied_from_form_id: number | null }>;
  orphanFkCount: number;
};

export type ValidationResult = {
  ok: boolean;
  failures: string[];
};

export function validateProductionSnapshot(
  snap: ValidationSnapshot,
  manifest: ProductionSelectionManifest,
): ValidationResult {
  const failures: string[] = [];

  if (manifest.unresolvedConflicts.length !== 0) {
    failures.push("Manifest unresolvedConflicts must be empty.");
  }
  if (Number(manifest.meta.counts.approvedDefaultsActive) !== APPROVED_DEFAULT_COUNT) {
    failures.push("Manifest default count metadata mismatch.");
  }
  // Auth
  if (snap.authUserIds.length !== 1 || snap.authUserIds[0] !== LEE_AUTH_UUID) {
    failures.push("Auth must contain exactly Lee UUID.");
  }
  if (snap.authEmails.length !== 1 || snap.authEmails[0]?.toLowerCase() !== LEE_AUTH_EMAIL) {
    failures.push("Auth email must be lee@leeharbaugh.com only.");
  }
  if (snap.identityIds.length !== 1 || snap.identityIds[0] !== LEE_IDENTITY_ID) {
    failures.push("Auth identity ID must be preserved.");
  }
  if (snap.authUserIds.includes(YAHOO_AUTH_UUID)) {
    failures.push("Yahoo Auth user must be absent.");
  }

  // Org / profile
  if (!snap.organizationIds.includes(DGR_ORGANIZATION_ID)) {
    failures.push("Davey Goosmann Realty organization missing.");
  }
  if (!snap.profileIds.includes(LEE_AUTH_UUID)) {
    failures.push("Lee profile missing.");
  }
  if (snap.profileAppRoles[LEE_AUTH_UUID] !== "ADMIN") {
    failures.push("Lee Global Admin role missing.");
  }
  if (!snap.membershipIds.includes(LEE_ORG_MEMBERSHIP_ID)) {
    failures.push("Lee ORG_ADMIN membership missing.");
  }

  // Forms
  for (const id of APPROVED_FORM_IDS) {
    if (!snap.formIds.includes(id)) failures.push(`Form ${id} missing.`);
  }
  for (const id of EXCLUDED_FORM_IDS) {
    if (snap.formIds.includes(id)) failures.push(`Excluded form ${id} present.`);
  }
  for (const f of snap.formsWithCopiedFrom) {
    if (
      f.copied_from_form_id != null &&
      !snap.formIds.includes(f.copied_from_form_id)
    ) {
      failures.push(
        `Form ${f.id} references absent copied_from_form_id ${f.copied_from_form_id}.`,
      );
    }
  }

  // Collections
  for (const id of APPROVED_COLLECTION_IDS) {
    if (!snap.collectionIds.includes(id)) failures.push(`Collection ${id} missing.`);
  }
  for (const id of EXCLUDED_COLLECTION_IDS) {
    if (snap.collectionIds.includes(id)) {
      failures.push(`Excluded collection ${id} present.`);
    }
  }

  // Business data
  if (snap.contactIds.slice().sort().join(",") !== [...APPROVED_CONTACT_IDS].join(",")) {
    failures.push("Contact set must be exactly 2,3,4,6.");
  }
  if (snap.propertyIds.slice().sort().join(",") !== [...APPROVED_PROPERTY_IDS].join(",")) {
    failures.push("Property set must be exactly 1,3.");
  }
  if (snap.packetIds.slice().sort().join(",") !== [...APPROVED_PACKET_IDS].join(",")) {
    failures.push("Packet set must be exactly 2,5.");
  }
  for (const id of PACKET_2_DELETED_FORM_IDS) {
    if (snap.packetFormStatuses[id] !== "DELETED") {
      failures.push(`Packet form ${id} must exist with DELETED status.`);
    }
  }
  if (snap.packet2FieldInstanceCount !== PACKET_2_FIELD_INSTANCE_COUNT) {
    failures.push("Packet 2 field instance fingerprint mismatch.");
  }
  if (snap.packet5FieldInstanceCount !== PACKET_5_FIELD_INSTANCE_COUNT) {
    failures.push("Packet 5 field instance fingerprint mismatch.");
  }
  if (snap.packet5OverrideCount !== PACKET_5_OVERRIDE_COUNT) {
    failures.push("Packet 5 override fingerprint mismatch.");
  }
  if (snap.defaultCount !== APPROVED_DEFAULT_COUNT) {
    failures.push(`Default count must be ${APPROVED_DEFAULT_COUNT}.`);
  }
  for (const formId of snap.defaultFormIds) {
    if (formId != null && (EXCLUDED_FORM_IDS as readonly number[]).includes(formId)) {
      failures.push(`Default references excluded form ${formId}.`);
    }
  }
  if (snap.orphanFkCount !== 0) {
    failures.push(`Orphan FK count must be 0 (got ${snap.orphanFkCount}).`);
  }

  // Storage
  for (const path of snap.storagePathsAbsent) {
    if (snap.storagePathsPresent.includes(path)) {
      failures.push(`Excluded storage still present: ${path}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

export function assertValidationOk(result: ValidationResult): void {
  if (!result.ok) {
    throw new SelectiveMigrationSafetyError(
      `Production validation failed:\n- ${result.failures.join("\n- ")}`,
    );
  }
}
