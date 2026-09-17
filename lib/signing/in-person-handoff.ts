/**
 * Native Signing Stage 5 supervised in-person handoff.
 *
 * In-person signing needs an entry path that does not depend on an emailed
 * bearer. The agent hands their device (or a link) to the participant, and the
 * participant still performs the same "I am [Name]" affirmation, the same
 * consent, and the same evidence-bearing ceremony as a remote participant.
 *
 * This is access plumbing only, exactly like the Stage 4 credential exchange:
 * - Only the SHA-256 digest of the handoff token is persisted.
 * - The token is single-use, short-lived, and revocable, and is consumed at
 *   affirmation so it cannot re-enter the ceremony later.
 * - Ceremony authority is still the `signing_browser_sessions` row created
 *   after affirmation, never the handoff itself.
 * - Issuing a new handoff for a participant ends that participant's prior
 *   ceremony session, so a device that was handed away cannot keep signing.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { supersedeActiveCeremonySessions } from "./browser-sessions";
import { createDeviceHandoffLock } from "./device-handoff-lock";
import {
  buildResponsibleContextMetadata,
  resolveSigningEventActorType,
} from "./event-actor";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { getSigningForActor } from "./operations";
import { isUuid, type SigningActor } from "./types";

export const SIGNING_HANDOFF_COOKIE_NAME = "hf_signing_handoff" as const;
export const SIGNING_HANDOFF_COOKIE_PATH = "/sign" as const;
export const SIGNING_HANDOFF_TTL_MINUTES = 15;

const HANDOFF_TOKEN_BYTES = 32;
export const SIGNING_HANDOFF_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateInPersonHandoffToken(): string {
  return randomBytes(HANDOFF_TOKEN_BYTES).toString("base64url");
}

export function hashInPersonHandoffToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isWellFormedInPersonHandoffToken(
  value: unknown,
): value is string {
  return typeof value === "string" && SIGNING_HANDOFF_TOKEN_RE.test(value);
}

export type SigningHandoffCookieAttributes = {
  name: typeof SIGNING_HANDOFF_COOKIE_NAME;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: typeof SIGNING_HANDOFF_COOKIE_PATH;
  maxAge: number;
};

export function buildSigningHandoffCookieAttributes(options: {
  rawHandoffToken: string;
  ttlMinutes?: number;
}): SigningHandoffCookieAttributes {
  return {
    name: SIGNING_HANDOFF_COOKIE_NAME,
    value: options.rawHandoffToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: SIGNING_HANDOFF_COOKIE_PATH,
    maxAge: (options.ttlMinutes ?? SIGNING_HANDOFF_TTL_MINUTES) * 60,
  };
}

export function buildClearedSigningHandoffCookieAttributes(): SigningHandoffCookieAttributes {
  return {
    name: SIGNING_HANDOFF_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: SIGNING_HANDOFF_COOKIE_PATH,
    maxAge: 0,
  };
}

export type CreatedInPersonHandoff = {
  handoffId: string;
  /** In-memory only, for the handoff URL / cookie. Never persisted or logged. */
  rawHandoffToken: string;
  expiresAt: string;
  endedPriorSessionIds: string[];
  /** In-memory only, for the device workspace lock cookie. Never persisted or logged. */
  rawDeviceLockToken: string;
  deviceLockExpiresAt: string;
};

/**
 * Agent-initiated handoff for one participant of an In Progress Signing.
 *
 * Authorization is the ordinary Signing management check; possession of a
 * Signing UUID is never sufficient.
 */
