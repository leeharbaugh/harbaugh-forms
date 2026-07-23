import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPROVED_COLLECTION_IDS,
  APPROVED_DEFAULT_COUNT,
  APPROVED_FORM_IDS,
  EXCLUDED_COLLECTION_IDS,
  EXCLUDED_FORM_IDS,
  LEE_AUTH_UUID,
  LEE_IDENTITY_ID,
  PACKET_2_DELETED_FORM_IDS,
  PACKET_2_FIELD_INSTANCE_COUNT,
  PACKET_5_FIELD_INSTANCE_COUNT,
  PACKET_5_OVERRIDE_COUNT,
  PROD_PROJECT_REF,
} from "./constants.ts";
import {
  assertNeverCreatesReplacementUuid,
  buildAuthMigrationPlan,
  buildLeeAuthImportSql,
  sqlDollarQuote,
  validateAuthExportForMigration,
  validateTargetAuthPopulation,
} from "./auth-migrate.ts";
import {
  assertNoForm23LineageTransform,
  loadManifest,
  validateManifestShape,
} from "./manifest.ts";
import {
  assertRowAllowed,
  filterRowsForTable,
  isApprovedFieldInstanceRow,
  planSequenceResets,
  sequenceResetSql,
} from "./public-data.ts";
import {
  planConflictingGlobalFieldSoftDeletes,
  planReconciliation,
  summarizeReconciliationPlan,
} from "./reconcile.ts";
import {
  assertDistinctProjects,
  assertProductionTargetRef,
  SelectiveMigrationSafetyError,
} from "./safety.ts";
import {
  buildStorageAllowlist,
  isExcludedStoragePath,
} from "./storage-copy.ts";
import { validateProductionSnapshot } from "./validate.ts";

