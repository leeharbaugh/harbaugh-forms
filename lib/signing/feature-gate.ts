/**
 * Native Signing feature gate.
 *
 * Default: unavailable. Later Signing stages must call isNativeSigningEnabled()
 * (or assertNativeSigningEnabled()) before exposing any Signing behavior.
 *
 * Gate location: server-side env `NATIVE_SIGNING_ENABLED`.
 * Accepted truthy value: exactly "true" (case-sensitive).
 * Not exposed as NEXT_PUBLIC_* so browsers cannot enable incomplete Signing UI.
 */

export const NATIVE_SIGNING_ENV_FLAG = "NATIVE_SIGNING_ENABLED" as const;

export function isNativeSigningEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[NATIVE_SIGNING_ENV_FLAG] === "true";
}

export class NativeSigningDisabledError extends Error {
  readonly code = "NATIVE_SIGNING_DISABLED" as const;

  constructor(message = "Native Signing is not enabled.") {
    super(message);
    this.name = "NativeSigningDisabledError";
  }
}

export function assertNativeSigningEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isNativeSigningEnabled(env)) {
    throw new NativeSigningDisabledError();
  }
}

/** True when Native Signing runs in a production-class deployment. */
export function isSigningProductionRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.VERCEL_ENV === "production";
}

export class NativeSigningProductionDisclosureError extends Error {
  readonly code = "PRODUCTION_DISCLOSURE_NOT_READY" as const;

  constructor(
    message = "Native Signing cannot run in production until the electronic-signing disclosure is marked production-ready.",
  ) {
    super(message);
    this.name = "NativeSigningProductionDisclosureError";
  }
}

/**
 * Fail closed in production when the current disclosure is not counsel-ready.
 */
export function assertProductionDisclosureReady(
  disclosure: { isProductionReady: boolean },
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isSigningProductionRuntime(env) && !disclosure.isProductionReady) {
    throw new NativeSigningProductionDisclosureError();
  }
}
