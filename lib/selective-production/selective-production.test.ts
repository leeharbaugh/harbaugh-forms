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
} from "./constants.ts";
import {
  assertNeverCreatesReplacementUuid,
  buildAuthMigrationPlan,
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
  planSequenceResets,
  sequenceResetSql,
} from "./public-data.ts";
import {
  assertDistinctProjects,
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

  it("plans sequence resets after explicit IDs", () => {
    const resets = planSequenceResets({ packets: 5, contacts: 6, forms: 18 });
    assert.ok(resets.some((r) => r.table === "packets" && r.setTo === 5));
    assert.match(sequenceResetSql(resets[0]), /setval/);
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
