import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTH_UPDATE_PASSWORD_PATH,
  RECOMMENDED_INVITE_EMAIL_LINK,
  RECOMMENDED_RECOVERY_EMAIL_LINK,
  buildAuthErrorPath,
  classifyVerifyOtpError,
  defaultNextForOtpType,
  invitationRedirectTo,
  isSupportedEmailOtpType,
  parseEmailOtpType,
  processAuthConfirm,
  safeAuthConfirmLogMessage,
  sanitizeAuthNextPath,
  userFacingAuthConfirmMessage,
} from "./email-otp.ts";
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
} from "./password-policy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

function readRepo(...parts: string[]): string {
  return readFileSync(join(root, ...parts), "utf8");
}

type MockAuth = {
  verifyOtpCalls: Array<Record<string, unknown>>;
  exchangeCalls: string[];
  verifyError: { message: string } | null;
  exchangeError: { message: string } | null;
  user: { id: string } | null;
  profile: { id: string } | null;
  membershipCount: number;
  membershipError: { message: string } | null;
  profileError: { message: string } | null;
};

function createMockSupabase(state: MockAuth): SupabaseClient {
  const client = {
    auth: {
      verifyOtp: async (args: Record<string, unknown>) => {
        state.verifyOtpCalls.push(args);
        return { data: {}, error: state.verifyError };
      },
      exchangeCodeForSession: async (code: string) => {
        state.exchangeCalls.push(code);
        return { data: {}, error: state.exchangeError };
      },
      getUser: async () => ({
        data: { user: state.user },
        error: state.user ? null : { message: "no user" },
      }),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.profile,
                error: state.profileError,
              }),
            }),
          }),
        };
      }
      if (table === "organization_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                count: state.membershipCount,
                error: state.membershipError,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client as unknown as SupabaseClient;
}

describe("email OTP type parsing", () => {
  it("accepts supported Supabase email OTP types", () => {
    for (const type of [
      "signup",
      "invite",
      "magiclink",
      "recovery",
      "email_change",
      "email",
    ]) {
      assert.equal(isSupportedEmailOtpType(type), true);
      assert.equal(parseEmailOtpType(type), type);
    }
  });

  it("rejects unsupported or missing types", () => {
    assert.equal(parseEmailOtpType(null), null);
    assert.equal(parseEmailOtpType(""), null);
    assert.equal(parseEmailOtpType("invitee"), null);
    assert.equal(parseEmailOtpType("sms"), null);
  });
});

describe("auth next path sanitization", () => {
  it("allows relative app paths and rejects open redirects", () => {
    assert.equal(
      sanitizeAuthNextPath("/auth/update-password"),
      "/auth/update-password",
    );
    assert.equal(sanitizeAuthNextPath("//evil.example"), "/");
    assert.equal(sanitizeAuthNextPath("https://evil.example"), "/");
    assert.equal(sanitizeAuthNextPath(null), "/");
  });

  it("defaults invite and recovery to update-password", () => {
    assert.equal(defaultNextForOtpType("invite", null), AUTH_UPDATE_PASSWORD_PATH);
    assert.equal(
      defaultNextForOtpType("recovery", null),
      AUTH_UPDATE_PASSWORD_PATH,
    );
    assert.equal(defaultNextForOtpType("email", null), "/");
    assert.equal(
      defaultNextForOtpType("invite", "/packets"),
      "/packets",
    );
  });
});

describe("invitation redirect helpers", () => {
  it("builds confirm URL with next=update-password for PKCE compatibility", () => {
    assert.equal(
      invitationRedirectTo("https://forms.harbaughrealestate.com"),
      "https://forms.harbaughrealestate.com/auth/confirm?next=%2Fauth%2Fupdate-password",
    );
  });

  it("documents the production token-hash invite and recovery templates", () => {
    assert.match(RECOMMENDED_INVITE_EMAIL_LINK, /token_hash=\{\{ \.TokenHash \}\}/);
    assert.match(RECOMMENDED_INVITE_EMAIL_LINK, /type=invite/);
    assert.match(RECOMMENDED_INVITE_EMAIL_LINK, /next=\/auth\/update-password/);
    assert.match(RECOMMENDED_RECOVERY_EMAIL_LINK, /type=recovery/);
  });
});

describe("auth confirm error messaging", () => {
  it("classifies expired and already-used OTP failures", () => {
    assert.equal(classifyVerifyOtpError("Token has expired"), "expired_or_invalid");
    assert.equal(classifyVerifyOtpError("otp_expired"), "expired_or_invalid");
    assert.equal(classifyVerifyOtpError("Email link is invalid or has been used"), "already_used");
    assert.equal(classifyVerifyOtpError("boom"), "otp_verification_failed");
  });

  it("never puts secrets into log messages", () => {
    const message = safeAuthConfirmLogMessage("token_hash", "missing_type");
    assert.equal(message, "auth_confirm:token_hash:missing_type");
    assert.doesNotMatch(message, /token_hash=[A-Za-z0-9]/);
    assert.doesNotMatch(message, /password/i);
  });

  it("uses a shared user-facing invitation failure message", () => {
    const message = userFacingAuthConfirmMessage("missing_token_hash_and_type");
    assert.match(message, /invalid or has expired/i);
    assert.match(message, /administrator/i);
    assert.doesNotMatch(message, /token hash/i);
  });

  it("builds error redirects with stable codes", () => {
    assert.equal(
      buildAuthErrorPath("unsupported_type"),
      "/auth/error?error=unsupported_type",
    );
  });
});

