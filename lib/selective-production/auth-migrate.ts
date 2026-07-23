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
  raw_app_meta_data?: Record<string, unknown> | string | null;
  raw_user_meta_data?: Record<string, unknown> | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  aud?: string | null;
  role?: string | null;
  instance_id?: string | null;
  confirmation_token?: string | null;
  recovery_token?: string | null;
  email_change_token_new?: string | null;
  email_change_token_current?: string | null;
  email_change?: string | null;
  phone?: string | null;
  is_super_admin?: boolean | null;
  is_sso_user?: boolean | null;
  is_anonymous?: boolean | null;
  last_sign_in_at?: string | null;
};

export type AuthIdentityExport = {
  id: string;
  user_id: string;
  provider: string;
  provider_id?: string | null;
  identity_data?: Record<string, unknown> | string | null;
  email?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

/** Dollar-quote a string for SQL literals without leaking via escaping bugs. */
export function sqlDollarQuote(value: string, tagPrefix = "v"): string {
  let tag = tagPrefix;
  let n = 0;
  while (value.includes(`$${tag}$`)) {
    tag = `${tagPrefix}${n++}`;
  }
  return `$${tag}$${value}$${tag}$`;
}

function sqlTextOrEmpty(value: string | null | undefined): string {
  return sqlDollarQuote(value ?? "");
}

function sqlNullableTimestamptz(value: string | null | undefined): string {
  if (value == null || value === "") return "null";
  return `${sqlDollarQuote(value)}::timestamptz`;
}

function sqlJsonb(
  value: Record<string, unknown> | string | null | undefined,
  fallback: string,
): string {
  if (value == null) return `${sqlDollarQuote(fallback)}::jsonb`;
  if (typeof value === "string") {
    return `${sqlDollarQuote(value)}::jsonb`;
  }
  return `${sqlDollarQuote(JSON.stringify(value))}::jsonb`;
}

/**
 * Build a single-statement SQL script that inserts Lee into target Auth
 * with preserved UUID + identity ID + encrypted password hash.
 * Never log the returned SQL (contains password hash).
 *
 * Uses one DO block so `supabase db query` accepts it (no multi-statement).
 */
export function buildLeeAuthImportSql(options: {
  users: AuthUserExport[];
  identities: AuthIdentityExport[];
}): string {
  validateAuthExportForMigration(options);
  const user = options.users[0];
  const identity = options.identities[0];
  const hash = user.encrypted_password;
  if (!hash) {
    throw new SelectiveMigrationSafetyError(
      "encrypted_password is required to build Auth import SQL.",
    );
  }

  const instanceId = user.instance_id ?? "00000000-0000-0000-0000-000000000000";
  const providerId =
    identity.provider_id ??
    (typeof identity.identity_data === "object" &&
    identity.identity_data &&
    typeof (identity.identity_data as { sub?: unknown }).sub === "string"
      ? (identity.identity_data as { sub: string }).sub
      : LEE_AUTH_UUID);

  const createdAtSql =
    sqlNullableTimestamptz(user.created_at) === "null"
      ? "now()"
      : sqlNullableTimestamptz(user.created_at);
  const updatedAtSql =
    sqlNullableTimestamptz(user.updated_at) === "null"
      ? "now()"
      : sqlNullableTimestamptz(user.updated_at);
  const identityCreatedSql =
    sqlNullableTimestamptz(identity.created_at) === "null"
      ? "now()"
      : sqlNullableTimestamptz(identity.created_at);
  const identityUpdatedSql =
    sqlNullableTimestamptz(identity.updated_at) === "null"
      ? "now()"
      : sqlNullableTimestamptz(identity.updated_at);

  return `do $authimport$
declare
  v_other int;
begin
  select count(*) into v_other
  from auth.users
  where id <> '${LEE_AUTH_UUID}'::uuid;
  if v_other > 0 then
    raise exception 'Target Auth already has non-Lee users (%); aborting', v_other;
  end if;

  if exists (select 1 from auth.users where id = '${LEE_AUTH_UUID}'::uuid) then
    raise exception 'Lee Auth user already present on target; aborting duplicate import';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    last_sign_in_at,
    is_sso_user,
    is_anonymous
  ) values (
    '${instanceId}'::uuid,
    '${LEE_AUTH_UUID}'::uuid,
    ${sqlTextOrEmpty(user.aud ?? "authenticated")},
    ${sqlTextOrEmpty(user.role ?? "authenticated")},
    ${sqlDollarQuote(LEE_AUTH_EMAIL)},
    ${sqlDollarQuote(hash)},
    ${sqlNullableTimestamptz(user.email_confirmed_at)},
    ${sqlTextOrEmpty(user.confirmation_token)},
    ${sqlTextOrEmpty(user.recovery_token)},
    ${sqlTextOrEmpty(user.email_change_token_new)},
    ${sqlTextOrEmpty(user.email_change_token_current)},
    ${sqlTextOrEmpty(user.email_change)},
    ${sqlJsonb(user.raw_app_meta_data, '{"provider":"email","providers":["email"]}')},
    ${sqlJsonb(user.raw_user_meta_data, "{}")},
    ${user.is_super_admin === true ? "true" : "false"},
    ${createdAtSql},
    ${updatedAtSql},
    ${user.phone == null || user.phone === "" ? "null" : sqlDollarQuote(user.phone)},
    ${sqlNullableTimestamptz(user.last_sign_in_at)},
    ${user.is_sso_user === true ? "true" : "false"},
    ${user.is_anonymous === true ? "true" : "false"}
  );

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    '${LEE_IDENTITY_ID}'::uuid,
    '${LEE_AUTH_UUID}'::uuid,
    ${sqlDollarQuote(providerId)},
    ${sqlJsonb(
      identity.identity_data,
      JSON.stringify({
        sub: LEE_AUTH_UUID,
        email: LEE_AUTH_EMAIL,
        email_verified: true,
        phone_verified: false,
      }),
    )},
    ${sqlDollarQuote(identity.provider || "email")},
    ${sqlNullableTimestamptz(identity.last_sign_in_at)},
    ${identityCreatedSql},
    ${identityUpdatedSql}
  );
end;
$authimport$;`;
}

/** Source export SELECT — returns one Lee user row (includes hash; do not log). */
export const LEE_AUTH_USER_EXPORT_SQL = `
select
  instance_id::text,
  id::text,
  aud::text,
  role::text,
  email::text,
  encrypted_password::text,
  email_confirmed_at::text,
  confirmation_token::text,
  recovery_token::text,
  email_change_token_new::text,
  email_change_token_current::text,
  email_change::text,
  raw_app_meta_data::text,
  raw_user_meta_data::text,
  is_super_admin,
  created_at::text,
  updated_at::text,
  phone::text,
  last_sign_in_at::text,
  is_sso_user,
  is_anonymous
from auth.users
where id = '${LEE_AUTH_UUID}'::uuid
  and lower(email) = lower('${LEE_AUTH_EMAIL}');
`.trim();

export const LEE_AUTH_IDENTITY_EXPORT_SQL = `
select
  id::text,
  user_id::text,
  provider::text,
  provider_id::text,
  identity_data::text,
  email::text,
  last_sign_in_at::text,
  created_at::text,
  updated_at::text
from auth.identities
where user_id = '${LEE_AUTH_UUID}'::uuid
  and provider = 'email'
  and id = '${LEE_IDENTITY_ID}'::uuid;
`.trim();

export const TARGET_AUTH_VERIFY_SQL = `
select
  (select count(*)::int from auth.users) as user_count,
  (select id::text from auth.users limit 1) as user_id,
  (select email::text from auth.users limit 1) as email,
  (select (encrypted_password is not null and length(encrypted_password) > 0) from auth.users limit 1) as has_password_hash,
  (select (email_confirmed_at is not null) from auth.users limit 1) as email_confirmed,
  (select count(*)::int from auth.identities) as identity_count,
  (select id::text from auth.identities limit 1) as identity_id,
  (select user_id::text from auth.identities limit 1) as identity_user_id,
  (select provider::text from auth.identities limit 1) as identity_provider;
`.trim();

export function authUserFromExportRow(row: Record<string, unknown>): AuthUserExport {
  const hash = row.encrypted_password == null ? undefined : String(row.encrypted_password);
  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    email_confirmed_at: row.email_confirmed_at == null ? null : String(row.email_confirmed_at),
    encrypted_password_present: Boolean(hash),
    encrypted_password: hash,
    instance_id: row.instance_id == null ? null : String(row.instance_id),
    aud: row.aud == null ? null : String(row.aud),
    role: row.role == null ? null : String(row.role),
    confirmation_token: row.confirmation_token == null ? null : String(row.confirmation_token),
    recovery_token: row.recovery_token == null ? null : String(row.recovery_token),
    email_change_token_new:
      row.email_change_token_new == null ? null : String(row.email_change_token_new),
    email_change_token_current:
      row.email_change_token_current == null ? null : String(row.email_change_token_current),
    email_change: row.email_change == null ? null : String(row.email_change),
    raw_app_meta_data: row.raw_app_meta_data == null ? null : String(row.raw_app_meta_data),
    raw_user_meta_data: row.raw_user_meta_data == null ? null : String(row.raw_user_meta_data),
    is_super_admin: row.is_super_admin == null ? null : Boolean(row.is_super_admin),
    created_at: row.created_at == null ? null : String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
    phone: row.phone == null ? null : String(row.phone),
    last_sign_in_at: row.last_sign_in_at == null ? null : String(row.last_sign_in_at),
    is_sso_user: row.is_sso_user == null ? null : Boolean(row.is_sso_user),
    is_anonymous: row.is_anonymous == null ? null : Boolean(row.is_anonymous),
  };
}

export function authIdentityFromExportRow(
  row: Record<string, unknown>,
): AuthIdentityExport {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    provider: String(row.provider ?? "email"),
    provider_id: row.provider_id == null ? null : String(row.provider_id),
    identity_data: row.identity_data == null ? null : String(row.identity_data),
    email: row.email == null ? null : String(row.email),
    last_sign_in_at: row.last_sign_in_at == null ? null : String(row.last_sign_in_at),
    created_at: row.created_at == null ? null : String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  };
}
