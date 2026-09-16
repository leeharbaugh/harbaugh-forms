/**
 * Native Signing Stage 2 authorization and operation errors.
 * Codes are stable for validators and future UI mapping.
 */

export type SigningErrorCode =
  | "NATIVE_SIGNING_DISABLED"
  | "UNAUTHENTICATED"
  | "INELIGIBLE_ACCOUNT"
  | "INELIGIBLE_ORGANIZATION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_PACKET"
  | "CONFLICT"
  | "STALE_SOURCE"
  | "INTEGRITY_MISMATCH"
  | "VALIDATION_FAILED"
  | "SOURCE_CHANGED"
  | "NOT_READY"
  | "IDEMPOTENCY_CONFLICT"
  | "ACTIVATION_FAILED";

export class SigningError extends Error {
  readonly code: SigningErrorCode;

  constructor(code: SigningErrorCode, message: string) {
    super(message);
    this.name = "SigningError";
    this.code = code;
  }
}
