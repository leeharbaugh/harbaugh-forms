/**
 * Audit metadata sanitizer — pure helpers (safe for unit tests).
 */

/** Field-name patterns that must never appear in audit metadata. */
const SECRET_FIELD_RE =
  /(password|token|secret|authorization|cookie|credential|session|private[_-]?key|api[_-]?key|service[_-]?role)/i;

const MAX_STRING_LENGTH = 500;
const MAX_METADATA_KEYS = 40;

export type AuditMetadata = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizePrimitive(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return null;
    }
    return value;
  }
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return "[omitted]";
}

/**
 * Sanitize audit metadata: drop secret-named keys, truncate strings,
 * never retain nested full rows or request bodies.
 */
export function sanitizeAuditMetadata(
  input: AuditMetadata | null | undefined,
): AuditMetadata {
  if (!input || !isPlainObject(input)) {
    return {};
  }

  const out: AuditMetadata = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= MAX_METADATA_KEYS) {
      out._truncated = true;
      break;
    }
    if (SECRET_FIELD_RE.test(key)) {
      out[key] = "[redacted]";
      count += 1;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((item) => {
        if (isPlainObject(item)) {
          return sanitizeAuditMetadata(item);
        }
        return sanitizePrimitive(item);
      });
      count += 1;
      continue;
    }
    if (isPlainObject(value)) {
      // Prefer changed-field summaries over nested objects.
      if (
        key === "changedFields" ||
        key === "safeOldValues" ||
        key === "safeNewValues"
      ) {
        out[key] = sanitizeAuditMetadata(value);
      } else {
        out[key] = "[object-omitted]";
      }
      count += 1;
      continue;
    }
    out[key] = sanitizePrimitive(value);
    count += 1;
  }
  return out;
}

export type AuditUpdateDiff = {
  changedFields: string[];
  safeOldValues: Record<string, unknown>;
  safeNewValues: Record<string, unknown>;
};

const SAFE_UPDATE_VALUE_KEYS = new Set([
  "name",
  "legal_name",
  "status",
  "office_name",
  "city",
  "state",
  "zip",
  "is_main_office",
  "membership_role",
  "app_role",
  "onboarding_status",
  "organization_type",
  "brokerage_license_number",
  "broker_license_number",
  "trec_license_number",
  "license_verification_source",
  "ordinary_logging_enabled",
]);

/**
 * Build a minimized update diff for audit metadata (never full rows).
 */
export function buildAuditUpdateDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  options?: { allowKeys?: string[] },
): AuditUpdateDiff {
  const allow = new Set([
    ...SAFE_UPDATE_VALUE_KEYS,
    ...(options?.allowKeys ?? []),
  ]);
  const changedFields: string[] = [];
  const safeOldValues: Record<string, unknown> = {};
  const safeNewValues: Record<string, unknown> = {};

  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  for (const key of keys) {
    if (SECRET_FIELD_RE.test(key)) {
      continue;
    }
    const oldVal = before?.[key];
    const newVal = after?.[key];
    if (Object.is(oldVal, newVal)) {
      continue;
    }
    if (
      typeof oldVal === "object" ||
      typeof newVal === "object"
    ) {
      if (oldVal !== newVal) {
        changedFields.push(key);
      }
      continue;
    }
    changedFields.push(key);
    if (allow.has(key)) {
      safeOldValues[key] = sanitizePrimitive(oldVal);
      safeNewValues[key] = sanitizePrimitive(newVal);
    }
  }

  return { changedFields, safeOldValues, safeNewValues };
}