export async function createInPersonHandoffWithActor(
  actor: SigningActor,
  input: { signingId: unknown; signingParticipantId: unknown; ttlMinutes?: number },
  admin: SupabaseClient,
): Promise<CreatedInPersonHandoff> {
  assertNativeSigningEnabled();

  const summary = await getSigningForActor(actor, input.signingId, admin);
  if (!summary.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }
  if (summary.lifecycleState !== "IN_PROGRESS") {
    throw new SigningError(
      "CONFLICT",
      "In-person signing is only available while a Signing is In Progress.",
    );
  }
  if (!isUuid(input.signingParticipantId)) {
    throw new SigningError("INVALID_INPUT", "Invalid participant id.");
  }

  const ttlMinutes = input.ttlMinutes ?? SIGNING_HANDOFF_TTL_MINUTES;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
    throw new SigningError(
      "INVALID_INPUT",
      "Handoff lifetime must be between 1 and 60 minutes.",
    );
  }

  const { data: participant, error: participantError } = await admin
    .from("signing_participants")
    .select("id, full_name, participant_status")
    .eq("id", input.signingParticipantId)
    .eq("signing_id", summary.id)
    .maybeSingle();
  if (participantError) throw new Error(participantError.message);
  if (!participant || participant.participant_status === "REMOVED") {
    throw new SigningError("NOT_FOUND", "Participant not found.");
  }
  if (participant.participant_status === "FINISHED") {
    throw new SigningError(
      "ALREADY_FINISHED",
      "That participant already finished signing.",
    );
  }
  if (participant.participant_status === "DECLINED") {
    throw new SigningError("DECLINED", "That participant declined to sign.");
  }

  // Handing the device to this participant must end any prior ceremony session
  // they still hold. Mark it SUPERSEDED so an abandoned tab shows the reopen
  // message rather than a generic expiry (accepted work is preserved either way).
  const endedPriorSessionIds = await supersedeActiveCeremonySessions({
    admin,
    signingId: summary.id,
    signingParticipantId: participant.id as string,
    reason: "IN_PERSON_HANDOFF_ISSUED",
    status: "SUPERSEDED",
  });

  // A second outstanding handoff for the same participant would be a second
  // usable entry token; revoke the earlier one.
  const { error: revokePriorError } = await admin
    .from("signing_in_person_handoffs")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: "SUPERSEDED_BY_NEW_HANDOFF",
    })
    .eq("signing_id", summary.id)
    .eq("signing_participant_id", participant.id as string)
    .is("consumed_at", null)
    .is("revoked_at", null);
  if (revokePriorError) throw new Error(revokePriorError.message);

  const rawHandoffToken = generateInPersonHandoffToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  const { data: handoff, error } = await admin
    .from("signing_in_person_handoffs")
    .insert({
      signing_id: summary.id,
      signing_participant_id: participant.id,
      created_by_user_id: actor.userId,
      handoff_token_hash: hashInPersonHandoffToken(rawHandoffToken),
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();
  if (error || !handoff) {
    throw new Error(error?.message ?? "Failed to create in-person handoff.");
  }

  const authorityBundle = await loadSigningAuthorityBundle(
    admin,
    actor,
    summary.id,
  );
  const actorType = authorityBundle
    ? resolveSigningEventActorType(authorityBundle.authority)
    : "PRIMARY_AGENT";
  const responsibleMeta = buildResponsibleContextMetadata({
    responsibleUserId: summary.originalSenderUserId,
    responsibleDisplayName: summary.originalSenderDisplayName,
  });

  const { error: eventError } = await admin.from("signing_events").insert({
    signing_id: summary.id,
    event_type: "IN_PERSON_HANDOFF_ISSUED",
    actor_type: actorType,
    actor_user_id: actor.userId,
    actor_display_name: actor.displayName,
    actor_participant_id: participant.id,
    visibility: "BUSINESS",
    summary: "In-person signing handoff issued",
    // Never the token: only that a handoff exists for this participant.
    details_json: {
      handoffId: handoff.id,
      expiresAt,
      ...(responsibleMeta ?? {}),
    },
  });
  if (eventError) throw new Error(eventError.message);

  // Lock issuer is the authenticated workspace User (agent or TC).
  const deviceLock = await createDeviceHandoffLock({
    admin,
    signingId: summary.id,
    signingParticipantId: participant.id as string,
    agentUserId: actor.userId,
    handoffId: handoff.id as string,
    // Device lock uses its own longer TTL; do not inherit the short entry-token TTL.
  });

  return {
    handoffId: handoff.id as string,
    rawHandoffToken,
    expiresAt: (handoff.expires_at as string | null) ?? expiresAt,
    endedPriorSessionIds,
    rawDeviceLockToken: deviceLock.rawLockToken,
    deviceLockExpiresAt: deviceLock.expiresAt,
  };
}

export type ValidatedInPersonHandoff = {
  handoffId: string;
  signingId: string;
  signingParticipantId: string;
  participantFullName: string;
  signingTitle: string;
  expiresAt: string;
};

function hashesMatch(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length !== left.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * Resolve a raw handoff token to its participant.
 *
 * Returns null for every failure mode (unknown, expired, consumed, revoked,
 * Signing no longer In Progress, participant removed) so possession of a token
 * reveals nothing.
 */
export async function validateInPersonHandoff(
  admin: SupabaseClient,
  rawHandoffToken: unknown,
): Promise<ValidatedInPersonHandoff | null> {
  if (!isWellFormedInPersonHandoffToken(rawHandoffToken)) {
    return null;
  }

  const handoffTokenHash = hashInPersonHandoffToken(rawHandoffToken);
  const { data: handoff, error } = await admin
    .from("signing_in_person_handoffs")
    .select(
      "id, signing_id, signing_participant_id, handoff_token_hash, expires_at, consumed_at, revoked_at",
    )
    .eq("handoff_token_hash", handoffTokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!handoff || !hashesMatch(handoffTokenHash, handoff.handoff_token_hash)) {
    return null;
  }
  if (handoff.consumed_at || handoff.revoked_at) {
    return null;
  }
  const expiresAt = handoff.expires_at as string;
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const [
    { data: signing, error: signingError },
    { data: participant, error: participantError },
  ] = await Promise.all([
    admin
      .from("signings")
      .select("id, title, lifecycle_state")
      .eq("id", handoff.signing_id as string)
      .maybeSingle(),
    admin
      .from("signing_participants")
      .select("id, full_name, participant_status")
      .eq("id", handoff.signing_participant_id as string)
      .eq("signing_id", handoff.signing_id as string)
      .maybeSingle(),
  ]);
  if (signingError) throw new Error(signingError.message);
  if (participantError) throw new Error(participantError.message);

  if (!signing || signing.lifecycle_state !== "IN_PROGRESS") return null;
  if (!participant || participant.participant_status === "REMOVED") return null;

  return {
    handoffId: handoff.id as string,
    signingId: handoff.signing_id as string,
    signingParticipantId: handoff.signing_participant_id as string,
    participantFullName: participant.full_name as string,
    signingTitle: signing.title as string,
    expiresAt,
  };
}

/** Single-use: consumed at affirmation, guarded so a replay cannot re-consume. */
export async function consumeInPersonHandoff(options: {
  admin: SupabaseClient;
  signingId: string;
  handoffId: string;
}): Promise<boolean> {
  const { data, error } = await options.admin
    .from("signing_in_person_handoffs")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", options.handoffId)
    .eq("signing_id", options.signingId)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
