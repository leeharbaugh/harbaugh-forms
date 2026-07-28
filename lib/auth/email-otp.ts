/**
 * Shared helpers for Supabase email OTP confirmation and safe auth redirects.
 * Invitation emails use token_hash + verifyOtp (not ConfirmationURL alone).
 * PKCE `code` exchange is supported separately when present without token_hash.
 */

import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

export const SUPPORTED_EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export type SupportedEmailOtpType = (typeof SUPPORTED_EMAIL_OTP_TYPES)[number];

export type AuthConfirmErrorCode =
  | "missing_token_hash"
  | "missing_type"
  | "missing_token_hash_and_type"
  | "unsupported_type"
  | "expired_or_invalid"
  | "already_used"
  | "otp_verification_failed"
  | "pkce_exchange_failed"
  | "session_failed"
  | "missing_profile"
  | "missing_organization_membership";

export const AUTH_UPDATE_PASSWORD_PATH = "/auth/update-password";
export const AUTH_LOGIN_PATH = "/auth/login";
export const AUTH_ERROR_PATH = "/auth/error";

const INVITE_DEFAULT_NEXT = AUTH_UPDATE_PASSWORD_PATH;
const RECOVERY_DEFAULT_NEXT = AUTH_UPDATE_PASSWORD_PATH;

export function isSupportedEmailOtpType(
  value: string | null | undefined,
): value is SupportedEmailOtpType {
  return (
    typeof value === "string" &&
    (SUPPORTED_EMAIL_OTP_TYPES as readonly string[]).includes(value)
  );
}

export function parseEmailOtpType(
  value: string | null | undefined,
): SupportedEmailOtpType | null {
  if (!value) {
    return null;
  }
  return isSupportedEmailOtpType(value) ? value : null;
}

/**
 * Only allow same-origin relative paths. Reject protocol-relative and absolute URLs.
 */
export function sanitizeAuthNextPath(
  next: string | null | undefined,
  fallback = "/",
): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  if (trimmed.includes("://") || trimmed.includes("\\")) {
    return fallback;
  }
  return trimmed;
}

export function defaultNextForOtpType(
  type: SupportedEmailOtpType | null,
  explicitNext: string | null | undefined,
): string {
  if (explicitNext) {
    return sanitizeAuthNextPath(explicitNext);
  }
  if (type === "invite") {
    return INVITE_DEFAULT_NEXT;
  }
  if (type === "recovery") {
    return RECOVERY_DEFAULT_NEXT;
  }
  return "/";
}

/**
 * Destination used as inviteUserByEmail redirectTo for ConfirmationURL / PKCE
 * compatibility. Token-hash email templates should embed next themselves.
 */
