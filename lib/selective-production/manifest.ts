import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APPROVED_COLLECTION_IDS,
  APPROVED_CONTACT_IDS,
  APPROVED_DEFAULT_COUNT,
  APPROVED_FORM_IDS,
  APPROVED_PACKET_IDS,
  APPROVED_PROPERTY_IDS,
  EXCLUDED_COLLECTION_IDS,
  EXCLUDED_FORM_IDS,
  LEE_AUTH_EMAIL,
  LEE_AUTH_UUID,
  LEE_IDENTITY_ID,
  PACKET_2_DELETED_FORM_IDS,
  PACKET_2_FIELD_INSTANCE_COUNT,
  PACKET_5_FIELD_INSTANCE_COUNT,
  PACKET_5_OVERRIDE_COUNT,
} from "./constants.ts";
import { SelectiveMigrationSafetyError, stableJsonHash } from "./safety.ts";

export type ManifestItem = {
  objectType: string;
  id: string | number;
  description: string;
  owner?: string | null;
  inclusionReason?: string;
  exclusionReason?: string;
  dependencies?: string[];
  migrationAction: string;
  approvalStatus?: string;
  [key: string]: unknown;
};

export type ProductionSelectionManifest = {
  meta: {
    title: string;
    version: string;
    finalizedAt: string;
    sourceProject: string;
    repositoryHeadAtSelection: string;
    leeAuthUuid: string;
    leeIdentityId: string;
    leeEmail: string;
    unresolvedConflicts: unknown[];
    counts: Record<string, number | number[]>;
    decisions: string[];
    checksum?: string;
  };
  authUsers: ManifestItem[];
  profiles: ManifestItem[];
  organizations: ManifestItem[];
  memberships: ManifestItem[];
  brokerageProfiles: ManifestItem[];
  agentSettings: ManifestItem[];
  contacts: ManifestItem[];
  properties: ManifestItem[];
  propertyHoas: ManifestItem[];
  packets: ManifestItem[];
  packetForms: ManifestItem[];
  fieldInstances: ManifestItem[];
  forms: ManifestItem[];
  formVersions: ManifestItem[];
  fields: ManifestItem[];
  mappingsSummary: Record<string, unknown>;
  defaults: ManifestItem[];
  collections: ManifestItem[];
  collectionForms: ManifestItem[];
  agreements: ManifestItem[];
  storageObjects: ManifestItem[];
  excludedObjects: ManifestItem[];
  unresolvedConflicts: unknown[];
  insertionOrder: string[];
  authStrategy: Record<string, unknown>;
  packetFingerprints: {
    packet2: Record<string, unknown>;
    packet5: Record<string, unknown>;
  };
  migrationHistory: Record<string, unknown>;
};

export function loadManifest(path = "PRODUCTION_DATA_SELECTION_MANIFEST.json"): ProductionSelectionManifest {
  const full = resolve(path);
  const raw = readFileSync(full, "utf8");
  const manifest = JSON.parse(raw) as ProductionSelectionManifest;
  validateManifestShape(manifest);
  validateManifestChecksum(manifest, raw);
  return manifest;
}

function stripChecksumForHash(manifest: ProductionSelectionManifest): string {
  const clone = structuredClone(manifest);
  if (clone.meta) delete clone.meta.checksum;
  return JSON.stringify(clone);
}

export function computeManifestChecksum(manifest: ProductionSelectionManifest): string {
  return createHash("sha256").update(stripChecksumForHash(manifest)).digest("hex");
}

export function validateManifestChecksum(
  manifest: ProductionSelectionManifest,
  rawFileContents?: string,
): void {
  if (!manifest.meta?.checksum) {
    throw new SelectiveMigrationSafetyError("Manifest meta.checksum is required.");
  }
  const parsed =
    rawFileContents != null
      ? (JSON.parse(rawFileContents) as ProductionSelectionManifest)
      : manifest;
  const expected = parsed.meta.checksum;
  const actual = computeManifestChecksum(parsed);
  if (expected !== actual) {
    throw new SelectiveMigrationSafetyError(
      `Manifest checksum mismatch (expected ${expected}, got ${actual}).`,
    );
  }
}

