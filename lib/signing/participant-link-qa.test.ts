import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import { isParticipantLinkQaHelperEnabled } from "./feature-gate";
import { getParticipantSigningLinkForQaWithActor } from "./participant-credential-recovery";
import type { SigningActor } from "./types";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const DEV_URL = "https://ewxsxwzezhkeawnjvigx.supabase.co";
const PROD_URL = "https://eetonalyyyssvkyfdoxh.supabase.co";

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

/** Any database access fails the test: production denial must precede lookups. */
const untouchableAdmin = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error("database accessed");
  },
});

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "manager@example.com",
  displayName: "Manager",
  profile: {},
  memberships: [],
} as unknown as SigningActor;

describe("development participant link QA helper", () => {
  it("is enabled only for a sandboxed, non-production development target", () => {
    assert.equal(
      isParticipantLinkQaHelperEnabled(
        env({ SIGNING_EMAIL_SANDBOX: "true", NEXT_PUBLIC_SUPABASE_URL: DEV_URL }),
      ),
      true,
    );
    assert.equal(
      isParticipantLinkQaHelperEnabled(env({ NEXT_PUBLIC_SUPABASE_URL: DEV_URL })),
      false,
    );
    assert.equal(
      isParticipantLinkQaHelperEnabled(
        env({
          SIGNING_EMAIL_SANDBOX: "true",
          NEXT_PUBLIC_SUPABASE_URL: DEV_URL,
          VERCEL_ENV: "production",
        }),
      ),
      false,
    );
    assert.equal(
      isParticipantLinkQaHelperEnabled(
        env({ SIGNING_EMAIL_SANDBOX: "true", NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
      ),
      false,
    );
  });

  it("denies direct server invocation in production before any lookup", async () => {
    const saved = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      SIGNING_EMAIL_SANDBOX: process.env.SIGNING_EMAIL_SANDBOX,
    };
    process.env.VERCEL_ENV = "production";
    process.env.SIGNING_EMAIL_SANDBOX = "true";
    try {
      await assert.rejects(
        getParticipantSigningLinkForQaWithActor(
          actor,
          {
            signingId: "22222222-2222-4222-8222-222222222222",
            participantId: "33333333-3333-4333-8333-333333333333",
          },
          untouchableAdmin,
        ),
        (error: unknown) => error instanceof SigningError && error.code === "FORBIDDEN",
      );
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("renders the controls only from the server-computed development flag", () => {
    const dashboard = read("lib/signing/dashboard.ts");
    assert.match(dashboard, /participantLinkQaHelper: isParticipantLinkQaHelperEnabled\(\)/);
    assert.doesNotMatch(dashboard, /inviteUrl|buildParticipantInviteUrl|loadRawParticipantCredentialToken/);

    const page = read("components/signings/signing-dashboard-page.tsx");
    assert.match(
      page,
      /\{dashboard\.participantLinkQaHelper &&\s*participant\.hasActiveInvitationLink \? \(/,
    );
    const copy = page.search(/^\s*Copy signing link\s*$/m);
    const gate = page.lastIndexOf("dashboard.participantLinkQaHelper &&", copy);
    assert.ok(copy > 0 && gate > 0 && copy - gate < 800);
    assert.match(page, /Use Copy signing link to test the participant ceremony\./);
  });

  it("keeps the link out of markup and state: fetched on click, copied or opened, then dropped", () => {
    const page = read("components/signings/signing-dashboard-page.tsx");
    assert.doesNotMatch(page, /href=\{[^}]*inviteUrl/);
    assert.doesNotMatch(page, /set\w+\([^)]*inviteUrl/);
    assert.match(page, /window\.open\(inviteUrl, "_blank", "noopener,noreferrer"\)/);
    assert.match(page, /navigator\.clipboard\.writeText\(inviteUrl\)/);
    assert.match(page, /"Signing link copied\."/);
  });

  it("reuses manager authority, the current credential, and the real invitation URL builder", () => {
    const recovery = read("lib/signing/participant-credential-recovery.ts");
    const start = recovery.indexOf("export async function getParticipantSigningLinkForQaWithActor");
    const end = recovery.slice(start).search(/\r?\n\}\r?\n/);
    const body = recovery.slice(start, start + end);
    const gate = body.indexOf("isParticipantLinkQaHelperEnabled()");
    const authority = body.indexOf("requireInProgressManageableParticipant(");
    assert.ok(gate > 0 && authority > gate, "production gate runs before authority/lookup");
    assert.match(body, /loadCurrentCredentialId\(/);
    assert.match(body, /loadRawParticipantCredentialToken\(/);
    assert.match(body, /buildParticipantInviteUrl\(credentialId, rawToken\)/);
    assert.doesNotMatch(body, /console\.|appendSigningEvent|\.insert\(|\.update\(/);

    const actions = read("lib/signing/stage4-actions.ts");
    assert.match(
      actions,
      /getParticipantSigningLinkForQaAction[\s\S]*?withAuthorizedAdmin\(\(actor, admin\) =>\s*getParticipantSigningLinkForQaWithActor\(actor, input, admin\)/,
    );
  });
});
