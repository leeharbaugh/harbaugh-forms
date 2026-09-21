/**
 * Read-only Native Signing production-readiness evaluation helpers.
 * Never mutates. Never prints secret values.
 */
import { NATIVE_SIGNING_ENV_FLAG } from "./feature-gate";
import { CRON_SECRET_ENV } from "./cron-auth";
import {
  EVENT_CHAIN_KEY_ENV,
  EVENT_CHAIN_KEY_ID_ENV,
  EVENT_CHAIN_PREVIOUS_KEYS_ENV,
} from "./event-chain-keys";
import {
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
  WRAP_PREVIOUS_KEYS_ENV,
} from "./credentials";
import {
  COMPLETED_PACKAGE_WRAP_KEY_ENV,
  COMPLETED_PACKAGE_WRAP_KEY_ID_ENV,
  COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV,
} from "./completed-package-wrap";
import { SIGNING_WORKER_SECRET_ENV } from "./signing-worker-dispatch";
import { SIGNING_ACCESS_SUSPENDED_ENV } from "./external-access";
import {
  NATIVE_SIGNING_PRODUCTION_SITE_URL,
  type NativeSigningReadinessTarget,
  expectedProjectRefForTarget,
} from "./production-refs";
import { NATIVE_SIGNING_ALL_MIGRATIONS } from "./native-signing-migrations";

export type ReadinessSeverity =
  | "READY"
  | "NOT_INSTALLED"
  | "NOT_CONFIGURED"
  | "BLOCKED"
  | "UNSAFE"
  | "INFO";

export type ReadinessCheck = {
  id: string;
  severity: ReadinessSeverity;
  message: string;
};

export type EnvPresenceResult = {
  name: string;
  present: boolean;
  formatOk: boolean | null;
  publicValue?: string;
};

const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function evaluateProjectRefGuard(options: {
  target: NativeSigningReadinessTarget;
  observedRef: string | null | undefined;
}): ReadinessCheck {
  const expected = expectedProjectRefForTarget(options.target);
  if (!options.observedRef) {
    return {
      id: "project_ref",
      severity: "BLOCKED",
      message: `Missing Supabase project ref for target=${options.target} (expected ${expected}).`,
    };
  }
  if (options.observedRef !== expected) {
    return {
      id: "project_ref",
      severity: "UNSAFE",
      message: `Target/ref mismatch: target=${options.target} expected=${expected} observed=${options.observedRef}.`,
    };
  }
  return {
    id: "project_ref",
    severity: "READY",
    message: `Target ${options.target} matches project ref ${expected}.`,
  };
}

export function evaluateSiteUrl(options: {
  target: NativeSigningReadinessTarget;
  siteUrl: string | null | undefined;
}): ReadinessCheck {
  const raw = options.siteUrl?.trim() ?? "";
  if (!raw) {
    return {
      id: "site_url",
      severity: options.target === "prod" ? "BLOCKED" : "INFO",
      message:
        options.target === "prod"
          ? "NEXT_PUBLIC_SITE_URL is missing."
          : "NEXT_PUBLIC_SITE_URL unset on dev (informational).",
    };
  }
  if (options.target === "prod") {
    let normalized = raw.replace(/\/+$/, "");
    try {
      const parsed = new URL(normalized);
      normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(
        /\/+$/,
        "",
      );
      if (parsed.protocol !== "https:") {
        return {
          id: "site_url",
          severity: "UNSAFE",
          message: "Production site URL must use HTTPS.",
        };
      }
      if (/\.vercel\.app$/i.test(parsed.hostname)) {
        return {
          id: "site_url",
          severity: "UNSAFE",
          message: "Production site URL must not be a Vercel preview hostname.",
        };
      }
    } catch {
      return {
        id: "site_url",
        severity: "UNSAFE",
        message: "Production site URL is not a valid URL.",
      };
    }
    if (normalized !== NATIVE_SIGNING_PRODUCTION_SITE_URL) {
      return {
        id: "site_url",
        severity: "UNSAFE",
        message: `Production site URL must be ${NATIVE_SIGNING_PRODUCTION_SITE_URL} (observed non-secret host rejected).`,
      };
    }
    return {
      id: "site_url",
      severity: "READY",
      message: `Site URL is ${NATIVE_SIGNING_PRODUCTION_SITE_URL}.`,
    };
  }
  return {
    id: "site_url",
    severity: "INFO",
    message: "Dev site URL present (value not printed).",
  };
}

