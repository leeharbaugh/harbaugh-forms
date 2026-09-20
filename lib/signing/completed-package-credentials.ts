/**
 * Native Signing completed-package credentials.
 *
 * Separate from ceremony participant credentials. Hash-only authentication;
 * optional server wrap for same-link resend. Exactly one of participant or
 * copy recipient. Never log raw tokens.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import {
  generateCompletedPackageToken,
  hashCompletedPackageToken,
  isWellFormedCompletedPackageToken,
  resolveCompletedPackageWrapKeyring,
  unwrapCompletedPackageToken,
  wrapCompletedPackageTokenWithKeyring,
  type CompletedPackageWrapContext,
} from "./completed-package-wrap";

export {
  COMPLETED_PACKAGE_TOKEN_RE,
  generateCompletedPackageToken,
  hashCompletedPackageToken,
  isWellFormedCompletedPackageToken,
} from "./completed-package-wrap";

export type IssuedCompletedPackageCredential = {
  credentialId: string;
  wrapKeyId: string;
  /** In-memory only for immediate delivery. Prefer unwrap for retries. */
  rawToken: string;
  signingParticipantId: string | null;
  signingCopyRecipientId: string | null;
};

export type CompletedPackageRecipientTarget =
  | { signingParticipantId: string; signingCopyRecipientId?: never }
  | { signingCopyRecipientId: string; signingParticipantId?: never };

function wrapContext(options: {
  credentialId: string;
  signingId: string;
  signingParticipantId: string | null;
  signingCopyRecipientId: string | null;
}): CompletedPackageWrapContext {
  return {
    credentialId: options.credentialId,
    signingId: options.signingId,
    signingParticipantId: options.signingParticipantId,
    signingCopyRecipientId: options.signingCopyRecipientId,
  };
}

function hashesMatch(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length !== left.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertXorRecipient(target: CompletedPackageRecipientTarget): {
  signingParticipantId: string | null;
  signingCopyRecipientId: string | null;
} {
  const participantId =
    "signingParticipantId" in target && target.signingParticipantId
      ? target.signingParticipantId
      : null;
  const copyRecipientId =
    "signingCopyRecipientId" in target && target.signingCopyRecipientId
      ? target.signingCopyRecipientId
      : null;
  if ((participantId == null) === (copyRecipientId == null)) {
    throw new SigningError(
      "INVALID_INPUT",
      "Completed-package credential requires exactly one of participant or copy recipient.",
    );
  }
  return {
    signingParticipantId: participantId,
    signingCopyRecipientId: copyRecipientId,
  };
}

/**
 * Issue one current completed-package credential for a participant or copy
 * recipient. DB unique indexes enforce one current credential per recipient.
 */
export async function issueCompletedPackageCredential(options: {
  admin: SupabaseClient;
  signingId: string;
  target: CompletedPackageRecipientTarget;
  issuedByUserId?: string | null;
}): Promise<IssuedCompletedPackageCredential> {
  const recipients = assertXorRecipient(options.target);
  const keyring = resolveCompletedPackageWrapKeyring();
  const credentialId = randomUUID();
  const rawToken = generateCompletedPackageToken();
  const { wrapped, wrapKeyId } = wrapCompletedPackageTokenWithKeyring({
    keyring,
    rawToken,
    context: wrapContext({
      credentialId,
      signingId: options.signingId,
      ...recipients,
    }),
  });

  const { data: inserted, error: insertError } = await options.admin
    .from("signing_completed_package_credentials")
    .insert({
      id: credentialId,
      signing_id: options.signingId,
      signing_participant_id: recipients.signingParticipantId,
      signing_copy_recipient_id: recipients.signingCopyRecipientId,
      token_hash: hashCompletedPackageToken(rawToken),
      token_wrapped: wrapped,
      wrap_key_id: wrapKeyId,
      issued_by_user_id: options.issuedByUserId ?? null,
      is_current: true,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    throw new Error(
      insertError?.message ?? "Failed to issue completed-package credential.",
    );
  }

  return {
    credentialId,
    wrapKeyId,
    rawToken,
    signingParticipantId: recipients.signingParticipantId,
    signingCopyRecipientId: recipients.signingCopyRecipientId,
  };
}

/**
 * Load the current (non-revoked) credential for a recipient, if any.
 */
export async function findCurrentCompletedPackageCredential(options: {
  admin: SupabaseClient;
  signingId: string;
  target: CompletedPackageRecipientTarget;
}): Promise<{ credentialId: string } | null> {
  const recipients = assertXorRecipient(options.target);
  let query = options.admin
    .from("signing_completed_package_credentials")
    .select("id")
    .eq("signing_id", options.signingId)
    .eq("is_current", true)
    .is("revoked_at", null);

  if (recipients.signingParticipantId) {
    query = query.eq(
      "signing_participant_id",
      recipients.signingParticipantId,
    );
  } else {
    query = query.eq(
      "signing_copy_recipient_id",
      recipients.signingCopyRecipientId!,
    );
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { credentialId: data.id as string };
}

/**
 * Issue if no current credential exists; otherwise return the existing id
 * without a raw token (caller must unwrap for resend).
 */
export async function ensureCompletedPackageCredential(options: {
  admin: SupabaseClient;
  signingId: string;
  target: CompletedPackageRecipientTarget;
  issuedByUserId?: string | null;
}): Promise<
  | (IssuedCompletedPackageCredential & { created: true })
  | { credentialId: string; created: false; rawToken?: undefined }
> {
  const existing = await findCurrentCompletedPackageCredential(options);
  if (existing) {
    return { credentialId: existing.credentialId, created: false };
  }
  const issued = await issueCompletedPackageCredential(options);
  return { ...issued, created: true };
}

export type ValidatedCompletedPackageCredential = {
  credentialId: string;
  signingId: string;
  signingParticipantId: string | null;
  signingCopyRecipientId: string | null;
  signingTitle: string;
};

/**
 * Hash-only bearer validation. Requires Signing COMPLETE.
 * Returns null for every failure mode.
 */
export async function validateCompletedPackageCredential(
  admin: SupabaseClient,
  rawToken: unknown,
): Promise<ValidatedCompletedPackageCredential | null> {
  if (!isWellFormedCompletedPackageToken(rawToken)) {
    return null;
  }

  const { data: credential, error } = await admin
    .from("signing_completed_package_credentials")
    .select(
      "id, signing_id, signing_participant_id, signing_copy_recipient_id, is_current, revoked_at",
    )
    .eq("token_hash", hashCompletedPackageToken(rawToken))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!credential || credential.revoked_at || credential.is_current !== true) {
    return null;
  }

  const { data: signing, error: signingError } = await admin
    .from("signings")
    .select("id, title, lifecycle_state")
    .eq("id", credential.signing_id as string)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);
  if (!signing || signing.lifecycle_state !== "COMPLETE") {
    return null;
  }

  const copyRecipientId =
    (credential.signing_copy_recipient_id as string | null) ?? null;
  if (copyRecipientId) {
    const { data: copyRecipient, error: copyError } = await admin
      .from("signing_copy_recipients")
      .select("id, status")
      .eq("id", copyRecipientId)
      .eq("signing_id", signing.id as string)
      .maybeSingle();
    if (copyError) throw new Error(copyError.message);
    if (!copyRecipient || copyRecipient.status !== "ACTIVE") {
      return null;
    }
  }

  return {
    credentialId: credential.id as string,
    signingId: signing.id as string,
    signingParticipantId:
      (credential.signing_participant_id as string | null) ?? null,
    signingCopyRecipientId: copyRecipientId,
    signingTitle: signing.title as string,
  };
}

/** Server-only unwrap for same-link resend. Never log the returned value. */
export async function loadRawCompletedPackageToken(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
}): Promise<string | null> {
  const { data, error } = await options.admin
    .from("signing_completed_package_credentials")
    .select(
      "id, signing_id, signing_participant_id, signing_copy_recipient_id, token_wrapped, wrap_key_id, token_hash, is_current, revoked_at",
    )
    .eq("id", options.credentialId)
    .eq("signing_id", options.signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revoked_at || data.is_current !== true) {
    return null;
  }

  const raw = unwrapCompletedPackageToken({
    wrapped: data.token_wrapped as string | null,
    wrapKeyId: data.wrap_key_id as string | null,
    context: wrapContext({
      credentialId: data.id as string,
      signingId: data.signing_id as string,
      signingParticipantId:
        (data.signing_participant_id as string | null) ?? null,
      signingCopyRecipientId:
        (data.signing_copy_recipient_id as string | null) ?? null,
    }),
  });
  if (!raw) return null;
  if (!hashesMatch(hashCompletedPackageToken(raw), data.token_hash)) {
    return null;
  }
  return raw;
}

