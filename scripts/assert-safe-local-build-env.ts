/**
 * Preflight for feature-branch / local validation builds.
 * Ensures Next will not auto-load production ops credentials and that the
 * app Supabase URL targets development.
 *
 * Usage: npm run build:validate
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEV_SUPABASE_PROJECT_REF,
  PROD_SUPABASE_PROJECT_REF,
  extractSupabaseProjectRef,
} from "../lib/supabase/project-guard.ts";

function readEnvFileValues(filePath: string): Map<string, string> {
  const values = new Map<string, string>();
  if (!existsSync(filePath)) {
    return values;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function fail(message: string): never {
  console.error(`[build:validate] ${message}`);
  process.exit(1);
}

const root = process.cwd();
const productionLocalPath = resolve(root, ".env.production.local");
const opsPath = resolve(root, ".env.ops.production");
const localPath = resolve(root, ".env.local");

if (existsSync(productionLocalPath)) {
  fail(
    ".env.production.local is present. Next.js auto-loads that file during " +
      "`next build` and can silently mix production credentials into validation. " +
      "Rename/move production ops credentials to gitignored .env.ops.production " +
      "(loaded only by explicit npm production-ops scripts).",
  );
}

if (process.env.VERCEL) {
  // On Vercel, platform env vars are authoritative; local files are absent.
  console.log("[build:validate] Vercel build detected; skipping local file checks.");
  process.exit(0);
}

const localEnv = readEnvFileValues(localPath);
if (localEnv.size === 0) {
  fail("Missing .env.local. Feature validation builds require development credentials.");
}

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  localEnv.get("NEXT_PUBLIC_SUPABASE_URL")?.trim();
const ref = extractSupabaseProjectRef(url);

if (!ref) {
  fail("NEXT_PUBLIC_SUPABASE_URL is missing or not a valid *.supabase.co URL.");
}

if (ref === PROD_SUPABASE_PROJECT_REF) {
  fail(
    `NEXT_PUBLIC_SUPABASE_URL points at production (${PROD_SUPABASE_PROJECT_REF}). ` +
      `Feature validation must use development (${DEV_SUPABASE_PROJECT_REF}).`,
  );
}

if (ref !== DEV_SUPABASE_PROJECT_REF) {
  fail(
    `NEXT_PUBLIC_SUPABASE_URL ref "${ref}" is neither development nor an approved validation target. ` +
      `Expected ${DEV_SUPABASE_PROJECT_REF}.`,
  );
}

if (existsSync(opsPath)) {
  console.log(
    "[build:validate] Found .env.ops.production (ok; not auto-loaded by Next.js).",
  );
}

console.log(
  `[build:validate] Safe local build target: development (${DEV_SUPABASE_PROJECT_REF}).`,
);
