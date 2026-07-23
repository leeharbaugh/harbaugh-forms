/**
 * Validate a target environment against the approved production manifest.
 *
 * Usage:
 *   node --experimental-strip-types scripts/validate-production-migration.ts --dry-run
 *   TARGET_SUPABASE_URL=... TARGET_SUPABASE_SECRET_KEY=... \
 *   node --experimental-strip-types scripts/validate-production-migration.ts --execute
 */

import { loadManifest } from "../lib/selective-production/manifest.ts";
import {
  assertValidationOk,
  validateProductionSnapshot,
  type ValidationSnapshot,
} from "../lib/selective-production/validate.ts";
import {
  APPROVED_COLLECTION_IDS,
  APPROVED_CONTACT_IDS,
  APPROVED_DEFAULT_COUNT,
  APPROVED_FORM_IDS,
  APPROVED_PACKET_IDS,
  APPROVED_PROPERTY_IDS,
  DGR_ORGANIZATION_ID,
  LEE_AUTH_EMAIL,
  LEE_AUTH_UUID,
  LEE_IDENTITY_ID,
  LEE_ORG_MEMBERSHIP_ID,
  PACKET_2_DELETED_FORM_IDS,
  PACKET_2_FIELD_INSTANCE_COUNT,
  PACKET_5_FIELD_INSTANCE_COUNT,
  PACKET_5_OVERRIDE_COUNT,
} from "../lib/selective-production/constants.ts";
import { parseArgs } from "../lib/selective-production/safety.ts";

function expectedSnapshotFromManifest(): ValidationSnapshot {
  return {
    authUserIds: [LEE_AUTH_UUID],
    authEmails: [LEE_AUTH_EMAIL],
    identityIds: [LEE_IDENTITY_ID],
    profileIds: [LEE_AUTH_UUID],
    profileAppRoles: { [LEE_AUTH_UUID]: "ADMIN" },
    organizationIds: [DGR_ORGANIZATION_ID],
    membershipIds: [LEE_ORG_MEMBERSHIP_ID],
    formIds: [...APPROVED_FORM_IDS],
    collectionIds: [...APPROVED_COLLECTION_IDS],
    contactIds: [...APPROVED_CONTACT_IDS],
    propertyIds: [...APPROVED_PROPERTY_IDS],
    packetIds: [...APPROVED_PACKET_IDS],
    packetFormStatuses: Object.fromEntries(
      PACKET_2_DELETED_FORM_IDS.map((id) => [id, "DELETED"]),
    ),
    packet2FieldInstanceCount: PACKET_2_FIELD_INSTANCE_COUNT,
    packet5FieldInstanceCount: PACKET_5_FIELD_INSTANCE_COUNT,
    packet5OverrideCount: PACKET_5_OVERRIDE_COUNT,
    defaultCount: APPROVED_DEFAULT_COUNT,
    defaultFormIds: [null, 1, 7, 11, 15, 18],
    storagePathsPresent: [],
    storagePathsAbsent: [
      "global/forms/21/",
      "global/forms/22/",
      "global/forms/23/",
    ],
    formsWithCopiedFrom: APPROVED_FORM_IDS.map((id) => ({
      id,
      copied_from_form_id: null,
    })),
    orphanFkCount: 0,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifestPath);

  if (args.dryRun && !args.execute) {
    const snap = expectedSnapshotFromManifest();
    const result = validateProductionSnapshot(snap, manifest);
    assertValidationOk(result);
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          ok: true,
          assertions: [
            "exactly one Auth user (Lee UUID)",
            "identity preserved",
            "forms 1–18 present; 21–23 absent",
            "collections 1,2,3,5 present; 4,7,9,12,14 absent",
            "packet forms 25/26 DELETED",
            `defaults=${APPROVED_DEFAULT_COUNT}`,
            "packet fingerprints counts match",
          ],
          manifestChecksum: manifest.meta.checksum,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.error(
    "Execute validation requires TARGET_SUPABASE_* against a real production project (not created yet).",
  );
  process.exit(1);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