describe("selective production constants", () => {
  it("approves exactly forms 1–18", () => {
    assert.deepEqual([...APPROVED_FORM_IDS], [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  it("excludes forms 21, 22, 23", () => {
    assert.deepEqual([...EXCLUDED_FORM_IDS], [21, 22, 23]);
  });

  it("approves collections 1,2,3,5 and excludes 4,7,9,12,14", () => {
    assert.deepEqual([...APPROVED_COLLECTION_IDS], [1, 2, 3, 5]);
    assert.deepEqual([...EXCLUDED_COLLECTION_IDS], [4, 7, 9, 12, 14]);
  });

  it("uses recalculated default count 101", () => {
    assert.equal(APPROVED_DEFAULT_COUNT, 101);
  });
});

describe("manifest", () => {
  const manifest = loadManifest();

  it("loads with empty unresolvedConflicts and valid checksum", () => {
    assert.deepEqual(manifest.unresolvedConflicts, []);
    validateManifestShape(manifest);
    assertNoForm23LineageTransform(manifest);
  });

  it("includes forms 1–18 only", () => {
    const ids = manifest.forms.map((f) => Number(f.id)).sort((a, b) => a - b);
    assert.deepEqual(ids, [...APPROVED_FORM_IDS]);
    for (const id of EXCLUDED_FORM_IDS) {
      assert.equal(ids.includes(id), false);
    }
  });

  it("includes collections 1,2,3,5 only", () => {
    const ids = manifest.collections.map((c) => Number(c.id)).sort((a, b) => a - b);
    assert.deepEqual(ids, [...APPROVED_COLLECTION_IDS]);
  });

  it("includes DELETED packet forms 25 and 26", () => {
    for (const id of PACKET_2_DELETED_FORM_IDS) {
      const row = manifest.packetForms.find((p) => Number(p.id) === id);
      assert.ok(row);
      assert.equal(row?.status, "DELETED");
    }
  });

  it("has no defaults referencing excluded forms", () => {
    for (const d of manifest.defaults) {
      const formId = d.form_id == null ? null : Number(d.form_id);
      if (formId != null) {
        assert.equal((EXCLUDED_FORM_IDS as readonly number[]).includes(formId), false);
      }
    }
    assert.equal(manifest.defaults.length, APPROVED_DEFAULT_COUNT);
  });

  it("records packet fingerprints", () => {
    assert.equal(
      Number(manifest.packetFingerprints.packet2.fieldInstanceCount),
      PACKET_2_FIELD_INSTANCE_COUNT,
    );
    assert.equal(
      Number(manifest.packetFingerprints.packet5.fieldInstanceCount),
      PACKET_5_FIELD_INSTANCE_COUNT,
    );
    assert.equal(
      Number(manifest.packetFingerprints.packet5.overrideCount),
      PACKET_5_OVERRIDE_COUNT,
    );
    assert.ok(manifest.packetFingerprints.packet2.sha256);
    assert.ok(manifest.packetFingerprints.packet5.sha256);
  });
});

describe("auth migration safeguards", () => {
  it("preserves Lee UUID and identity; refuses replacement UUID", () => {
    const plan = buildAuthMigrationPlan(true);
    assert.equal(plan.expectedUserId, LEE_AUTH_UUID);
    assert.equal(plan.expectedIdentityId, LEE_IDENTITY_ID);
    assertNeverCreatesReplacementUuid(LEE_AUTH_UUID);
    assert.throws(
      () => assertNeverCreatesReplacementUuid("00000000-0000-4000-8000-000000000000"),
      SelectiveMigrationSafetyError,
    );
  });

  it("validates Lee-only export shape", () => {
    validateAuthExportForMigration({
      users: [
        {
          id: LEE_AUTH_UUID,
          email: "lee@leeharbaugh.com",
          email_confirmed_at: "x",
          encrypted_password_present: true,
          encrypted_password: "$2a$notlogged",
        },
      ],
      identities: [
        { id: LEE_IDENTITY_ID, user_id: LEE_AUTH_UUID, provider: "email" },
      ],
    });
    assert.throws(
      () =>
        validateAuthExportForMigration({
          users: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              email: "lee@leeharbaugh.com",
              email_confirmed_at: "x",
              encrypted_password_present: true,
            },
          ],
          identities: [
            { id: LEE_IDENTITY_ID, user_id: LEE_AUTH_UUID, provider: "email" },
          ],
        }),
      /UUID mismatch/,
    );
  });

  it("validates target population is Lee only", () => {
    validateTargetAuthPopulation({
      userIds: [LEE_AUTH_UUID],
      emails: ["lee@leeharbaugh.com"],
      identityIds: [LEE_IDENTITY_ID],
    });
  });

  it("dollar-quotes values and builds Lee Auth import SQL with preserved ids", () => {
    assert.equal(sqlDollarQuote("abc"), "$v$abc$v$");
    assert.equal(sqlDollarQuote("has $v$ inside", "v"), "$v0$has $v$ inside$v0$");
    const sql = buildLeeAuthImportSql({
      users: [
        {
          id: LEE_AUTH_UUID,
          email: "lee@leeharbaugh.com",
          email_confirmed_at: "2026-06-08T00:00:00Z",
          encrypted_password_present: true,
          encrypted_password: "$2a$10$not_a_real_hash_for_test_only",
          aud: "authenticated",
          role: "authenticated",
          instance_id: "00000000-0000-0000-0000-000000000000",
        },
      ],
      identities: [
        {
          id: LEE_IDENTITY_ID,
          user_id: LEE_AUTH_UUID,
          provider: "email",
          provider_id: LEE_AUTH_UUID,
          identity_data: JSON.stringify({
            sub: LEE_AUTH_UUID,
            email: "lee@leeharbaugh.com",
          }),
        },
      ],
    });
    assert.match(sql, /do \$authimport\$/i);
    assert.match(sql, new RegExp(LEE_AUTH_UUID));
    assert.match(sql, new RegExp(LEE_IDENTITY_ID));
    assert.match(sql, /insert into auth\.users/i);
    assert.match(sql, /insert into auth\.identities/i);
    assert.match(sql, /\$2a\$10\$not_a_real_hash_for_test_only/);
  });
});

describe("safety gates", () => {
  it("rejects source/target equality and dev as target", () => {
    assert.throws(
      () =>
        assertDistinctProjects({
          sourceUrl: "https://ewxsxwzezhkeawnjvigx.supabase.co",
          targetUrl: "https://ewxsxwzezhkeawnjvigx.supabase.co",
        }),
      /distinct/,
    );
    assert.throws(
      () =>
        assertDistinctProjects({
          sourceUrl: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
          targetUrl: "https://ewxsxwzezhkeawnjvigx.supabase.co",
        }),
      /development project/,
    );
  });

  it("allows distinct source/target", () => {
    const refs = assertDistinctProjects({
      sourceUrl: "https://ewxsxwzezhkeawnjvigx.supabase.co",
      targetUrl: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
      allowDevAsSource: true,
    });
    assert.equal(refs.sourceRef, "ewxsxwzezhkeawnjvigx");
    assert.equal(refs.targetRef, "bbbbbbbbbbbbbbbbbbbb");
  });
});

describe("public-data filters", () => {
  const manifest = loadManifest();

  it("filters forms and refuses excluded form rows", () => {
    const filtered = filterRowsForTable(
      "forms",
      [{ id: 1 }, { id: 21 }, { id: 23 }, { id: 18 }],
      manifest,
    );
    assert.deepEqual(
      filtered.map((r) => r.id),
      [1, 18],
    );
    assert.throws(
      () => assertRowAllowed("forms", { id: 21 }, manifest),
      /excluded form/,
    );
  });

  it("preserves DELETED status for packet forms 25 and 26", () => {
    assertRowAllowed("packet_forms", { id: 25, status: "DELETED", form_id: 9 }, manifest);
    assert.throws(
      () =>
        assertRowAllowed(
          "packet_forms",
          { id: 25, status: "ACTIVE", form_id: 9 },
          manifest,
        ),
      /DELETED/,
    );
  });

  it("aborts when default references excluded form", () => {
    assert.throws(
      () =>
        assertRowAllowed(
          "field_defaults",
          { id: "x", form_id: 23, status: "ACTIVE" },
          manifest,
        ),
      /excluded form/,
    );
  });

  it("filters field_instances by packet_id or approved packet_form_id", () => {
    assert.equal(isApprovedFieldInstanceRow({ packet_id: 2, packet_form_id: 7 }), true);
    assert.equal(isApprovedFieldInstanceRow({ packet_id: 5, packet_form_id: 27 }), true);
    assert.equal(isApprovedFieldInstanceRow({ packet_id: 99, packet_form_id: 25 }), true);
    assert.equal(isApprovedFieldInstanceRow({ packet_id: 99, packet_form_id: 999 }), false);
    const filtered = filterRowsForTable(
      "field_instances",
      [
        { id: "a", packet_id: 2, packet_form_id: 7 },
        { id: "b", packet_id: 9, packet_form_id: 99 },
        { id: "c", packet_id: 1, packet_form_id: 26 },
      ],
      manifest,
    );
    assert.deepEqual(
      filtered.map((r) => r.id),
      ["a", "c"],
    );
  });

  it("filters representation agreement 1 and its clients", () => {
    const agreements = filterRowsForTable(
      "representation_agreements",
      [{ id: 1 }, { id: 2 }],
      manifest,
    );
    assert.deepEqual(
      agreements.map((r) => r.id),
      [1],
    );
    const clients = filterRowsForTable(
      "representation_agreement_clients",
      [
        { id: 1, representation_agreement_id: 1, contact_id: 2 },
        { id: 9, representation_agreement_id: 1, contact_id: 1 },
        { id: 10, representation_agreement_id: 2, contact_id: 2 },
      ],
      manifest,
    );
    assert.deepEqual(
      clients.map((r) => r.id),
      [1],
    );
  });

  it("plans sequence resets after explicit IDs", () => {
    const resets = planSequenceResets({ packets: 5, contacts: 6, forms: 18 });
    assert.ok(resets.some((r) => r.table === "packets" && r.setTo === 5));
    assert.match(sequenceResetSql(resets[0]), /setval/);
  });
});

describe("reconcile planning", () => {
  const manifest = loadManifest();

  it("plans soft-delete of ACTIVE defaults not in approved manifest set", () => {
    const approvedId = String(manifest.defaults[0].id);
    const plan = planReconciliation(
      {
        field_defaults: [{ id: approvedId, status: "ACTIVE" }],
      },
      {
        fieldDefaults: [
          { id: approvedId, status: "ACTIVE" },
          { id: "scaffold-default-uuid", status: "ACTIVE" },
          { id: "already-deleted", status: "DELETED" },
        ],
        contacts: [],
        collections: [],
      },
      manifest,
    );
    assert.ok(
      plan.removes.some(
        (r) =>
          r.table === "field_defaults" &&
          r.id === "scaffold-default-uuid" &&
          r.action === "remove",
      ),
    );
    assert.equal(
      plan.removes.some((r) => r.id === "already-deleted"),
      false,
    );
    assert.ok(
      plan.updates.some((r) => r.table === "field_defaults" && r.id === approvedId),
    );
  });

  it("plans contact 1 scaffold cleanup and retains approved contacts", () => {
    const plan = planReconciliation(
      {
        contacts: [{ id: 2 }, { id: 3 }, { id: 4 }, { id: 6 }],
      },
      {
        fieldDefaults: [],
        contacts: [{ id: 1 }, { id: 2 }, { id: 3 }],
        collections: [],
        representationAgreementClients: [
          { id: 99, contact_id: 1 },
          { id: 1, contact_id: 2 },
        ],
      },
      manifest,
    );
    assert.ok(
      plan.removes.some(
        (r) => r.table === "contacts" && r.id === 1 && /scaffold contact 1/.test(r.reason || ""),
      ),
    );
    assert.ok(
      plan.removes.some(
        (r) =>
          r.table === "representation_agreement_clients" &&
          r.id === 99 &&
          r.action === "remove",
      ),
    );
    assert.ok(plan.updates.some((r) => r.table === "contacts" && r.id === 2));
    assert.ok(plan.inserts.some((r) => r.table === "contacts" && r.id === 4));
  });

  it("plans collection 4 Test Packet removal and upserts approved collections", () => {
    const plan = planReconciliation(
      {
        collections: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 5 }],
      },
      {
        fieldDefaults: [],
        contacts: [],
        collections: [
          { id: 1, status: "ACTIVE" },
          { id: 4, status: "ACTIVE" },
          { id: 7, status: "DELETED" },
        ],
      },
      manifest,
    );
    assert.ok(
      plan.removes.some(
        (r) =>
          r.table === "collections" &&
          r.id === 4 &&
          /Test Packet/.test(r.reason || ""),
      ),
    );
    assert.ok(plan.removes.some((r) => r.table === "collections" && r.id === 7));
    assert.ok(plan.updates.some((r) => r.table === "collections" && r.id === 1));
    assert.ok(plan.inserts.some((r) => r.table === "collections" && r.id === 5));
    const summary = summarizeReconciliationPlan(plan);
    assert.ok(summary.removesByTable.collections >= 2);
  });

  it("plans soft-delete of conflicting ACTIVE GLOBAL field_keys", () => {
    const items = planConflictingGlobalFieldSoftDeletes(
      [{ id: "incoming-1", field_key: "buyer_name", scope: "GLOBAL" }],
      [
        { id: "incoming-1", field_key: "buyer_name" },
        { id: "scaffold-other", field_key: "Buyer_Name" },
        { id: "unrelated", field_key: "other_key" },
      ],
    );
    assert.deepEqual(
      items.map((i) => i.id),
      ["scaffold-other"],
    );
  });

  it("requires production target ref", () => {
    assertProductionTargetRef(PROD_PROJECT_REF);
    assert.throws(() => assertProductionTargetRef("ewxsxwzezhkeawnjvigx"), /production/);
  });
});