export function validateManifestShape(manifest: ProductionSelectionManifest): void {
  if (!Array.isArray(manifest.unresolvedConflicts)) {
    throw new SelectiveMigrationSafetyError("unresolvedConflicts must be an array.");
  }
  if (manifest.unresolvedConflicts.length !== 0) {
    throw new SelectiveMigrationSafetyError(
      `Manifest has unresolvedConflicts: ${JSON.stringify(manifest.unresolvedConflicts)}`,
    );
  }

  const formIds = new Set(manifest.forms.map((f) => Number(f.id)));
  for (const id of APPROVED_FORM_IDS) {
    if (!formIds.has(id)) {
      throw new SelectiveMigrationSafetyError(`Approved form ${id} missing from manifest.`);
    }
  }
  for (const id of EXCLUDED_FORM_IDS) {
    if (formIds.has(id)) {
      throw new SelectiveMigrationSafetyError(`Excluded form ${id} must not appear in forms[].`);
    }
  }

  const collIds = new Set(manifest.collections.map((c) => Number(c.id)));
  for (const id of APPROVED_COLLECTION_IDS) {
    if (!collIds.has(id)) {
      throw new SelectiveMigrationSafetyError(`Approved collection ${id} missing.`);
    }
  }
  for (const id of EXCLUDED_COLLECTION_IDS) {
    if (collIds.has(id)) {
      throw new SelectiveMigrationSafetyError(`Excluded collection ${id} must not appear in collections[].`);
    }
  }

  const contactIds = new Set(manifest.contacts.map((c) => Number(c.id)));
  for (const id of APPROVED_CONTACT_IDS) {
    if (!contactIds.has(id)) {
      throw new SelectiveMigrationSafetyError(`Approved contact ${id} missing.`);
    }
  }

  const propertyIds = new Set(manifest.properties.map((p) => Number(p.id)));
  for (const id of APPROVED_PROPERTY_IDS) {
    if (!propertyIds.has(id)) {
      throw new SelectiveMigrationSafetyError(`Approved property ${id} missing.`);
    }
  }

  const packetIds = new Set(manifest.packets.map((p) => Number(p.id)));
  for (const id of APPROVED_PACKET_IDS) {
    if (!packetIds.has(id)) {
      throw new SelectiveMigrationSafetyError(`Approved packet ${id} missing.`);
    }
  }

  const pfIds = new Set(manifest.packetForms.map((p) => Number(p.id)));
  for (const id of PACKET_2_DELETED_FORM_IDS) {
    if (!pfIds.has(id)) {
      throw new SelectiveMigrationSafetyError(
        `Packet 2 DELETED packet_form ${id} must be included in the manifest.`,
      );
    }
    const row = manifest.packetForms.find((p) => Number(p.id) === id);
    if (row?.status !== "DELETED") {
      throw new SelectiveMigrationSafetyError(
        `Packet form ${id} must retain DELETED status in the manifest.`,
      );
    }
  }

  if (Number(manifest.meta.counts.approvedDefaultsActive) !== APPROVED_DEFAULT_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `Approved default count must be ${APPROVED_DEFAULT_COUNT}.`,
    );
  }
  if (manifest.defaults.length !== APPROVED_DEFAULT_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `defaults[] length ${manifest.defaults.length} != ${APPROVED_DEFAULT_COUNT}.`,
    );
  }

  for (const d of manifest.defaults) {
    const formId = d.form_id == null ? null : Number(d.form_id);
    if (formId != null && (EXCLUDED_FORM_IDS as readonly number[]).includes(formId)) {
      throw new SelectiveMigrationSafetyError(
        `Default ${d.id} references excluded form ${formId}.`,
      );
    }
    if (d.status && d.status !== "ACTIVE") {
      throw new SelectiveMigrationSafetyError(`Default ${d.id} must be ACTIVE.`);
    }
  }

  if (manifest.meta.leeAuthUuid !== LEE_AUTH_UUID) {
    throw new SelectiveMigrationSafetyError("Manifest leeAuthUuid mismatch.");
  }
  if (manifest.meta.leeIdentityId !== LEE_IDENTITY_ID) {
    throw new SelectiveMigrationSafetyError("Manifest leeIdentityId mismatch.");
  }
  if (manifest.meta.leeEmail !== LEE_AUTH_EMAIL) {
    throw new SelectiveMigrationSafetyError("Manifest leeEmail mismatch.");
  }

  const fp2 = manifest.packetFingerprints?.packet2;
  const fp5 = manifest.packetFingerprints?.packet5;
  if (!fp2?.sha256 || !fp5?.sha256) {
    throw new SelectiveMigrationSafetyError("Packet fingerprints with sha256 are required.");
  }
  if (Number(fp2.fieldInstanceCount) !== PACKET_2_FIELD_INSTANCE_COUNT) {
    throw new SelectiveMigrationSafetyError("Packet 2 field instance count mismatch.");
  }
  if (Number(fp5.fieldInstanceCount) !== PACKET_5_FIELD_INSTANCE_COUNT) {
    throw new SelectiveMigrationSafetyError("Packet 5 field instance count mismatch.");
  }
  if (Number(fp5.overrideCount) !== PACKET_5_OVERRIDE_COUNT) {
    throw new SelectiveMigrationSafetyError("Packet 5 override count mismatch.");
  }
}

export function assertNoForm23LineageTransform(manifest: ProductionSelectionManifest): void {
  const decision = (manifest.meta.decisions || []).join(" ");
  if (/null.*copied_from|lineage transform/i.test(decision) && !/no form-23 lineage/i.test(decision)) {
    throw new SelectiveMigrationSafetyError(
      "Form 23 lineage null transform is forbidden; form 23 is fully excluded.",
    );
  }
  if (manifest.forms.some((f) => Number(f.id) === 23)) {
    throw new SelectiveMigrationSafetyError("Form 23 must be excluded entirely.");
  }
}

export function fingerprintPayloadHash(payload: unknown): string {
  return stableJsonHash(payload);
}