describe("password policy", () => {
  it("requires confirmation, length, and letter+number", () => {
    assert.equal(
      validateNewPassword({ password: "", confirmPassword: "" }).ok,
      false,
    );
    assert.equal(
      validateNewPassword({
        password: "short1",
        confirmPassword: "short1",
      }).ok,
      false,
    );
    assert.equal(
      validateNewPassword({
        password: "longenough",
        confirmPassword: "longenough",
      }).ok,
      false,
    );
    assert.equal(
      validateNewPassword({
        password: "Password1",
        confirmPassword: "Password2",
      }).ok,
      false,
    );
    assert.equal(
      validateNewPassword({
        password: "Password1",
        confirmPassword: "Password1",
      }).ok,
      true,
    );
    assert.ok(MIN_PASSWORD_LENGTH >= 8);
  });
});

describe("processAuthConfirm token-hash invite flow", () => {
  it("verifies invite token_hash, persists session path, redirects to password page", async () => {
    const state: MockAuth = {
      verifyOtpCalls: [],
      exchangeCalls: [],
      verifyError: null,
      exchangeError: null,
      user: { id: "user-1" },
      profile: { id: "user-1" },
      membershipCount: 1,
      membershipError: null,
      profileError: null,
    };
    const logs: string[] = [];
    const result = await processAuthConfirm({      supabase: createMockSupabase(state),
      log: (message) => logs.push(message),
      params: {
        tokenHash: "secret-token-hash-value",
        type: "invite",
        code: null,
        next: null,
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.flow, "token_hash");
    assert.equal(result.redirectTo, AUTH_UPDATE_PASSWORD_PATH);
    assert.deepEqual(state.verifyOtpCalls, [
      { type: "invite", token_hash: "secret-token-hash-value" },
    ]);
    assert.deepEqual(state.exchangeCalls, []);
    assert.equal(logs.length, 0);
  });

  it("rejects missing token_hash", async () => {
    const state: MockAuth = {
      verifyOtpCalls: [],
      exchangeCalls: [],
      verifyError: null,
      exchangeError: null,
      user: null,
      profile: null,
      membershipCount: 0,
      membershipError: null,
      profileError: null,
    };
    const logs: string[] = [];
    const result = await processAuthConfirm({      supabase: createMockSupabase(state),
      log: (message) => logs.push(message),
      params: {
        tokenHash: null,
        type: "invite",
        code: null,
        next: null,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "missing_token_hash");
    assert.equal(state.verifyOtpCalls.length, 0);
    assert.match(logs.join("\n"), /missing_token_hash/);
    assert.doesNotMatch(logs.join("\n"), /secret/);
  });

  it("rejects missing type", async () => {
    const result = await processAuthConfirm({      supabase: createMockSupabase({
        verifyOtpCalls: [],
        exchangeCalls: [],
        verifyError: null,
        exchangeError: null,
        user: null,
        profile: null,
        membershipCount: 0,
        membershipError: null,
        profileError: null,
      }),
      log: () => {},
      params: {
        tokenHash: "abc",
        type: null,
        code: null,
        next: null,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "missing_type");
  });

  it("rejects unsupported type without calling verifyOtp", async () => {
    const state: MockAuth = {
      verifyOtpCalls: [],
      exchangeCalls: [],
      verifyError: null,
      exchangeError: null,
      user: null,
      profile: null,
      membershipCount: 0,
      membershipError: null,
      profileError: null,
    };
    const result = await processAuthConfirm({      supabase: createMockSupabase(state),
      log: () => {},
      params: {
        tokenHash: "abc",
        type: "not-a-real-type",
        code: null,
        next: null,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "unsupported_type");
    assert.equal(state.verifyOtpCalls.length, 0);
  });

  it("maps expired verifyOtp failures", async () => {
    const result = await processAuthConfirm({      supabase: createMockSupabase({
        verifyOtpCalls: [],
        exchangeCalls: [],
        verifyError: { message: "Token has expired or is invalid" },
        exchangeError: null,
        user: null,
        profile: null,
        membershipCount: 0,
        membershipError: null,
        profileError: null,
      }),
      log: () => {},
      params: {
        tokenHash: "abc",
        type: "invite",
        code: null,
        next: null,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "expired_or_invalid");
  });

  it("fails closed when session is not established after verifyOtp", async () => {
    const result = await processAuthConfirm({      supabase: createMockSupabase({
        verifyOtpCalls: [],
        exchangeCalls: [],
        verifyError: null,
        exchangeError: null,
        user: null,
        profile: null,
        membershipCount: 0,
        membershipError: null,
        profileError: null,
      }),
      log: () => {},
      params: {
        tokenHash: "abc",
        type: "invite",
        code: null,
        next: null,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "session_failed");
  });

  it("preserves invited user identity and rejects missing profile", async () => {
    const state: MockAuth = {
      verifyOtpCalls: [],
      exchangeCalls: [],
      verifyError: null,
      exchangeError: null,
      user: { id: "existing-invited-uuid" },
      profile: null,
      membershipCount: 0,
      membershipError: null,
      profileError: null,
    };
    const result = await processAuthConfirm({      supabase: createMockSupabase(state),
      log: () => {},
      params: {
        tokenHash: "abc",
        type: "invite",
        code: null,
        next: null,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "missing_profile");
    assert.equal(state.user?.id, "existing-invited-uuid");
  });
});

describe("processAuthConfirm PKCE path", () => {
  it("exchanges code for session without verifyOtp", async () => {
    const state: MockAuth = {
      verifyOtpCalls: [],
      exchangeCalls: [],
      verifyError: null,
      exchangeError: null,
      user: { id: "user-pkce" },
      profile: { id: "user-pkce" },
      membershipCount: 1,
      membershipError: null,
      profileError: null,
    };
    const result = await processAuthConfirm({      supabase: createMockSupabase(state),
      log: () => {},
      params: {
        tokenHash: null,
        type: null,
        code: "auth-code-value",
        next: "/auth/update-password",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.flow, "pkce");
    assert.equal(result.redirectTo, AUTH_UPDATE_PASSWORD_PATH);
    assert.deepEqual(state.exchangeCalls, ["auth-code-value"]);
    assert.equal(state.verifyOtpCalls.length, 0);
  });

  it("reports PKCE exchange failure", async () => {
    const result = await processAuthConfirm({      supabase: createMockSupabase({
        verifyOtpCalls: [],
        exchangeCalls: [],
        verifyError: null,
        exchangeError: { message: "invalid code" },
        user: null,
        profile: null,
        membershipCount: 0,
        membershipError: null,
        profileError: null,
      }),
      log: () => {},
      params: {
        tokenHash: null,
        type: null,
        code: "bad",
        next: null,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "pkce_exchange_failed");
  });
});

describe("auth confirmation source contracts", () => {
  it("confirm route delegates to processAuthConfirm", () => {
    const source = readRepo("app/auth/confirm/route.ts");
    assert.match(source, /processAuthConfirm/);
    assert.match(source, /token_hash/);
    assert.doesNotMatch(source, /No token hash or type/);
    assert.doesNotMatch(source, /console\.(log|error|info|debug)\([^)]*token/i);
  });

  it("does not log passwords in update password action or form", () => {
    const action = readRepo("app/auth/actions.ts");
    const form = readRepo("components/update-password-form.tsx");
    assert.match(action, /updatePasswordAction/);
    assert.match(action, /validateNewPassword/);
    assert.match(action, /updateUser\(\{\s*password\s*\}\)/);
    assert.match(action, /activate_invited_profile/);
    assert.doesNotMatch(action, /console\.(log|error|info|debug)\([^)]*password/i);
    assert.doesNotMatch(form, /console\.(log|error|info|debug)\([^)]*password/i);
    assert.match(form, /confirmPassword/);
  });

  it("preserves normal password login", () => {
    const action = readRepo("app/auth/actions.ts");
    assert.match(action, /signInWithPassword/);
    assert.doesNotMatch(action, /createUser\(/);
  });

  it("invite provisioning upserts existing auth UUID and uses invitationRedirectTo", () => {
    const source = readRepo("lib/admin/invite-user.ts");
    assert.match(source, /inviteUserByEmail/);
    assert.match(source, /invitationRedirectTo/);
    assert.match(source, /profiles"\)\.upsert/);
    assert.match(source, /onConflict:\s*"id"/);
    assert.doesNotMatch(source, /auth\.admin\.createUser/);
  });

  it("forgot-password recovery redirect goes through /auth/confirm", () => {
    const source = readRepo("components/forgot-password-form.tsx");
    assert.match(source, /\/auth\/confirm\?next=/);
    assert.match(source, /update-password/);
  });

  it("update-password requires an authenticated session", () => {
    const source = readRepo("app/auth/update-password/page.tsx");
    assert.match(source, /getUser/);
    assert.match(source, /Session required/);
    assert.match(source, /UpdatePasswordForm/);
  });

  it("error page maps codes to friendly copy without raw token messages", () => {
    const source = readRepo("app/auth/error/page.tsx");
    assert.match(source, /userFacingAuthConfirmMessage/);
    assert.doesNotMatch(source, /Code error:/);
    assert.doesNotMatch(source, /No token hash or type/);
  });
});