export function evaluateEmailSandbox(options: {
  target: NativeSigningReadinessTarget;
  sandbox: string | null | undefined;
}): ReadinessCheck {
  if (options.target === "prod" && options.sandbox?.trim() === "true") {
    return {
      id: "email_sandbox",
      severity: "UNSAFE",
      message: "SIGNING_EMAIL_SANDBOX=true is forbidden for production.",
    };
  }
  return {
    id: "email_sandbox",
    severity: "READY",
    message:
      options.target === "prod"
        ? "Signing email sandbox is not enabled."
        : "Dev sandbox setting accepted when not production.",
  };
}

export function evaluateFeatureFlag(options: {
  target: NativeSigningReadinessTarget;
  enabledRaw: string | null | undefined;
  phase: "PRE_MIGRATION" | "POST_MIGRATION_ROLLOUT" | "ENABLED";
}): ReadinessCheck {
  const enabled = options.enabledRaw === "true";
  if (options.phase !== "ENABLED" && enabled && options.target === "prod") {
    return {
      id: "feature_flag",
      severity: "UNSAFE",
      message: "NATIVE_SIGNING_ENABLED must remain off during production rollout.",
    };
  }
  if (options.phase === "ENABLED" && !enabled) {
    return {
      id: "feature_flag",
      severity: "NOT_CONFIGURED",
      message: "NATIVE_SIGNING_ENABLED is not true.",
    };
  }
  return {
    id: "feature_flag",
    severity: "READY",
    message: enabled
      ? "NATIVE_SIGNING_ENABLED=true."
      : "NATIVE_SIGNING_ENABLED is off (expected for rollout).",
  };
}

export function evaluateSystemControls(options: {
  present: boolean;
  workSuspended: boolean | null;
  accessSuspended: boolean | null;
  accessEpoch: string | null;
  phase: "PRE_MIGRATION" | "POST_MIGRATION_ROLLOUT" | "ENABLED";
}): ReadinessCheck[] {
  if (!options.present) {
    return [
      {
        id: "system_controls",
        severity:
          options.phase === "PRE_MIGRATION" ? "NOT_INSTALLED" : "BLOCKED",
        message:
          options.phase === "PRE_MIGRATION"
            ? "signing_system_controls not installed yet (expected pre-migration)."
            : "signing_system_controls singleton missing.",
      },
    ];
  }
  const checks: ReadinessCheck[] = [];
  if (options.phase === "POST_MIGRATION_ROLLOUT") {
    if (options.workSuspended !== true) {
      checks.push({
        id: "work_suspended",
        severity: "UNSAFE",
        message: "work_suspended must be true during production rollout.",
      });
    } else {
      checks.push({
        id: "work_suspended",
        severity: "READY",
        message: "work_suspended=true.",
      });
    }
    if (options.accessSuspended !== true) {
      checks.push({
        id: "access_suspended",
        severity: "UNSAFE",
        message: "access_suspended must be true during production rollout.",
      });
    } else {
      checks.push({
        id: "access_suspended",
        severity: "READY",
        message: "access_suspended=true.",
      });
    }
    if (!options.accessEpoch?.trim()) {
      checks.push({
        id: "access_epoch",
        severity: "BLOCKED",
        message: "access_epoch is missing.",
      });
    } else {
      checks.push({
        id: "access_epoch",
        severity: "READY",
        message: "access_epoch is present (value not printed).",
      });
    }
  }
  return checks;
}

