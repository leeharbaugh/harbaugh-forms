import {
  LEE_AUTH_EMAIL,
  LEE_AUTH_UUID,
  LEE_IDENTITY_ID,
  YAHOO_AUTH_UUID,
} from "./constants.ts";
import { SelectiveMigrationSafetyError, redactSecrets } from "./safety.ts";

export type AuthUserExport = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  encrypted_password_present: boolean;
  /** Never serialize the hash into logs or committed artifacts. */
  encrypted_password?: string;
  raw_app_meta_data?: Record<string, unknown>;
  raw_user_meta_data?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  aud?: string;
  role?: string;
};

export type AuthIdentityExport = {
  id: string;
  user_id: string;
  provider: string;
  identity_data?: Record<string, unknown>;
};

export type AuthMigrationPlan = {
  mode: "selective_lee_only";
  expectedUserId: typeof LEE_AUTH_UUID;
  expectedIdentityId: typeof LEE_IDENTITY_ID;
  expectedEmail: typeof LEE_AUTH_EMAIL;
  forbiddenUserIds: string[];
  dryRun: boolean;
};

export function buildAuthMigrationPlan(dryRun: boolean): AuthMigrationPlan {
  return {
    mode: "selective_lee_only",
    expectedUserId: LEE_AUTH_UUID,
    expectedIdentityId: LEE_IDENTITY_ID,
    expectedEmail: LEE_AUTH_EMAIL,
    forbiddenUserIds: [YAHOO_AUTH_UUID],
    dryRun,
  };
}

/**
 * Validate exported Auth rows before any write.
 * Ensures UUID/identity preservation and Lee-only selection.
 */
export function validateAuthExportForMigration(options: {
  users: AuthUserExport[];
  identities: AuthIdentityExport[];
}): void {
  if (options.users.length !== 1) {
    throw new SelectiveMigrationSafetyError(
      `Auth export must contain exactly one user (got ${options.users.length}).`,
    );
  }
  const user = options.users[0];
  if (user.id !== LEE_AUTH_UUID) {
    throw new SelectiveMigrationSafetyError(
      "Auth user UUID mismatch — refusing to create a replacement Lee UUID.",
    );
  }
  if (user.email?.toLowerCase() !== LEE_AUTH_EMAIL) {
    throw new SelectiveMigrationSafetyError("Auth user email mismatch.");
  }
  if (!user.encrypted_password_present && !user.encrypted_password) {
    throw new SelectiveMigrationSafetyError(
      "Lee encrypted password hash is required for UUID-preserving Auth migration.",
    );
  }

  if (options.identities.length !== 1) {
    throw new SelectiveMigrationSafetyError(
      `Auth export must contain exactly one identity (got ${options.identities.length}).`,
    );
  }
  const identity = options.identities[0];
  if (identity.id !== LEE_IDENTITY_ID) {
    throw new SelectiveMigrationSafetyError("Auth identity ID mismatch.");
  }
  if (identity.user_id !== LEE_AUTH_UUID) {
    throw new SelectiveMigrationSafetyError("Auth identity user_id mismatch.");
  }
}

/**
 * Validate target Auth population after import.
 */
export function validateTargetAuthPopulation(options: {
  userIds: string[];
  emails: string[];
  identityIds: string[];
}): { ok: true } {
  if (options.userIds.length !== 1 || options.userIds[0] !== LEE_AUTH_UUID) {
    throw new SelectiveMigrationSafetyError(
      "Target Auth must contain exactly Lee UUID; no replacement UUID allowed.",
    );
  }
  if (options.emails.length !== 1 || options.emails[0]?.toLowerCase() !== LEE_AUTH_EMAIL) {
    throw new SelectiveMigrationSafetyError("Target Auth email must be lee@leeharbaugh.com only.");
  }
  if (
    options.identityIds.length !== 1 ||
    options.identityIds[0] !== LEE_IDENTITY_ID
  ) {
    throw new SelectiveMigrationSafetyError("Target Auth identity ID must be preserved.");
  }
  if (options.userIds.includes(YAHOO_AUTH_UUID)) {
    throw new SelectiveMigrationSafetyError("Yahoo Auth user must not exist in production.");
  }
  return { ok: true };
}

/** Safe summary for logs — never includes password material. */
export function authExportLogSummary(users: AuthUserExport[]): unknown {
  return redactSecrets(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      email_confirmed_at: u.email_confirmed_at,
      encrypted_password_present: Boolean(
        u.encrypted_password_present || u.encrypted_password,
      ),
    })),
  );
}

export function assertNeverCreatesReplacementUuid(plannedUserId: string): void {
  if (plannedUserId !== LEE_AUTH_UUID) {
    throw new SelectiveMigrationSafetyError(
      "Auth tooling refused: planned user id is not Lee's existing UUID.",
    );
  }
}
