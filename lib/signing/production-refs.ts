/**
 * Native Signing Supabase project refs and production site URL expectations.
 */
import {
  DEV_SUPABASE_PROJECT_REF,
  PROD_SUPABASE_PROJECT_REF,
} from "@/lib/supabase/project-guard";

export const NATIVE_SIGNING_DEV_PROJECT_REF = DEV_SUPABASE_PROJECT_REF;
export const NATIVE_SIGNING_PROD_PROJECT_REF = PROD_SUPABASE_PROJECT_REF;

export const NATIVE_SIGNING_PRODUCTION_SITE_URL =
  "https://forms.harbaughrealestate.com" as const;

export type NativeSigningReadinessTarget = "dev" | "prod";

export function expectedProjectRefForTarget(
  target: NativeSigningReadinessTarget,
): string {
  return target === "prod"
    ? NATIVE_SIGNING_PROD_PROJECT_REF
    : NATIVE_SIGNING_DEV_PROJECT_REF;
}

export function parseNativeSigningReadinessTarget(
  raw: string | undefined,
): NativeSigningReadinessTarget | null {
  if (raw === "dev" || raw === "prod") return raw;
  return null;
}
