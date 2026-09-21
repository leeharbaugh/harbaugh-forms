import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SIGNING_WORKER_KICK_BATCH_LIMIT } from "./signing-worker-kick";

describe("signing worker kick", () => {
  it("schedules the shared batch processor after enqueue points", () => {
    const kick = readFileSync(
      join(process.cwd(), "lib/signing/signing-worker-kick.ts"),
      "utf8",
    );
    const finish = readFileSync(
      join(process.cwd(), "lib/signing/ceremony-actions.ts"),
      "utf8",
    );
    const retry = readFileSync(
      join(process.cwd(), "lib/signing/finalization-retry.ts"),
      "utf8",
    );
    const resend = readFileSync(
      join(process.cwd(), "lib/signing/completed-package-delivery.ts"),
      "utf8",
    );
    const copy = readFileSync(
      join(process.cwd(), "lib/signing/copy-recipients.ts"),
      "utf8",
    );

    assert.match(kick, /from "next\/server"/);
    assert.match(kick, /processSigningWorkBatch/);
    assert.match(kick, /secretOk:\s*true/);
    assert.doesNotMatch(kick, /rawToken|CRON_SECRET|Bearer /);
    assert.equal(SIGNING_WORKER_KICK_BATCH_LIMIT, 10);

    assert.match(finish, /kickSigningWorkProcessing/);
    assert.match(finish, /finalizationEnqueued/);
    assert.match(retry, /kickSigningWorkProcessing/);
    assert.match(resend, /kickSigningWorkProcessing/);
    assert.match(copy, /kickSigningWorkProcessing/);
  });

  it("keeps Cron as recovery sweep rather than sole processor", () => {
    const kick = readFileSync(
      join(process.cwd(), "lib/signing/signing-worker-kick.ts"),
      "utf8",
    );
    assert.match(kick, /Cron is a recovery\/sweep/);
    assert.match(kick, /after\(\)/);
  });
});