export async function revokeCompletedPackageCredential(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
  revokedByUserId?: string | null;
  reason: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_completed_package_credentials")
    .update({
      is_current: false,
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: options.revokedByUserId ?? null,
      revoked_reason: options.reason,
    })
    .eq("id", options.credentialId)
    .eq("signing_id", options.signingId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

/**
 * Revoke the current credential and issue a replacement. Sets replaced_by.
 */
export async function replaceCompletedPackageCredential(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
  replacedByUserId?: string | null;
  reason?: string;
}): Promise<IssuedCompletedPackageCredential> {
  const { data: prior, error: priorError } = await options.admin
    .from("signing_completed_package_credentials")
    .select(
      "id, signing_participant_id, signing_copy_recipient_id, is_current, revoked_at",
    )
    .eq("id", options.credentialId)
    .eq("signing_id", options.signingId)
    .maybeSingle();
  if (priorError) throw new Error(priorError.message);
  if (!prior) {
    throw new SigningError("NOT_FOUND", "Completed-package credential not found.");
  }

  const target: CompletedPackageRecipientTarget = prior.signing_participant_id
    ? { signingParticipantId: prior.signing_participant_id as string }
    : {
        signingCopyRecipientId: prior.signing_copy_recipient_id as string,
      };

  await revokeCompletedPackageCredential({
    admin: options.admin,
    signingId: options.signingId,
    credentialId: options.credentialId,
    revokedByUserId: options.replacedByUserId ?? null,
    reason: options.reason ?? "REPLACED",
  });

  const issued = await issueCompletedPackageCredential({
    admin: options.admin,
    signingId: options.signingId,
    target,
    issuedByUserId: options.replacedByUserId ?? null,
  });

  const { error: linkError } = await options.admin
    .from("signing_completed_package_credentials")
    .update({ replaced_by_credential_id: issued.credentialId })
    .eq("id", options.credentialId)
    .eq("signing_id", options.signingId);
  if (linkError) throw new Error(linkError.message);

  return issued;
}

export function assertWellFormedCompletedPackageToken(value: unknown): string {
  if (!isWellFormedCompletedPackageToken(value)) {
    throw new SigningError("INVALID_INPUT", "Invalid completed-package link.");
  }
  return value;
}
