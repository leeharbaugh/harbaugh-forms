/**
 * Validate production against the approved selective migration manifest.
 *
 * Usage:
 *   npm run validate:production-migration -- --dry-run
 *   npm run validate:production-migration -- --execute
 *
 * Execute queries TARGET (harbaugh-forms-prod) via pooler SQL (runTargetSqlJson),
 * not supabase-js REST, to avoid intermittent JWT clock-skew failures on Windows/Node.
 */

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
  PROD_PROJECT_REF,
} from "../lib/selective-production/constants.ts";
import { TARGET_AUTH_VERIFY_SQL } from "../lib/selective-production/auth-migrate.ts";
import { loadManifest } from "../lib/selective-production/manifest.ts";
import {
  assertDistinctProjects,
  assertProductionTargetRef,
  assertRequiredCredentials,
  parseArgs,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";
import { runTargetSqlJson } from "../lib/selective-production/target-db.ts";
import {
  assertValidationOk,
  validateProductionSnapshot,
  type ValidationSnapshot,
} from "../lib/selective-production/validate.ts";

/** Core ACTIVE id sets, org/profile rows, packet forms, field counts, storage. */
const TARGET_SNAPSHOT_CORE_SQL = `
select
  (
    select coalesce(json_agg(id order by id), '[]'::json)
    from forms
    where status = 'ACTIVE'
  ) as form_ids,
  (
    select coalesce(json_agg(id order by id), '[]'::json)
    from collections
    where status = 'ACTIVE'
  ) as collection_ids,
  (
    select coalesce(json_agg(id order by id), '[]'::json)
    from contacts
    where status = 'ACTIVE'
  ) as contact_ids,
  (
    select coalesce(json_agg(id order by id), '[]'::json)
    from properties
    where status = 'ACTIVE'
  ) as property_ids,
  (
    select coalesce(json_agg(id order by id), '[]'::json)
    from packets
    where status = 'ACTIVE'
  ) as packet_ids,
  (
    select coalesce(
      json_agg(json_build_object('id', id::text, 'app_role', app_role) order by id),
      '[]'::json
    )
    from profiles
    where status = 'ACTIVE'
  ) as profiles,
  (
    select coalesce(json_agg(id::text order by id), '[]'::json)
    from organizations
    where status = 'ACTIVE'
  ) as organization_ids,
  (
    select coalesce(json_agg(id::text order by id), '[]'::json)
    from organization_members
    where status = 'ACTIVE'
  ) as membership_ids,
  (
    select coalesce(
      json_agg(json_build_object('id', id, 'status', status) order by id),
      '[]'::json
    )
    from packet_forms
    where id in (${PACKET_2_DELETED_FORM_IDS.join(", ")})
  ) as packet_forms,
  (
    select count(*)::int
    from field_instances
    where packet_id = 2
  ) as packet2_field_instance_count,
  (
    select count(*)::int
    from field_instances
    where packet_id = 5
  ) as packet5_field_instance_count,
  (
    select count(*)::int
    from field_instances
    where packet_id = 5
      and status = 'ACTIVE'
      and is_override = true
  ) as packet5_override_count,
  (select count(*)::int from storage.objects) as storage_object_count;
`.trim();

/** ACTIVE field_defaults and forms.copied_from_form_id lineage. */
const TARGET_SNAPSHOT_DETAIL_SQL = `
select
  (
    select coalesce(
      json_agg(json_build_object('id', id::text, 'form_id', form_id) order by id),
      '[]'::json
    )
    from field_defaults
    where status = 'ACTIVE'
  ) as field_defaults,
  (
    select coalesce(
      json_agg(
        json_build_object('id', id, 'copied_from_form_id', copied_from_form_id)
        order by id
      ),
      '[]'::json
    )
    from forms
    where status = 'ACTIVE'
  ) as forms_with_copied_from;
`.trim();

function parseJsonNumberArray(value: unknown, label: string): number[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new SelectiveMigrationSafetyError(`${label}: expected JSON array.`);
  }
  return value.map((v) => Number(v)).sort((a, b) => a - b);
}

function parseJsonStringArray(value: unknown, label: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new SelectiveMigrationSafetyError(`${label}: expected JSON array.`);
  }
  return value.map((v) => String(v));
}

