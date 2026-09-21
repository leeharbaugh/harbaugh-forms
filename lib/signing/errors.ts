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
  | "ACTIVATION_FAILED"
  // Participant ceremony (Stage 5). The ceremony browser session — not the
  // Stage 4 entry session — is the authority for every code below.
  | "SESSION_EXPIRED"
  | "SESSION_SUPERSEDED"
  | "CEREMONY_FORBIDDEN"
  | "CONSENT_REQUIRED"
  | "MARK_LOCKED"
  | "DRAWN_MARK_UNSUPPORTED"
  | "ALREADY_FINISHED"
  | "DECLINED"
  | "AMENDMENT_LOCKED"
  | "PRESENCE_REQUIRED";

export class SigningError extends Error {
  readonly code: SigningErrorCode;

  constructor(code: SigningErrorCode, message: string) {
    super(message);
    this.name = "SigningError";
    this.code = code;
  }
}
