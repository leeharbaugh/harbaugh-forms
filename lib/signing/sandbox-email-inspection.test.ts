import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { buildCancellationNoticeMessage } from "./cancellation-notices";
import { sendSigningEmail } from "./delivery";
import {
  isSandboxEmailInspectionEnabled,
  SANDBOX_EMAIL_INSPECTION_DIR,
  writeSandboxEmailInspection,
} from "./sandbox-email-inspection";

const DEV_ENV = {
  NODE_ENV: "development",
  SIGNING_EMAIL_SANDBOX: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://ewxsxwzezhkeawnjvigx.supabase.co",
} as unknown as NodeJS.ProcessEnv;

const INSPECTION = {
  purpose: "CANCELLATION" as const,
  signingId: "11111111-1111-4111-8111-111111111111",
  deliveryInstructionId: "22222222-2222-4222-8222-222222222222",
  attemptNumber: 1,
  recipientName: "Pat Buyer",
};

const INTERNAL_REASON = "Wrong buyer entity (internal)";
const message = buildCancellationNoticeMessage({
  recipientName: "Pat Buyer",
  recipientEmail: "pat@example.com",
  signingTitle: "123 Main St",
  senderDisplayName: "Alex Agent",
  brokerageName: "Harbaugh Realty",
  participantMessage: "",
});

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "sandbox-email-"));
  dirs.push(dir);
  return dir;
}
function written(baseDir: string) {
  const dir = path.join(baseDir, SANDBOX_EMAIL_INSPECTION_DIR);
  try {
    return readdirSync(dir).map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8") }));
  } catch {
    return [];
  }
}
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("sandbox email inspection gate", () => {
  it("is enabled only for the development sandbox", () => {
    assert.equal(isSandboxEmailInspectionEnabled(DEV_ENV), true);
    assert.equal(isSandboxEmailInspectionEnabled({ ...DEV_ENV, SIGNING_EMAIL_SANDBOX: undefined }), false);
    assert.equal(isSandboxEmailInspectionEnabled({ ...DEV_ENV, SIGNING_EMAIL_SANDBOX: "false" }), false);
    assert.equal(isSandboxEmailInspectionEnabled({ ...DEV_ENV, VERCEL_ENV: "production" }), false);
    assert.equal(isSandboxEmailInspectionEnabled({ ...DEV_ENV, NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
    assert.equal(
      isSandboxEmailInspectionEnabled({ ...DEV_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://eetonalyyyssvkyfdoxh.supabase.co" }),
      false,
    );
  });

  it("writes nothing when disabled", async () => {
    const baseDir = tempDir();
    for (const env of [
      { ...DEV_ENV, SIGNING_EMAIL_SANDBOX: undefined },
      { ...DEV_ENV, VERCEL_ENV: "production" },
      { ...DEV_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://eetonalyyyssvkyfdoxh.supabase.co" },
    ]) {
      assert.equal(await writeSandboxEmailInspection(message, INSPECTION, { env, baseDir }), null);
    }
    assert.equal(written(baseDir).length, 0);
  });
});

describe("sandbox email inspection file", () => {
  it("records the exact subject and body with a collision-safe name", async () => {
    const baseDir = tempDir();
    const now = new Date("2026-10-14T20:30:00.000Z");
    const filePath = await writeSandboxEmailInspection(message, INSPECTION, { env: DEV_ENV, baseDir, now });
    assert.ok(filePath);
    const [file] = written(baseDir);
    assert.equal(
      file.name,
      "2026-10-14T20-30-00-000Z_cancellation_pat_22222222-2222-4222-8222-222222222222_attempt-1.txt",
    );
    assert.ok(file.text.includes(`Subject: ${message.subject}\n\n${message.textBody}\n`));
    assert.match(file.text, /This email was NOT sent\./);
    assert.match(file.text, /To: Pat Buyer <pat@example\.com>/);
  });

  it("a blank participant message leaves no message section; no reason, link or token", async () => {
    const baseDir = tempDir();
    await writeSandboxEmailInspection(message, INSPECTION, { env: DEV_ENV, baseDir });
    const [file] = written(baseDir);
    assert.doesNotMatch(file.text, /Message from/);
    assert.ok(!file.text.includes(INTERNAL_REASON));
    assert.doesNotMatch(file.text, /https?:\/\/|\/sign\/|#[A-Za-z0-9_-]{20,}/);
  });

  it("refuses a body that carries a link or token", async () => {
    const baseDir = tempDir();
    const withLink = { ...message, textBody: `${message.textBody}\nhttp://localhost:3000/sign/abc#${"x".repeat(43)}` };
    assert.equal(await writeSandboxEmailInspection(withLink, INSPECTION, { env: DEV_ENV, baseDir }), null);
    assert.equal(written(baseDir).length, 0);
  });

  it("never overwrites: a second attempt is a separate, numbered file", async () => {
    const baseDir = tempDir();
    const now = new Date("2026-10-14T20:30:00.000Z");
    await writeSandboxEmailInspection(message, INSPECTION, { env: DEV_ENV, baseDir, now });
    await writeSandboxEmailInspection(message, { ...INSPECTION, attemptNumber: 2 }, { env: DEV_ENV, baseDir, now });
    assert.equal(await writeSandboxEmailInspection(message, INSPECTION, { env: DEV_ENV, baseDir, now }), null);
    assert.deepEqual(written(baseDir).map((file) => file.name.match(/attempt-\d+/)?.[0]).sort(), ["attempt-1", "attempt-2"]);
  });
});

describe("sandbox send path", () => {
  it("one opted-in sandbox send writes one file with the message it was given; results unchanged", async () => {
    const baseDir = tempDir();
    const cwd = process.cwd();
    const saved = { ...process.env };
    Object.assign(process.env, DEV_ENV);
    delete process.env.VERCEL_ENV;
    process.chdir(baseDir);
    try {
      const plain = await sendSigningEmail(message);
      assert.equal(written(baseDir).length, 0);
      const inspected = await sendSigningEmail(message, { sandboxInspection: INSPECTION });
      assert.deepEqual(inspected, plain);
      assert.deepEqual(inspected, { ok: true, providerReference: "sandbox:pat@example.com" });
      const files = written(baseDir);
      assert.equal(files.length, 1);
      assert.ok(files[0].text.endsWith(`Subject: ${message.subject}\n\n${message.textBody}\n`));
    } finally {
      process.chdir(cwd);
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });

  it("only the cancellation worker opts in; invitation and package emails never do", () => {
    const delivery = readFileSync(path.join(process.cwd(), "lib/signing/delivery.ts"), "utf8");
    const notices = readFileSync(path.join(process.cwd(), "lib/signing/cancellation-notices.ts"), "utf8");
    const others = ["lib/signing/delivery.ts", "lib/signing/completed-package-delivery.ts"]
      .map((file) => { try { return readFileSync(path.join(process.cwd(), file), "utf8"); } catch { return ""; } })
      .join("\n");
    assert.match(notices, /sandboxInspection: \{\s*purpose: "CANCELLATION"/);
    assert.equal((others.match(/sandboxInspection: \{/g) ?? []).length, 0);
    assert.match(delivery, /if \(options\.sandboxInspection\)/);
  });
});
