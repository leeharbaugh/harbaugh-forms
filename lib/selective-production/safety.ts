import { createHash } from "node:crypto";
import {
  DEV_PROJECT_REF,
  DEV_PROJECT_URL,
  PROD_PROJECT_REF,
} from "./constants.ts";

export class SelectiveMigrationSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectiveMigrationSafetyError";
  }
}

export function extractProjectRef(url: string): string | null {
  const trimmed = url.trim().replace(/\/$/, "");
  const m = trimmed.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i);
  return m ? m[1].toLowerCase() : null;
}

export function assertDistinctProjects(options: {
  sourceUrl: string;
  targetUrl: string;
  allowDevAsSource?: boolean;
}): { sourceRef: string; targetRef: string } {
  const sourceRef = extractProjectRef(options.sourceUrl);
  const targetRef = extractProjectRef(options.targetUrl);

  if (!sourceRef || !targetRef) {
    throw new SelectiveMigrationSafetyError(
      "Source and target must be https://<ref>.supabase.co URLs.",
    );
  }

  if (sourceRef === targetRef) {
    throw new SelectiveMigrationSafetyError(
      "Source and target projects must be distinct (ref equality rejected).",
    );
  }

  if (options.sourceUrl.trim() === options.targetUrl.trim()) {
    throw new SelectiveMigrationSafetyError(
      "Source and target URLs must not be equal.",
    );
  }

  if (targetRef === DEV_PROJECT_REF) {
    throw new SelectiveMigrationSafetyError(
      `Target must not be the development project (${DEV_PROJECT_REF}).`,
    );
  }

  if (options.targetUrl.replace(/\/$/, "") === DEV_PROJECT_URL) {
    throw new SelectiveMigrationSafetyError(
      "Target must not be harbaugh-forms-dev.",
    );
  }

  if (options.allowDevAsSource === false && sourceRef === DEV_PROJECT_REF) {
    throw new SelectiveMigrationSafetyError(
      "Source must not be the development project for this operation.",
    );
  }

  return { sourceRef, targetRef };
}

/** Refuse writes unless target is harbaugh-forms-prod. */
export function assertProductionTargetRef(targetRef: string): void {
  if (targetRef !== PROD_PROJECT_REF) {
    throw new SelectiveMigrationSafetyError(
      `Target ref must be production ${PROD_PROJECT_REF} (got ${targetRef}).`,
    );
  }
}

export function assertRequiredCredentials(options: {
  sourceUrl?: string;
  sourceKey?: string;
  targetUrl?: string;
  targetKey?: string;
  requireTarget?: boolean;
}): void {
  if (!options.sourceUrl?.trim() || !options.sourceKey?.trim()) {
    throw new SelectiveMigrationSafetyError(
      "SOURCE_SUPABASE_URL and SOURCE_SUPABASE_SECRET_KEY are required.",
    );
  }
  if (options.requireTarget !== false) {
    if (!options.targetUrl?.trim() || !options.targetKey?.trim()) {
      throw new SelectiveMigrationSafetyError(
        "TARGET_SUPABASE_URL and TARGET_SUPABASE_SECRET_KEY are required.",
      );
    }
  }
}

/** Redact anything that looks like a password hash or secret from log strings. */
export function redactSecrets(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (/^\$2[aby]\$/i.test(value) || value.length > 80 && /password|secret|key|hash/i.test(value)) {
      return "[REDACTED]";
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        /^(encrypted_password|password|secret|service_role)$/i.test(k) ||
        (/password|secret|service_role|hash/i.test(k) && typeof v === "string")
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}

export function stableJsonHash(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
    return v;
  });
  return createHash("sha256").update(json).digest("hex");
}

export function parseArgs(argv: string[]): {
  dryRun: boolean;
  execute: boolean;
  manifestPath: string;
} {
  const dryRun = argv.includes("--dry-run") || !argv.includes("--execute");
  const execute = argv.includes("--execute");
  if (dryRun && execute && argv.includes("--dry-run")) {
    // --dry-run wins when both present
  }
  let manifestPath = "PRODUCTION_DATA_SELECTION_MANIFEST.json";
  const idx = argv.indexOf("--manifest");
  if (idx >= 0 && argv[idx + 1]) manifestPath = argv[idx + 1];
  return {
    dryRun: !execute || argv.includes("--dry-run"),
    execute,
    manifestPath,
  };
}
