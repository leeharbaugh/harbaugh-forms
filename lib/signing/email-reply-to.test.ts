import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { buildCancellationNoticeMessage } from "./cancellation-notices";
import { buildCompletedPackageMessage, sendSigningEmail } from "./delivery";
import { resolveSigningEmailReplyTo, SIGNING_EMAIL_REPLY_TO_ENV } from "./email-reply-to";
import { evaluateEnvPresence } from "./production-readiness";

const FROM = "Harbaugh Forms <signing@send.harbaughrealestate.com>";
const REPLY_TO = "lee@harbaughbrothers.com";

describe("Signing email Reply-To setting", () => {
  it("is optional and accepts exactly one plain address", () => {
    assert.deepEqual(resolveSigningEmailReplyTo({}), { ok: true, replyTo: null });
    assert.deepEqual(resolveSigningEmailReplyTo({ [SIGNING_EMAIL_REPLY_TO_ENV]: "   " }), { ok: true, replyTo: null });
    assert.deepEqual(resolveSigningEmailReplyTo({ [SIGNING_EMAIL_REPLY_TO_ENV]: ` ${REPLY_TO} ` }), { ok: true, replyTo: REPLY_TO });
    for (const bad of ["lee", "lee@harbaughbrothers", "Lee <lee@harbaughbrothers.com>", "a@b.com,c@d.com", "a@b.com c@d.com", "@harbaughbrothers.com"]) {
      assert.deepEqual(resolveSigningEmailReplyTo({ [SIGNING_EMAIL_REPLY_TO_ENV]: bad }), { ok: false }, bad);
    }
  });

  it("is reported by production readiness with its public value", () => {
    const row = (env: NodeJS.ProcessEnv) => evaluateEnvPresence(env, "prod").find((r) => r.name === SIGNING_EMAIL_REPLY_TO_ENV);
    assert.deepEqual(row({ [SIGNING_EMAIL_REPLY_TO_ENV]: REPLY_TO }), { name: SIGNING_EMAIL_REPLY_TO_ENV, present: true, formatOk: true, publicValue: REPLY_TO });
    assert.equal(row({})?.present, false);
    assert.equal(row({ [SIGNING_EMAIL_REPLY_TO_ENV]: "not-an-address" })?.formatOk, false);
  });
});

describe("sendSigningEmail Reply-To", () => {
  const keys = ["RESEND_API_KEY", "SIGNING_EMAIL_FROM", SIGNING_EMAIL_REPLY_TO_ENV, "SIGNING_EMAIL_SANDBOX", "VERCEL_ENV"];
  const saved: Record<string, string | undefined> = {};
  const realFetch = globalThis.fetch;
  let requests: { url: string; body: Record<string, unknown> }[] = [];

  before(() => {
    for (const key of keys) saved[key] = process.env[key];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "email_test" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  });

  beforeEach(() => {
    requests = [];
    process.env.RESEND_API_KEY = "re_test_only";
    process.env.SIGNING_EMAIL_FROM = FROM;
    process.env[SIGNING_EMAIL_REPLY_TO_ENV] = REPLY_TO;
    delete process.env.SIGNING_EMAIL_SANDBOX;
    delete process.env.VERCEL_ENV;
  });

  after(() => {
    globalThis.fetch = realFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  const message = { to: "participant@example.com", subject: "Your documents are ready to sign: Test", textBody: "Hello" };

  it("sends reply_to with the configured address and leaves From unchanged", async () => {
    const result = await sendSigningEmail(message);
    assert.deepEqual(result, { ok: true, providerReference: "email_test" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.resend.com/emails");
    assert.equal(requests[0].body.from, FROM);
    assert.equal(requests[0].body.reply_to, REPLY_TO);
    assert.deepEqual(requests[0].body.to, [message.to]);
  });

  it("omits reply_to when the setting is unset or blank", async () => {
    delete process.env[SIGNING_EMAIL_REPLY_TO_ENV];
    await sendSigningEmail(message);
    process.env[SIGNING_EMAIL_REPLY_TO_ENV] = "  ";
    await sendSigningEmail(message);
    assert.equal(requests.length, 2);
    for (const request of requests) assert.equal("reply_to" in request.body, false);
  });

  it("does not send when the setting is malformed", async () => {
    process.env[SIGNING_EMAIL_REPLY_TO_ENV] = "Lee <lee@harbaughbrothers.com>";
    const result = await sendSigningEmail(message);
    assert.deepEqual(result, { ok: false, failureDetailSafe: "Signing email reply-to address is invalid; message was not sent." });
    assert.equal(requests.length, 0);
  });

  it("applies to completed-package and cancellation messages", async () => {
    await sendSigningEmail(
      buildCompletedPackageMessage({
        recipientName: "Pat",
        recipientEmail: "pat@example.com",
        signingTitle: "Listing",
        packageUrl: "https://forms.example.test/sign/completed/id#secret",
        senderDisplayName: "Lee Harbaugh",
      }),
    );
    await sendSigningEmail(
      buildCancellationNoticeMessage({
        recipientName: "Pat",
        recipientEmail: "pat@example.com",
        signingTitle: "Listing",
        senderDisplayName: "Lee Harbaugh",
        brokerageName: null,
        participantMessage: null,
      }),
    );
    assert.equal(requests.length, 2);
    for (const request of requests) assert.equal(request.body.reply_to, REPLY_TO);
  });

  it("is the only provider call, and every Signing email path uses it", () => {
    const dir = join(process.cwd(), "lib/signing");
    const callers = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => readFileSync(join(dir, f), "utf8").includes("api.resend.com"));
    assert.deepEqual(callers, ["delivery.ts"]);
    const delivery = readFileSync(join(dir, "delivery.ts"), "utf8");
    assert.match(delivery, /await sendSigningEmail\(\s*buildInvitationMessage\(/);
    assert.match(readFileSync(join(dir, "completed-package-delivery.ts"), "utf8"), /await sendSigningEmail\(/);
    assert.match(readFileSync(join(dir, "cancellation-notices.ts"), "utf8"), /sendSigningEmail\(message/);
  });
});
