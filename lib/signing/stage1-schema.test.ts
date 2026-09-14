import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  NATIVE_SIGNING_STAGE1_MIGRATIONS,
  NATIVE_SIGNING_STAGE1_TABLES,
  SIGNING_ARTIFACTS_BUCKET,
} from "./stage1-schema.ts";

function readMigration(name: string): string {
  return readFileSync(
    join(process.cwd(), "supabase", "migrations", `${name}.sql`),
    "utf8",
  );
}

describe("Native Signing Stage 1 schema contract", () => {
  const foundation = readMigration(NATIVE_SIGNING_STAGE1_MIGRATIONS[0]);
  const pointerFix = readMigration(NATIVE_SIGNING_STAGE1_MIGRATIONS[1]);
  const shorten = readMigration(NATIVE_SIGNING_STAGE1_MIGRATIONS[2]);
  const combined = `${foundation}\n${pointerFix}\n${shorten}`;

  it("names the private signing-artifacts bucket", () => {
    assert.match(foundation, new RegExp(`'${SIGNING_ARTIFACTS_BUCKET}'`));
    assert.match(foundation, /insert into storage\.buckets/i);
    assert.match(foundation, /public = excluded\.public/);
  });

  it("creates every Stage 1 evidence table", () => {
    for (const table of NATIVE_SIGNING_STAGE1_TABLES) {
      assert.match(
        foundation,
        new RegExp(`create table public\\.${table}\\b`, "i"),
        `missing create table for ${table}`,
      );
    }
  });

  it("does not create later-stage credential/session/delivery tables", () => {
    for (const deferred of [
      "signing_participant_credentials",
      "signing_completed_package_credentials",
      "signing_browser_sessions",
      "signing_copy_recipients",
      "signing_delivery_instructions",
      "signing_delivery_attempts",
      "signing_participant_presence_leases",
      "signing_amendment_locks",
      "signing_work_items",
      "signing_operation_idempotency",
    ]) {
      assert.doesNotMatch(
        combined,
        new RegExp(`create table public\\.${deferred}\\b`, "i"),
      );
    }
  });

  it("enables RLS and denies authenticated browser access", () => {
    assert.match(foundation, /enable row level security/i);
    assert.match(foundation, /_deny_authenticated/i);
    assert.match(foundation, /using \(false\)/);
    assert.match(foundation, /revoke all on table public\.%I from authenticated/i);
  });

  it("uses restrict/set null rather than cascade for evidence FKs", () => {
    assert.doesNotMatch(combined, /on delete cascade/i);
  });

  it("keeps signing_events append-only for updates with server sequence", () => {
    assert.match(foundation, /signing_events_assign_sequence/);
    assert.match(foundation, /signing_events_prevent_update/);
    assert.match(foundation, /append-only/i);
  });

  it("enforces same-Signing root pointers via composite FKs", () => {
    assert.match(
      pointerFix,
      /signings_current_package_revision_same_signing_fkey/,
    );
    assert.match(
      pointerFix,
      /signings_frozen_package_revision_same_signing_fkey/,
    );
    assert.match(
      pointerFix,
      /signings_current_primary_agent_association_same_signing_fkey/,
    );
    assert.match(
      pointerFix,
      /foreign key \(id, current_package_revision_id\)/,
    );
  });

  it("shortens the truncated version-document FK name", () => {
    assert.match(shorten, /signing_pkg_rev_docs_version_document_fkey/);
  });
});