describe("storage allowlist", () => {
  const manifest = loadManifest();
  const allowlist = buildStorageAllowlist(manifest);

  it("excludes form 21/22/23 PDFs", () => {
    assert.equal(isExcludedStoragePath("global/forms/23/CondoListingAddendum.pdf"), true);
    assert.equal(
      isExcludedStoragePath(
        "users/8d10af59-f3f8-4a48-94b5-3477656c02a6/forms/21/CondoListingAddendum.pdf",
      ),
      true,
    );
    for (const e of allowlist) {
      assert.equal(isExcludedStoragePath(e.path), false);
    }
  });

  it("includes forms 1–18 global PDFs and packet 2/5 docs", () => {
    assert.ok(allowlist.some((e) => e.path.startsWith("global/forms/1/")));
    assert.ok(allowlist.some((e) => e.path.includes("/packets/2/")));
    assert.ok(allowlist.some((e) => e.path.includes("/packets/5/")));
    assert.equal(allowlist.some((e) => e.path.includes("global/forms/23/")), false);
  });
});

describe("validation snapshot", () => {
  it("passes expected production snapshot from manifest", () => {
    const manifest = loadManifest();
    const result = validateProductionSnapshot(
      {
        authUserIds: [LEE_AUTH_UUID],
        authEmails: ["lee@leeharbaugh.com"],
        identityIds: [LEE_IDENTITY_ID],
        profileIds: [LEE_AUTH_UUID],
        profileAppRoles: { [LEE_AUTH_UUID]: "ADMIN" },
        organizationIds: ["b788f525-53f4-42ed-b5a1-cb741398a974"],
        membershipIds: ["bbeff129-afd3-4c79-bef3-36df38ac0c31"],
        formIds: [...APPROVED_FORM_IDS],
        collectionIds: [...APPROVED_COLLECTION_IDS],
        contactIds: [2, 3, 4, 6],
        propertyIds: [1, 3],
        packetIds: [2, 5],
        packetFormStatuses: { 25: "DELETED", 26: "DELETED" },
        packet2FieldInstanceCount: 65,
        packet5FieldInstanceCount: 107,
        packet5OverrideCount: 16,
        defaultCount: 101,
        defaultFormIds: [null, 1, 7, 11, 15, 18],
        storagePathsPresent: ["global/forms/1/x.pdf"],
        storagePathsAbsent: ["global/forms/23/"],
        formsWithCopiedFrom: [{ id: 1, copied_from_form_id: null }],
        orphanFkCount: 0,
      },
      manifest,
    );
    assert.equal(result.ok, true);
  });

  it("fails when form 23 present", () => {
    const manifest = loadManifest();
    const result = validateProductionSnapshot(
      {
        authUserIds: [LEE_AUTH_UUID],
        authEmails: ["lee@leeharbaugh.com"],
        identityIds: [LEE_IDENTITY_ID],
        profileIds: [LEE_AUTH_UUID],
        profileAppRoles: { [LEE_AUTH_UUID]: "ADMIN" },
        organizationIds: ["b788f525-53f4-42ed-b5a1-cb741398a974"],
        membershipIds: ["bbeff129-afd3-4c79-bef3-36df38ac0c31"],
        formIds: [...APPROVED_FORM_IDS, 23],
        collectionIds: [...APPROVED_COLLECTION_IDS],
        contactIds: [2, 3, 4, 6],
        propertyIds: [1, 3],
        packetIds: [2, 5],
        packetFormStatuses: { 25: "DELETED", 26: "DELETED" },
        packet2FieldInstanceCount: 65,
        packet5FieldInstanceCount: 107,
        packet5OverrideCount: 16,
        defaultCount: 101,
        defaultFormIds: [null],
        storagePathsPresent: [],
        storagePathsAbsent: [],
        formsWithCopiedFrom: [],
        orphanFkCount: 0,
      },
      manifest,
    );
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /Excluded form 23/.test(f)));
  });
});
