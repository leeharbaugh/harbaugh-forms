/**
 * Planning helpers for Native Signing production migrate + suspend + bump.
 * Default dry-run; execute path deliberately unimplemented in scaffolding.
 */
import { NATIVE_SIGNING_ALL_MIGRATIONS } from "./native-signing-migrations";
import {
  NATIVE_SIGNING_DEV_PROJECT_REF,
  NATIVE_SIGNING_PROD_PROJECT_REF,
} from "./production-refs";

export type MigrateHelperPlan = {
  mode: "dry-run" | "execute";
  production: boolean;
  projectRef: string | null;
  confirmation: boolean;
  /** True only for a valid dry-run production plan (no mutations). */
  dryRunAccepted: boolean;
  steps: string[];
  refusals: string[];
};

export function planNativeSigningProductionMigrate(options: {
  productionFlag: boolean;
  projectRef: string | null | undefined;
  confirmationFlag: boolean;
  executeFlag: boolean;
}): MigrateHelperPlan {
  const refusals: string[] = [];
  const steps: string[] = [
    "Verify CLI/project ref is exactly eetonalyyyssvkyfdoxh",
    "Backup checkpoint (DB + Storage inventory + deployment ref)",
    `Apply ${NATIVE_SIGNING_ALL_MIGRATIONS.length} Native Signing migrations in timestamp order`,
    "Immediately set work_suspended=true on signing_system_controls",
    "Immediately bump access_epoch (atomic; leaves access_suspended=true)",
    "Verify work_suspended=true, access_suspended=true, feature OFF, no queued work",
    "Do NOT set NATIVE_SIGNING_ENABLED",
    "Do NOT resume access or work",
  ];

  if (!options.productionFlag) {
    refusals.push("Missing --production");
  }
  if (options.projectRef === NATIVE_SIGNING_DEV_PROJECT_REF) {
    refusals.push("Refuses development project ref in production mode");
  }
  if (options.projectRef !== NATIVE_SIGNING_PROD_PROJECT_REF) {
    refusals.push(
      `Project ref must be exactly ${NATIVE_SIGNING_PROD_PROJECT_REF}`,
    );
  }
  if (!options.confirmationFlag) {
    refusals.push("Missing --i-understand-production-signing-migrate");
  }

  const mode = options.executeFlag ? "execute" : "dry-run";
  if (mode === "execute") {
    refusals.push(
      "Execute path is intentionally not implemented in scaffolding; use dry-run planning only until a reviewed rollout runbook is approved.",
    );
  }

  return {
    mode,
    production: options.productionFlag,
    projectRef: options.projectRef ?? null,
    confirmation: options.confirmationFlag,
    dryRunAccepted:
      refusals.length === 0 &&
      mode === "dry-run" &&
      options.productionFlag &&
      options.confirmationFlag &&
      options.projectRef === NATIVE_SIGNING_PROD_PROJECT_REF,
    steps,
    refusals,
  };
}