export function evaluateDisclosure(options: {
  target: NativeSigningReadinessTarget;
  productionReadyCount: number | null;
  fingerprintValid: boolean | null;
  schemaPresent: boolean;
}): ReadinessCheck {
  if (!options.schemaPresent) {
    return {
      id: "disclosure",
      severity: "NOT_INSTALLED",
      message: "Consent disclosure table not installed.",
    };
  }
  if (options.target !== "prod") {
    return {
      id: "disclosure",
      severity: "INFO",
      message: "Dev disclosure may remain non-production-ready.",
    };
  }
  if ((options.productionReadyCount ?? 0) < 1) {
    return {
      id: "disclosure",
      severity: "BLOCKED",
      message: "BLOCKED: PRODUCTION_DISCLOSURE_NOT_READY",
    };
  }
  if (options.fingerprintValid === false) {
    return {
      id: "disclosure",
      severity: "UNSAFE",
      message: "Production-ready disclosure fingerprint does not match body.",
    };
  }
  return {
    id: "disclosure",
    severity: "READY",
    message: "Production-ready disclosure present with valid fingerprint.",
  };
}

function checkKeyIdFormat(value: string | undefined): boolean {
  return Boolean(value?.trim() && KEY_ID_RE.test(value.trim()));
}

function checkKeyMaterialFormat(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  if (trimmed.length >= 32) return true;
  try {
    const buf = Buffer.from(trimmed, "base64");
    return buf.length === 32;
  } catch {
    return false;
  }
}

export function evaluateEnvPresence(
  env: NodeJS.ProcessEnv,
  target: NativeSigningReadinessTarget,
): EnvPresenceResult[] {
  const rows: EnvPresenceResult[] = [
    {
      name: NATIVE_SIGNING_ENV_FLAG,
      present: env[NATIVE_SIGNING_ENV_FLAG] !== undefined,
      formatOk: true,
      publicValue: env[NATIVE_SIGNING_ENV_FLAG] ?? "(unset)",
    },
    {
      name: "SIGNING_WORK_SUSPENDED",
      present: env.SIGNING_WORK_SUSPENDED !== undefined,
      formatOk: true,
      publicValue: env.SIGNING_WORK_SUSPENDED ?? "(unset)",
    },
    {
      name: SIGNING_ACCESS_SUSPENDED_ENV,
      present: env[SIGNING_ACCESS_SUSPENDED_ENV] !== undefined,
      formatOk: true,
      publicValue: env[SIGNING_ACCESS_SUSPENDED_ENV] ?? "(unset)",
    },
    {
      name: SIGNING_WORKER_SECRET_ENV,
      present: Boolean(env[SIGNING_WORKER_SECRET_ENV]?.trim()),
      formatOk: Boolean(env[SIGNING_WORKER_SECRET_ENV]?.trim()),
    },
    {
      name: CRON_SECRET_ENV,
      present: Boolean(env[CRON_SECRET_ENV]?.trim()),
      formatOk: Boolean(
        env[CRON_SECRET_ENV]?.trim() &&
          (env[CRON_SECRET_ENV]?.trim().length ?? 0) >= 16,
      ),
    },
    {
      name: EVENT_CHAIN_KEY_ID_ENV,
      present: Boolean(env[EVENT_CHAIN_KEY_ID_ENV]?.trim()),
      formatOk: checkKeyIdFormat(env[EVENT_CHAIN_KEY_ID_ENV]),
    },
    {
      name: EVENT_CHAIN_KEY_ENV,
      present: Boolean(env[EVENT_CHAIN_KEY_ENV]?.trim()),
      formatOk: checkKeyMaterialFormat(env[EVENT_CHAIN_KEY_ENV]),
    },
    {
      name: EVENT_CHAIN_PREVIOUS_KEYS_ENV,
      present: env[EVENT_CHAIN_PREVIOUS_KEYS_ENV] !== undefined,
      formatOk: true,
      publicValue: env[EVENT_CHAIN_PREVIOUS_KEYS_ENV]?.trim()
        ? "(set)"
        : "(empty/unset)",
    },
    {
      name: WRAP_KEY_ID_ENV,
      present: Boolean(env[WRAP_KEY_ID_ENV]?.trim()),
      formatOk: checkKeyIdFormat(env[WRAP_KEY_ID_ENV]),
    },
    {
      name: WRAP_KEY_ENV,
      present: Boolean(env[WRAP_KEY_ENV]?.trim()),
      formatOk: checkKeyMaterialFormat(env[WRAP_KEY_ENV]),
    },
    {
      name: WRAP_PREVIOUS_KEYS_ENV,
      present: env[WRAP_PREVIOUS_KEYS_ENV] !== undefined,
      formatOk: true,
      publicValue: env[WRAP_PREVIOUS_KEYS_ENV]?.trim()
        ? "(set)"
        : "(empty/unset)",
    },
    {
      name: COMPLETED_PACKAGE_WRAP_KEY_ID_ENV,
      present: Boolean(env[COMPLETED_PACKAGE_WRAP_KEY_ID_ENV]?.trim()),
      formatOk: checkKeyIdFormat(env[COMPLETED_PACKAGE_WRAP_KEY_ID_ENV]),
    },
    {
      name: COMPLETED_PACKAGE_WRAP_KEY_ENV,
      present: Boolean(env[COMPLETED_PACKAGE_WRAP_KEY_ENV]?.trim()),
      formatOk: checkKeyMaterialFormat(env[COMPLETED_PACKAGE_WRAP_KEY_ENV]),
    },
    {
      name: COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV,
      present: env[COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV] !== undefined,
      formatOk: true,
      publicValue: env[COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV]?.trim()
        ? "(set)"
        : "(empty/unset)",
    },
    {
      name: "RESEND_API_KEY",
      present: Boolean(env.RESEND_API_KEY?.trim()),
      formatOk: Boolean(env.RESEND_API_KEY?.trim()),
    },
    {
      name: "SIGNING_EMAIL_FROM",
      present: Boolean(env.SIGNING_EMAIL_FROM?.trim()),
      formatOk: Boolean(env.SIGNING_EMAIL_FROM?.trim()),
      publicValue: env.SIGNING_EMAIL_FROM?.trim() || "(unset)",
    },
    {
      name: "SIGNING_EMAIL_SANDBOX",
      present: env.SIGNING_EMAIL_SANDBOX !== undefined,
      formatOk: true,
      publicValue: env.SIGNING_EMAIL_SANDBOX ?? "(unset)",
    },
    {
      name: "NEXT_PUBLIC_SITE_URL",
      present: Boolean(env.NEXT_PUBLIC_SITE_URL?.trim()),
      formatOk: Boolean(env.NEXT_PUBLIC_SITE_URL?.trim()),
      publicValue:
        target === "prod"
          ? env.NEXT_PUBLIC_SITE_URL?.trim() || "(unset)"
          : env.NEXT_PUBLIC_SITE_URL?.trim()
            ? "(set)"
            : "(unset)",
    },
  ];
  return rows;
}