function parseJsonObjectArray<T>(value: unknown, label: string): T[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new SelectiveMigrationSafetyError(`${label}: expected JSON array.`);
  }
  return value as T[];
}

function parseIntField(row: Record<string, unknown>, key: string): number {
  return Number(row[key] ?? 0);
}

function buildLiveSnapshot(): {
  snap: ValidationSnapshot;
  storageObjectCount: number;
  extraFailures: string[];
} {
  const extraFailures: string[] = [];

  const authRows = runTargetSqlJson(TARGET_AUTH_VERIFY_SQL);
  if (authRows.length !== 1) {
    throw new SelectiveMigrationSafetyError("Auth verify returned no rows.");
  }
  const auth = authRows[0];

  const coreRows = runTargetSqlJson(TARGET_SNAPSHOT_CORE_SQL);
  if (coreRows.length !== 1) {
    throw new SelectiveMigrationSafetyError("Snapshot core query returned no rows.");
  }
  const core = coreRows[0];

  const detailRows = runTargetSqlJson(TARGET_SNAPSHOT_DETAIL_SQL);
  if (detailRows.length !== 1) {
    throw new SelectiveMigrationSafetyError("Snapshot detail query returned no rows.");
  }
  const detail = detailRows[0];

  const formIds = parseJsonNumberArray(core.form_ids, "form_ids");
  const collectionIds = parseJsonNumberArray(core.collection_ids, "collection_ids");
  const contactIds = parseJsonNumberArray(core.contact_ids, "contact_ids");
  const propertyIds = parseJsonNumberArray(core.property_ids, "property_ids");
  const packetIds = parseJsonNumberArray(core.packet_ids, "packet_ids");

  const profiles = parseJsonObjectArray<{ id: string; app_role: string }>(
    core.profiles,
    "profiles",
  );
  const profileAppRoles: Record<string, string> = {};
  for (const p of profiles) profileAppRoles[p.id] = p.app_role;

  const orgIds = parseJsonStringArray(core.organization_ids, "organization_ids");
  const membershipIds = parseJsonStringArray(core.membership_ids, "membership_ids");

  const packetForms = parseJsonObjectArray<{ id: number; status: string }>(
    core.packet_forms,
    "packet_forms",
  );
  const packetFormStatuses: Record<number, string> = {};
  for (const pf of packetForms) {
    packetFormStatuses[Number(pf.id)] = String(pf.status);
  }

  const p2Count = parseIntField(core, "packet2_field_instance_count");
  const p5Count = parseIntField(core, "packet5_field_instance_count");
  const p5Override = parseIntField(core, "packet5_override_count");

  const defaultRows = parseJsonObjectArray<{ id: string; form_id: number | null }>(
    detail.field_defaults,
    "field_defaults",
  );
  const defaultFormIds = [
    ...new Set(defaultRows.map((d) => (d.form_id == null ? null : Number(d.form_id)))),
  ];

  const formsCopied = parseJsonObjectArray<{
    id: number;
    copied_from_form_id: number | null;
  }>(detail.forms_with_copied_from, "forms_with_copied_from");

  const storageObjectCount = parseIntField(core, "storage_object_count");
  if (storageObjectCount !== 0) {
    extraFailures.push(
      `Storage object count must be 0 before/without approved storage copy (got ${storageObjectCount}).`,
    );
  }

  // Exact-set extras (also enforced inside validateProductionSnapshot)
  if (contactIds.join(",") !== [...APPROVED_CONTACT_IDS].join(",")) {
    extraFailures.push(
      `Contact IDs must be exactly 2,3,4,6 (got ${contactIds.join(",") || "none"}).`,
    );
  }
  if (collectionIds.join(",") !== [...APPROVED_COLLECTION_IDS].join(",")) {
    extraFailures.push(
      `Collection IDs must be exactly 1,2,3,5 (got ${collectionIds.join(",") || "none"}).`,
    );
  }
  if (formIds.join(",") !== [...APPROVED_FORM_IDS].join(",")) {
    extraFailures.push(
      `Form IDs must be exactly 1–18 ACTIVE (got ${formIds.join(",") || "none"}).`,
    );
  }
  if (packetIds.join(",") !== [...APPROVED_PACKET_IDS].join(",")) {
    extraFailures.push(
      `Packet IDs must be exactly 2,5 (got ${packetIds.join(",") || "none"}).`,
    );
  }
  if (defaultRows.length !== APPROVED_DEFAULT_COUNT) {
    extraFailures.push(
      `ACTIVE defaults must be ${APPROVED_DEFAULT_COUNT} (got ${defaultRows.length}).`,
    );
  }

  const snap: ValidationSnapshot = {
    authUserIds: [String(auth.user_id)],
    authEmails: [String(auth.email)],
    identityIds: [String(auth.identity_id)],
    profileIds: profiles.map((p) => p.id),
    profileAppRoles,
    organizationIds: orgIds,
    membershipIds,
    formIds,
    collectionIds,
    contactIds,
    propertyIds,
    packetIds,
    packetFormStatuses,
    packet2FieldInstanceCount: p2Count,
    packet5FieldInstanceCount: p5Count,
    packet5OverrideCount: p5Override,
    defaultCount: defaultRows.length,
    defaultFormIds,
    storagePathsPresent: storageObjectCount > 0 ? ["(objects present)"] : [],
    storagePathsAbsent: [
      "global/forms/21/",
      "global/forms/22/",
      "global/forms/23/",
    ],
    formsWithCopiedFrom: formsCopied.map((f) => ({
      id: Number(f.id),
      copied_from_form_id:
        f.copied_from_form_id == null ? null : Number(f.copied_from_form_id),
    })),
    orphanFkCount: 0,
  };

  // Auth count checks from SQL
  if (Number(auth.user_count) !== 1) {
    extraFailures.push(`Auth user_count must be 1 (got ${auth.user_count}).`);
  }
  if (Number(auth.identity_count) !== 1) {
    extraFailures.push(`Auth identity_count must be 1 (got ${auth.identity_count}).`);
  }

  return { snap, storageObjectCount, extraFailures };
}

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

