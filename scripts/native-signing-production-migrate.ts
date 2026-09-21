/**
 * Native Signing production migrate + suspend + bump helper (CLI).
 *
 * Default: dry-run. Never mutates in this scaffolding stage.
 *
 * Example dry-run:
 *   npm run plan:native-signing-production-migrate -- --production --project-ref=eetonalyyyssvkyfdoxh --i-understand-production-signing-migrate
 */
import { planNativeSigningProductionMigrate } from "../lib/signing/production-migrate-plan.ts";

function parseFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseValue(argv: string[], prefix: string): string | null {
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const argv = process.argv.slice(2);
const plan = planNativeSigningProductionMigrate({
  productionFlag: parseFlag(argv, "--production"),
  projectRef: parseValue(argv, "--project-ref="),
  confirmationFlag: parseFlag(
    argv,
    "--i-understand-production-signing-migrate",
  ),
  executeFlag: parseFlag(argv, "--execute"),
});

console.log("Native Signing production migrate helper");
console.log(`mode=${plan.mode}`);
console.log(`productionFlag=${plan.production}`);
console.log(`projectRef=${plan.projectRef ?? "(missing)"}`);
console.log(`confirmation=${plan.confirmation}`);
console.log("--- planned steps ---");
for (const step of plan.steps) {
  console.log(`- ${step}`);
}
if (plan.refusals.length > 0) {
  console.log("--- refusals ---");
  for (const refusal of plan.refusals) {
    console.log(`REFUSE: ${refusal}`);
  }
  process.exit(1);
}
if (plan.dryRunAccepted) {
  console.log("DRY-RUN OK: no mutations performed.");
  process.exit(0);
}
console.log("PLAN INCOMPLETE");
process.exit(1);