export function evaluateCronCodePosture(options: {
  cronRouteExists: boolean;
  vercelCronDeclared: boolean;
  workerFeatureOffGuarded: boolean;
}): ReadinessCheck[] {
  return [
    {
      id: "cron_route",
      severity: options.cronRouteExists ? "READY" : "BLOCKED",
      message: options.cronRouteExists
        ? "Cron signing-worker route is present."
        : "Cron signing-worker route is missing.",
    },
    {
      id: "cron_declaration",
      severity: options.vercelCronDeclared ? "READY" : "NOT_CONFIGURED",
      message: options.vercelCronDeclared
        ? "vercel.json declares Signing Cron schedule (code/config only — not proof Cron is live in production)."
        : "vercel.json Cron declaration missing.",
    },
    {
      id: "worker_feature_off",
      severity: options.workerFeatureOffGuarded ? "READY" : "UNSAFE",
      message: options.workerFeatureOffGuarded
        ? "Worker batch honors feature-OFF (FEATURE_DISABLED)."
        : "Worker batch does not fail closed when feature is OFF.",
    },
  ];
}

export function summarizeReadiness(checks: ReadinessCheck[]): {
  overall: ReadinessSeverity;
  blocked: boolean;
} {
  const order: ReadinessSeverity[] = [
    "UNSAFE",
    "BLOCKED",
    "NOT_CONFIGURED",
    "NOT_INSTALLED",
    "INFO",
    "READY",
  ];
  let overall: ReadinessSeverity = "READY";
  for (const severity of order) {
    if (checks.some((check) => check.severity === severity)) {
      overall = severity;
      break;
    }
  }
  return {
    overall,
    blocked:
      overall === "UNSAFE" ||
      overall === "BLOCKED" ||
      overall === "NOT_CONFIGURED",
  };
}

export { NATIVE_SIGNING_ALL_MIGRATIONS };
