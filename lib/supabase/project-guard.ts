/**
 * Guards application Supabase targeting so local/Preview/feature builds
 * cannot silently use the production project.
 */

export const DEV_SUPABASE_PROJECT_REF = "ewxsxwzezhkeawnjvigx";
export const PROD_SUPABASE_PROJECT_REF = "eetonalyyyssvkyfdoxh";

/** Explicit override for rare local debugging against production app credentials. */
export const ALLOW_PRODUCTION_APP_ENV = "HARBAUGH_ALLOW_PRODUCTION_APP";

export function extractSupabaseProjectRef(
  url: string | null | undefined,
): string | null {
  if (!url) {
    return null;
  }
  const trimmed = url.trim().replace(/\/$/, "");
  const match = trimmed.match(/^https:\/\/([a-z0-9]+)\.supabase\.co(?:\/|$)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Production app credentials are allowed only on real Vercel Production
 * (or an explicit override). Local, Preview, and ordinary feature builds
 * must use development.
 */
export function assertAppSupabaseTargetAllowed(
  url: string | null | undefined,
): void {
  const ref = extractSupabaseProjectRef(url);
  if (!ref || ref !== PROD_SUPABASE_PROJECT_REF) {
    return;
  }

  if (process.env.VERCEL_ENV === "production") {
    return;
  }

  if (process.env[ALLOW_PRODUCTION_APP_ENV] === "1") {
    return;
  }

  throw new Error(
    "Refusing to use the production Supabase project outside Vercel Production. " +
      "Local development, tests, and feature-branch builds must use development " +
      `(.env.local → ${DEV_SUPABASE_PROJECT_REF}). ` +
      "Production operational scripts must load .env.ops.production explicitly.",
  );
}
