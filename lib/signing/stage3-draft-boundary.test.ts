import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  NATIVE_SIGNING_STAGE3_DRAFT_TABLES,
  NATIVE_SIGNING_STAGE3_MIGRATIONS,
} from "./stage1-schema";
import { buildPreparedVersionObjectKey, sha256Hex } from "./prepare-pdf";

describe("Native Signing Stage 3 draft/evidence boundary contracts", () => {
  const root = process.cwd();
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20260915120000_native_signing_stage3_draft_preparation.sql",
    ),
    "utf8",
  );
  const promotion = readFileSync(
    join(root, "lib/signing/package-promotion.ts"),
    "utf8",
  );
  const actions = readFileSync(
    join(root, "lib/signing/stage3-actions.ts"),
    "utf8",
  );
  const draftFields = readFileSync(
    join(root, "lib/signing/draft-fields.ts"),
    "utf8",
  );

  it("adds signing_draft_fields instead of mutating revision-scoped signing_fields", () => {
    assert.deepEqual([...NATIVE_SIGNING_STAGE3_DRAFT_TABLES], [
      "signing_draft_fields",
    ]);
    assert.match(migration, /create table if not exists public\.signing_draft_fields/);
    assert.match(draftFields, /signing_draft_fields/);
    assert.doesNotMatch(draftFields, /\.from\("signing_fields"\)/);
  });

  it("keeps Stage 3 migration additive and browser-denied", () => {
    assert.deepEqual([...NATIVE_SIGNING_STAGE3_MIGRATIONS], [
      "20260915120000_native_signing_stage3_draft_preparation",
      "20260915130000_native_signing_stage3_draft_document_inclusion",
    ]);
    assert.match(migration, /force row level security/);
    assert.match(migration, /signing_draft_fields_deny_authenticated/);
    assert.match(migration, /revoke all on table public\.signing_draft_fields from authenticated/);
    assert.doesNotMatch(migration, /on delete cascade/i);

    const inclusionMigration = readFileSync(
      join(
        root,
        "supabase/migrations/20260915130000_native_signing_stage3_draft_document_inclusion.sql",
      ),
      "utf8",
    );
    assert.match(inclusionMigration, /included_in_draft boolean not null default true/);
  });

  it("does not expose Send or Begin In-Person activation actions", () => {
    assert.doesNotMatch(
      actions,
      /export async function (sendSigningAction|beginInPersonSigningAction|createRevision1Action|finalizePreparationAction)/,
    );
    assert.doesNotMatch(actions, /export async function promotePackageRevision/);
    assert.match(
      actions,
      /Intentionally NOT exported as a browser-facing activation action/,
    );
  });

  it("keeps package promotion as an internal server primitive", () => {
    assert.match(promotion, /Not Send\. Not Begin In-Person Signing/);
    assert.match(promotion, /promotePackageRevisionFromDraftWithActor/);
    assert.match(promotion, /PACKAGE_REVISION_PROMOTED/);
  });

  it("uses opaque non-PII prepared version object keys", () => {
    const key = buildPreparedVersionObjectKey({
      signingId: "11111111-1111-4111-8111-111111111111",
      documentId: "22222222-2222-4222-8222-222222222222",
      versionId: "33333333-3333-4333-8333-333333333333",
    });
    assert.equal(
      key,
      "signings/11111111-1111-4111-8111-111111111111/documents/22222222-2222-4222-8222-222222222222/versions/33333333-3333-4333-8333-333333333333.pdf",
    );
    assert.doesNotMatch(key, /Contract|Buyer|@| /);
  });

  it("hashes exact byte arrays with SHA-256 hex", () => {
    const bytes = new TextEncoder().encode("harbaugh-forms-stage3");
    const digest = sha256Hex(bytes);
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(digest, sha256Hex(bytes));
    assert.notEqual(
      digest,
      sha256Hex(new TextEncoder().encode("harbaugh-forms-stage3!")),
    );
  });
});
