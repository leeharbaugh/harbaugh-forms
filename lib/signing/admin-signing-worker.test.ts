import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("admin signing worker sweep", () => {
  it("is Global Admin only and uses shared batch processor", () => {
    const worker = readFileSync(
      join(process.cwd(), "lib/signing/admin-signing-worker.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "app/admin/signing-controls/page.tsx"),
      "utf8",
    );
    const controls = readFileSync(
      join(process.cwd(), "components/admin/admin-signing-worker-controls.tsx"),
      "utf8",
    );

    assert.match(worker, /requireAppAdmin/);
    assert.match(worker, /processSigningWorkBatch/);
    assert.match(worker, /SIGNING_CRON_WORKER_BATCH_LIMIT/);
    assert.match(worker, /signing_worker_manual_run/);
    assert.match(worker, /recordAuditEvent/);
    assert.doesNotMatch(worker, /signingId:/);
    assert.match(page, /AdminSigningWorkerControls/);
    assert.match(page, /every 2 minutes/);
    assert.match(controls, /Run Signing Worker Now/);
    assert.match(controls, /Pending:/);
  });
});
