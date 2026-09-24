/**
 * Authoritative Native Signing migration inventory derived from repository
 * stage constants (not a stale abbreviated count).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  NATIVE_SIGNING_CEREMONY_MIGRATIONS,
  NATIVE_SIGNING_COMPLETION_DELIVERY_MIGRATIONS,
  NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS,
  NATIVE_SIGNING_STAGE1_MIGRATIONS,
  NATIVE_SIGNING_STAGE3_MIGRATIONS,
  NATIVE_SIGNING_STAGE4_MIGRATIONS,
  NATIVE_SIGNING_STAGE6_MIGRATIONS,
  NATIVE_SIGNING_TC_AUTHORITY_MIGRATIONS,
} from "./stage1-schema";

/** Ordered Native Signing migration basenames (no .sql suffix). */
export const NATIVE_SIGNING_ALL_MIGRATIONS = [
  ...NATIVE_SIGNING_STAGE1_MIGRATIONS,
  ...NATIVE_SIGNING_STAGE3_MIGRATIONS,
  ...NATIVE_SIGNING_STAGE4_MIGRATIONS,
  ...NATIVE_SIGNING_CEREMONY_MIGRATIONS,
  ...NATIVE_SIGNING_TC_AUTHORITY_MIGRATIONS,
  ...NATIVE_SIGNING_STAGE6_MIGRATIONS,
  ...NATIVE_SIGNING_COMPLETION_DELIVERY_MIGRATIONS,
  ...NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS,
  "20260921200000_native_signing_representative_capacity",
  "20260923200000_native_signing_ad_hoc_documents",
] as const;

export function listNativeSigningMigrationFilesFromDisk(
  migrationsDir = join(process.cwd(), "supabase", "migrations"),
): string[] {
  const entries = readdirSync(migrationsDir);
  return entries
    .filter(
      (name) =>
        name.endsWith(".sql") && name.includes("native_signing"),
    )
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();
}

export function assertNativeSigningMigrationInventoryMatchesDisk(): {
  ok: boolean;
  expected: readonly string[];
  onDisk: string[];
  missing: string[];
  unexpected: string[];
} {
  const expected = [...NATIVE_SIGNING_ALL_MIGRATIONS] as string[];
  const onDisk = listNativeSigningMigrationFilesFromDisk();
  const expectedSet = new Set(expected);
  const diskSet = new Set(onDisk);
  const missing = expected.filter((name) => !diskSet.has(name));
  const unexpected = onDisk.filter((name) => !expectedSet.has(name));
  const orderOk =
    onDisk.length === expected.length &&
    onDisk.every((name, index) => name === expected[index]);
  return {
    ok: missing.length === 0 && unexpected.length === 0 && orderOk,
    expected,
    onDisk,
    missing,
    unexpected,
  };
}
