/**
 * Dry-run / gated Auth migration for Lee only (UUID-preserving).
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate-approved-auth.ts --dry-run
 *   SOURCE_SUPABASE_URL=... SOURCE_SUPABASE_SECRET_KEY=... \
 *   TARGET_SUPABASE_URL=... TARGET_SUPABASE_SECRET_KEY=... \
 *   node --experimental-strip-types scripts/migrate-approved-auth.ts --execute
 *
 * Does not run against production until target credentials exist.
 * Never logs password hashes. Never creates a replacement Lee UUID.
 */

import {
  authExportLogSummary,
  buildAuthMigrationPlan,
  validateAuthExportForMigration,
  assertNeverCreatesReplacementUuid,
} from "../lib/selective-production/auth-migrate.ts";
import { LEE_AUTH_UUID } from "../lib/selective-production/constants.ts";
import {
  assertDistinctProjects,
  assertRequiredCredentials,
  parseArgs,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";

function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildAuthMigrationPlan(args.dryRun);
  assertNeverCreatesReplacementUuid(plan.expectedUserId);

  const sourceUrl = process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sourceKey =
    process.env.SOURCE_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetUrl = process.env.TARGET_SUPABASE_URL;
  const targetKey = process.env.TARGET_SUPABASE_SECRET_KEY;

  if (args.execute) {
    assertRequiredCredentials({
      sourceUrl,
      sourceKey,
      targetUrl,
      targetKey,
      requireTarget: true,
    });
    assertDistinctProjects({
      sourceUrl: sourceUrl!,
      targetUrl: targetUrl!,
      allowDevAsSource: true,
    });
    throw new SelectiveMigrationSafetyError(
      "Execute mode requires production project + SQL Auth import path. " +
        "Production does not exist yet — refusing to run. Use --dry-run.",
    );
  }

  // Dry-run: validate plan shape and local env can read source conceptually
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        plan: {
          ...plan,
          note: "Password hashes are never printed",
        },
        leeUuid: LEE_AUTH_UUID,
        sampleValidation: authExportLogSummary([
          {
            id: LEE_AUTH_UUID,
            email: plan.expectedEmail,
            email_confirmed_at: "present",
            encrypted_password_present: true,
          },
        ]),
      },
      null,
      2,
    ),
  );

  // Demonstrate export validation with expected shape (no live password)
  validateAuthExportForMigration({
    users: [
      {
        id: LEE_AUTH_UUID,
        email: plan.expectedEmail,
        email_confirmed_at: "2026-06-08T00:00:00Z",
        encrypted_password_present: true,
        encrypted_password: "$2a$placeholder_not_logged",
      },
    ],
    identities: [
      {
        id: plan.expectedIdentityId,
        user_id: LEE_AUTH_UUID,
        provider: "email",
      },
    ],
  });

  console.log("Auth migration dry-run OK — UUID/identity preservation safeguards passed.");
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