export function invitationRedirectTo(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/confirm?next=${encodeURIComponent(AUTH_UPDATE_PASSWORD_PATH)}`;
}

/**
 * Recommended production invite email link (Supabase Dashboard template).
 * Site URL must be https://forms.harbaughrealestate.com
 */
export const RECOMMENDED_INVITE_EMAIL_LINK =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/update-password";

export const RECOMMENDED_RECOVERY_EMAIL_LINK =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password";

export function userFacingAuthConfirmMessage(
  code: AuthConfirmErrorCode,
): string {
  switch (code) {
    case "missing_token_hash":
    case "missing_type":
    case "missing_token_hash_and_type":
    case "unsupported_type":
    case "expired_or_invalid":
    case "already_used":
    case "otp_verification_failed":
    case "pkce_exchange_failed":
    case "session_failed":
      return "This invitation or confirmation link is invalid or has expired. Ask the Harbaugh Forms administrator to send a new invitation or password-reset email.";
    case "missing_profile":
      return "Your invitation was verified, but your profile is not ready yet. Ask the Harbaugh Forms administrator to finish provisioning your account.";
    case "missing_organization_membership":
      return "Your invitation was verified, but your organization membership is missing. Ask the Harbaugh Forms administrator to finish provisioning your account.";
    default:
      return "This invitation or confirmation link is invalid or has expired. Ask the Harbaugh Forms administrator for help.";
  }
}

export function classifyVerifyOtpError(
  message: string | null | undefined,
): AuthConfirmErrorCode {
  const text = (message ?? "").toLowerCase();
  if (
    text.includes("expired") ||
    text.includes("otp_expired") ||
    text.includes("token has expired")
  ) {
    return "expired_or_invalid";
  }
  if (
    text.includes("already") ||
    text.includes("used") ||
    text.includes("otp_disabled")
  ) {
    return "already_used";
  }
  if (
    text.includes("invalid") ||
    text.includes("otp_expired") ||
    text.includes("token")
  ) {
    return "expired_or_invalid";
  }
  return "otp_verification_failed";
}

export function buildAuthErrorPath(code: AuthConfirmErrorCode): string {
  return `${AUTH_ERROR_PATH}?error=${encodeURIComponent(code)}`;
}

/** Never log secrets; callers must only pass AuthConfirmErrorCode / safe labels. */
export function safeAuthConfirmLogMessage(
  phase: string,
  code: AuthConfirmErrorCode,
): string {
  return `auth_confirm:${phase}:${code}`;
}

export type AuthConfirmParams = {
  tokenHash: string | null;
  type: string | null;
  code: string | null;
  next: string | null;
};

export type AuthConfirmResult =
  | { ok: true; redirectTo: string; flow: "token_hash" | "pkce" }
  | { ok: false; redirectTo: string; code: AuthConfirmErrorCode };

type ConfirmLogger = (message: string) => void;

const defaultLogger: ConfirmLogger = (message) => {
  console.error(message);
};

async function assertSessionEstablished(
  supabase: SupabaseClient,
): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return !error && Boolean(user);
}

async function checkProvisionedRecords(
  supabase: SupabaseClient,
  userId: string,
): Promise<AuthConfirmErrorCode | null> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return "missing_profile";
  }

  const { count, error: membershipError } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "ACTIVE");

  if (membershipError) {
    return "missing_organization_membership";
  }

  if ((count ?? 0) < 1) {
    return "missing_organization_membership";
  }

  return null;
}

async function finishSuccessfulConfirm(options: {
  supabase: SupabaseClient;
  nextPath: string;
  flow: "token_hash" | "pkce";
  otpType: SupportedEmailOtpType | null;
  log: ConfirmLogger;
}): Promise<AuthConfirmResult> {
  const sessionOk = await assertSessionEstablished(options.supabase);
  if (!sessionOk) {
    options.log(safeAuthConfirmLogMessage(options.flow, "session_failed"));
    return {
      ok: false,
      code: "session_failed",
      redirectTo: buildAuthErrorPath("session_failed"),
    };
  }

  const {
    data: { user },
  } = await options.supabase.auth.getUser();

  // Invitees should already have profile + membership from admin provisioning.
  if (options.otpType === "invite" && user) {
    const provisionError = await checkProvisionedRecords(
      options.supabase,
      user.id,
    );
    if (provisionError) {
      options.log(safeAuthConfirmLogMessage(options.flow, provisionError));
      return {
        ok: false,
        code: provisionError,
        redirectTo: buildAuthErrorPath(provisionError),
      };
    }
  }

  return {
    ok: true,
    flow: options.flow,
    redirectTo: options.nextPath,
  };
}

/**
 * Processes /auth/confirm query params.
 * Prefer token_hash + type (verifyOtp). Also supports PKCE `code` exchange
 * when email templates or redirectTo land with an authorization code.
 */
export async function processAuthConfirm(options: {
  params: AuthConfirmParams;
  supabase: SupabaseClient;
  log?: ConfirmLogger;
}): Promise<AuthConfirmResult> {
  const log = options.log ?? defaultLogger;
  const { tokenHash, type, code, next } = options.params;

  // PKCE authorization-code path (must not be mixed into verifyOtp).
  if (code && !tokenHash) {
    const nextPath = defaultNextForOtpType(null, next);
    const { error } = await options.supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log(safeAuthConfirmLogMessage("pkce", "pkce_exchange_failed"));
      return {
        ok: false,
        code: "pkce_exchange_failed",
        redirectTo: buildAuthErrorPath("pkce_exchange_failed"),
      };
    }
    return finishSuccessfulConfirm({
      supabase: options.supabase,
      nextPath,
      flow: "pkce",
      otpType: null,
      log,
    });
  }

  const missingHash = !tokenHash;
  const missingType = !type;

  if (missingHash && missingType) {
    log(
      safeAuthConfirmLogMessage("token_hash", "missing_token_hash_and_type"),
    );
    return {
      ok: false,
      code: "missing_token_hash_and_type",
      redirectTo: buildAuthErrorPath("missing_token_hash_and_type"),
    };
  }

  if (missingHash) {
    log(safeAuthConfirmLogMessage("token_hash", "missing_token_hash"));
    return {
      ok: false,
      code: "missing_token_hash",
      redirectTo: buildAuthErrorPath("missing_token_hash"),
    };
  }

  if (missingType) {
    log(safeAuthConfirmLogMessage("token_hash", "missing_type"));
    return {
      ok: false,
      code: "missing_type",
      redirectTo: buildAuthErrorPath("missing_type"),
    };
  }

  const otpType = parseEmailOtpType(type);
  if (!otpType) {
    log(safeAuthConfirmLogMessage("token_hash", "unsupported_type"));
    return {
      ok: false,
      code: "unsupported_type",
      redirectTo: buildAuthErrorPath("unsupported_type"),
    };
  }

  const nextPath = defaultNextForOtpType(otpType, next);
  const { error } = await options.supabase.auth.verifyOtp({
    type: otpType as EmailOtpType,
    token_hash: tokenHash!,
  });

  if (error) {
    const codeClassified = classifyVerifyOtpError(error.message);
    log(safeAuthConfirmLogMessage("token_hash", codeClassified));
    return {
      ok: false,
      code: codeClassified,
      redirectTo: buildAuthErrorPath(codeClassified),
    };
  }

  return finishSuccessfulConfirm({
    supabase: options.supabase,
    nextPath,
    flow: "token_hash",
    otpType,
    log,
  });
}