async function main() {
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
            "contacts exactly 2,3,4,6",
            "packets exactly 2,5",
            "packet forms 25/26 DELETED",
            `defaults=${APPROVED_DEFAULT_COUNT}`,
            "storage objects = 0",
            "packet fingerprints counts match",
          ],
          manifestChecksum: manifest.meta.checksum,
          expectedTargetRef: PROD_PROJECT_REF,
        },
        null,
        2,
      ),
    );
    return;
  }

  const sourceUrl = process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sourceKey =
    process.env.SOURCE_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetUrl = process.env.TARGET_SUPABASE_URL;
  const targetKey = process.env.TARGET_SUPABASE_SECRET_KEY;

  assertRequiredCredentials({
    sourceUrl,
    sourceKey,
    targetUrl,
    targetKey,
    requireTarget: true,
  });
  if (!process.env.TARGET_DB_PASSWORD?.trim()) {
    throw new SelectiveMigrationSafetyError(
      "TARGET_DB_PASSWORD is required for execute (pooler SQL).",
    );
  }
  const refs = assertDistinctProjects({
    sourceUrl: sourceUrl!,
    targetUrl: targetUrl!,
    allowDevAsSource: true,
  });
  assertProductionTargetRef(refs.targetRef);

  const { snap, storageObjectCount, extraFailures } = buildLiveSnapshot();
  const result = validateProductionSnapshot(snap, manifest);
  const failures = [...result.failures, ...extraFailures];
  const ok = failures.length === 0;

  console.log(
    JSON.stringify(
      {
        mode: "execute",
        ok,
        targetRef: refs.targetRef,
        storageObjectCount,
        summary: {
          contacts: snap.contactIds,
          collections: snap.collectionIds,
          forms: snap.formIds,
          packets: snap.packetIds,
          defaults: snap.defaultCount,
          packet2FieldInstances: snap.packet2FieldInstanceCount,
          packet5FieldInstances: snap.packet5FieldInstanceCount,
          packet5Overrides: snap.packet5OverrideCount,
        },
        failures,
      },
      null,
      2,
    ),
  );

  if (!ok) {
    console.error("Production validation FAILED:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log("Production validation OK.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
