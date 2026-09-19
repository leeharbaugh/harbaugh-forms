/**
 * Native Signing Stage 6 protected per-Signing event chain.
 *
 * Genesis/checkpoint model: historical pre-chain events remain unprotected
 * through `unprotected_prefix_end_sequence`. New events after genesis carry
 * digests + HMAC tags. Secrets never enter the database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGenesisPriorDigest,
  canonicalizeSigningEventV1,
  digestCanonicalEvent,
  EVENT_CHAIN_FORMAT_VERSION,
  normalizeEventOccurredAt,
  sanitizeSigningEventDetails,
} from "./event-chain-canonical";
import {
  hmacSha256Hex,
  loadEventChainKeyringFromEnv,
  resolveEventChainKey,
  safeEqualHex,
  type EventChainKeyring,
  SigningEventChainConfigError,
} from "./event-chain-keys";
import type { SigningEventActorType } from "./event-actor";

export type SigningEventChainState = {
  signingId: string;
  chainFormatVersion: string;
  unprotectedPrefixEndSequence: number;
  genesisPriorDigest: string;
  startedAt: string;
};

export type AppendSigningEventInput = {
  signingId: string;
  eventType: string;
  actorType: SigningEventActorType | string;
  actorUserId?: string | null;
  actorParticipantId?: string | null;
  actorDisplayName?: string | null;
  visibility?: "BUSINESS" | "PARTICIPANT" | "SYSTEM_ADMINISTRATOR";
  packageRevisionId?: string | null;
  signingDocumentVersionId?: string | null;
  signingFieldId?: string | null;
  signingFieldPlacementId?: string | null;
  summary?: string | null;
  detailsJson?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};

export type SigningEventRow = {
  id: string;
  signing_id: string;
  sequence_number: number;
  event_type: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_participant_id: string | null;
  actor_display_name: string | null;
  visibility: string;
  package_revision_id: string | null;
  signing_document_version_id: string | null;
  signing_field_id: string | null;
  signing_field_placement_id: string | null;
  summary: string | null;
  details_json: unknown;
  idempotency_key: string | null;
  create_date: string;
  prior_event_digest: string | null;
  event_digest: string | null;
  integrity_key_id: string | null;
  integrity_authentication_tag: string | null;
};

export type EventChainVerificationResult =
  | { ok: true; throughSequence: number; protectedEventCount: number }
  | {
      ok: false;
      reason:
        | "MISSING_CHAIN_STATE"
        | "UNPROTECTED_GAP"
        | "DIGEST_MISMATCH"
        | "PRIOR_MISMATCH"
        | "TAG_MISMATCH"
        | "MISSING_KEY"
        | "REORDER"
        | "EMPTY";
      sequenceNumber?: number;
      message: string;
    };

const MAX_APPEND_RETRIES = 8;

function mapChainState(row: Record<string, unknown>): SigningEventChainState {
  return {
    signingId: row.signing_id as string,
    chainFormatVersion: row.chain_format_version as string,
    unprotectedPrefixEndSequence: Number(row.unprotected_prefix_end_sequence),
    genesisPriorDigest: row.genesis_prior_digest as string,
    startedAt: row.started_at as string,
  };
}

export async function loadEventChainState(
  admin: SupabaseClient,
  signingId: string,
): Promise<SigningEventChainState | null> {
  const { data, error } = await admin
    .from("signing_event_chain_state")
    .select("*")
    .eq("signing_id", signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapChainState(data as Record<string, unknown>) : null;
}

/**
 * Create genesis/checkpoint if absent. Does not rewrite historical events.
 */
export async function ensureEventChainState(
  admin: SupabaseClient,
  signingId: string,
): Promise<SigningEventChainState> {
  const existing = await loadEventChainState(admin, signingId);
  if (existing) return existing;

  const { data: tip, error: tipError } = await admin
    .from("signing_events")
    .select("sequence_number")
    .eq("signing_id", signingId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tipError) throw new Error(tipError.message);

  const unprotectedPrefixEndSequence = tip
    ? Number(tip.sequence_number)
    : 0;
  const genesisPriorDigest = buildGenesisPriorDigest({
    signingId,
    unprotectedPrefixEndSequence,
  });

  const { data, error } = await admin
    .from("signing_event_chain_state")
    .insert({
      signing_id: signingId,
      chain_format_version: EVENT_CHAIN_FORMAT_VERSION,
      unprotected_prefix_end_sequence: unprotectedPrefixEndSequence,
      genesis_prior_digest: genesisPriorDigest,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    // Concurrent creator won.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      const raced = await loadEventChainState(admin, signingId);
      if (raced) return raced;
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Failed to create event-chain state.");
  return mapChainState(data as Record<string, unknown>);
}

async function loadTipEvent(
  admin: SupabaseClient,
  signingId: string,
): Promise<SigningEventRow | null> {
  const { data, error } = await admin
    .from("signing_events")
    .select("*")
    .eq("signing_id", signingId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SigningEventRow | null) ?? null;
}

async function loadExistingByIdempotency(
  admin: SupabaseClient,
  signingId: string,
  idempotencyKey: string,
): Promise<SigningEventRow | null> {
  const { data, error } = await admin
    .from("signing_events")
    .select("*")
    .eq("signing_id", signingId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SigningEventRow | null) ?? null;
}

function resolvePriorDigest(
  chain: SigningEventChainState,
  tip: SigningEventRow | null,
): { priorDigest: string; nextSequence: number } {
  if (!tip) {
    return {
      priorDigest: chain.genesisPriorDigest,
      nextSequence: chain.unprotectedPrefixEndSequence + 1,
    };
  }
  if (tip.sequence_number < chain.unprotectedPrefixEndSequence) {
    throw new Error("Event tip is behind unprotected prefix end.");
  }
  if (tip.sequence_number === chain.unprotectedPrefixEndSequence) {
    return {
      priorDigest: chain.genesisPriorDigest,
      nextSequence: tip.sequence_number + 1,
    };
  }
  if (!tip.event_digest) {
    throw new Error("Protected chain tip is missing event_digest.");
  }
  return {
    priorDigest: tip.event_digest,
    nextSequence: tip.sequence_number + 1,
  };
}

/**
 * Append one protected Signing event. Retries on concurrent tip races.
 */
export async function appendProtectedSigningEvent(
  admin: SupabaseClient,
  input: AppendSigningEventInput,
  keyring: EventChainKeyring = loadEventChainKeyringFromEnv(),
): Promise<SigningEventRow> {
  if (input.idempotencyKey) {
    const existing = await loadExistingByIdempotency(
      admin,
      input.signingId,
      input.idempotencyKey,
    );
    if (existing) return existing;
  }

  const chain = await ensureEventChainState(admin, input.signingId);
  const sanitizedDetails = sanitizeSigningEventDetails(
    input.detailsJson ?? null,
  );
  const eventOccurredAt = normalizeEventOccurredAt(new Date().toISOString());

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt++) {
    const tip = await loadTipEvent(admin, input.signingId);
    const { priorDigest, nextSequence } = resolvePriorDigest(chain, tip);

    const canonical = canonicalizeSigningEventV1({
      signingId: input.signingId,
      sequenceNumber: nextSequence,
      eventType: input.eventType,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      actorParticipantId: input.actorParticipantId ?? null,
      actorDisplayName: input.actorDisplayName ?? null,
      visibility: input.visibility ?? "BUSINESS",
      packageRevisionId: input.packageRevisionId ?? null,
      signingDocumentVersionId: input.signingDocumentVersionId ?? null,
      signingFieldId: input.signingFieldId ?? null,
      signingFieldPlacementId: input.signingFieldPlacementId ?? null,
      summary: input.summary ?? null,
      detailsJson: sanitizedDetails,
      eventOccurredAt,
      priorEventDigest: priorDigest,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    const eventDigest = digestCanonicalEvent(canonical);
    const key = resolveEventChainKey(keyring, keyring.currentKeyId);
    const tag = hmacSha256Hex(key, eventDigest);

    const { data, error } = await admin
      .from("signing_events")
      .insert({
        signing_id: input.signingId,
        event_type: input.eventType,
        actor_type: input.actorType,
        actor_user_id: input.actorUserId ?? null,
        actor_participant_id: input.actorParticipantId ?? null,
        actor_display_name: input.actorDisplayName ?? null,
        visibility: input.visibility ?? "BUSINESS",
        package_revision_id: input.packageRevisionId ?? null,
        signing_document_version_id: input.signingDocumentVersionId ?? null,
        signing_field_id: input.signingFieldId ?? null,
        signing_field_placement_id: input.signingFieldPlacementId ?? null,
        summary: input.summary ?? null,
        details_json: sanitizedDetails,
        idempotency_key: input.idempotencyKey ?? null,
        create_date: eventOccurredAt,
        prior_event_digest: priorDigest,
        event_digest: eventDigest,
        integrity_key_id: keyring.currentKeyId,
        integrity_authentication_tag: tag,
      })
      .select("*")
      .maybeSingle();

    if (!error && data) {
      const row = data as SigningEventRow;
      if (Number(row.sequence_number) !== nextSequence) {
        // Tip raced past our precomputed sequence; retry with fresh tip.
        lastError = new Error("Protected event sequence race; retrying.");
        continue;
      }
      return row;
    }

    if (error) {
      if (error.code === "23505" || /duplicate key/i.test(error.message)) {
        if (input.idempotencyKey) {
          const existing = await loadExistingByIdempotency(
            admin,
            input.signingId,
            input.idempotencyKey,
          );
          if (existing) return existing;
        }
        lastError = new Error(error.message);
        continue;
      }
      if (/prior_event_digest does not match/i.test(error.message)) {
        lastError = new Error(error.message);
        continue;
      }
      throw new Error(error.message);
    }
    lastError = new Error("Protected event insert returned no row.");
  }

  throw lastError ?? new Error("Protected event append failed after retries.");
}

/**
 * Verify the protected chain through an optional sequence boundary.
 */
export async function verifySigningEventChain(
  admin: SupabaseClient,
  signingId: string,
  options?: {
    throughSequence?: number;
    keyring?: EventChainKeyring;
  },
): Promise<EventChainVerificationResult> {
  let keyring: EventChainKeyring;
  try {
    keyring = options?.keyring ?? loadEventChainKeyringFromEnv();
  } catch (error) {
    if (error instanceof SigningEventChainConfigError) {
      return {
        ok: false,
        reason: "MISSING_KEY",
        message: "Event-chain key configuration is unavailable.",
      };
    }
    throw error;
  }

  const chain = await loadEventChainState(admin, signingId);
  if (!chain) {
    return {
      ok: false,
      reason: "MISSING_CHAIN_STATE",
      message: "Event-chain genesis state is missing for this Signing.",
    };
  }

  const { data: events, error } = await admin
    .from("signing_events")
    .select("*")
    .eq("signing_id", signingId)
    .order("sequence_number", { ascending: true });
  if (error) throw new Error(error.message);

  return verifySigningEventChainRows({
    chain,
    rows: (events ?? []) as SigningEventRow[],
    keyring,
    throughSequence: options?.throughSequence,
  });
}

/**
 * Pure verifier over in-memory rows (DB path + synthetic tamper tests).
 */
export function verifySigningEventChainRows(options: {
  chain: SigningEventChainState;
  rows: SigningEventRow[];
  keyring: EventChainKeyring;
  throughSequence?: number;
}): EventChainVerificationResult {
  const { chain, rows, keyring } = options;

  if (rows.length === 0 && chain.unprotectedPrefixEndSequence === 0) {
    if (options.throughSequence != null && options.throughSequence > 0) {
      return {
        ok: false,
        reason: "EMPTY",
        message: "No events exist through the requested boundary.",
      };
    }
    return { ok: true, throughSequence: 0, protectedEventCount: 0 };
  }

  let expectedSequence = 1;
  let priorDigest = chain.genesisPriorDigest;
  let protectedCount = 0;
  let lastVerified = 0;

  for (const row of rows) {
    if (
      options.throughSequence != null &&
      row.sequence_number > options.throughSequence
    ) {
      break;
    }

    if (row.sequence_number !== expectedSequence) {
      return {
        ok: false,
        reason: "REORDER",
        sequenceNumber: row.sequence_number,
        message: "Event sequence gap or reorder detected.",
      };
    }
    expectedSequence += 1;

    if (row.sequence_number <= chain.unprotectedPrefixEndSequence) {
      lastVerified = row.sequence_number;
      continue;
    }

    if (
      !row.prior_event_digest ||
      !row.event_digest ||
      !row.integrity_key_id ||
      !row.integrity_authentication_tag
    ) {
      return {
        ok: false,
        reason: "UNPROTECTED_GAP",
        sequenceNumber: row.sequence_number,
        message: "Protected-region event is missing integrity fields.",
      };
    }

    if (
      !safeEqualHex(row.prior_event_digest, priorDigest) &&
      row.prior_event_digest !== priorDigest
    ) {
      return {
        ok: false,
        reason: "PRIOR_MISMATCH",
        sequenceNumber: row.sequence_number,
        message: "Prior event digest does not match chain tip.",
      };
    }

    let key: Buffer;
    try {
      key = resolveEventChainKey(keyring, row.integrity_key_id);
    } catch {
      return {
        ok: false,
        reason: "MISSING_KEY",
        sequenceNumber: row.sequence_number,
        message: "Historical event-chain key id is unavailable.",
      };
    }

    const canonical = canonicalizeSigningEventV1({
      signingId: row.signing_id,
      sequenceNumber: Number(row.sequence_number),
      eventType: row.event_type,
      actorType: row.actor_type,
      actorUserId: row.actor_user_id,
      actorParticipantId: row.actor_participant_id,
      actorDisplayName: row.actor_display_name,
      visibility: row.visibility,
      packageRevisionId: row.package_revision_id,
      signingDocumentVersionId: row.signing_document_version_id,
      signingFieldId: row.signing_field_id,
      signingFieldPlacementId: row.signing_field_placement_id,
      summary: row.summary,
      detailsJson: row.details_json,
      eventOccurredAt: normalizeEventOccurredAt(row.create_date),
      priorEventDigest: row.prior_event_digest,
      idempotencyKey: row.idempotency_key,
    });
    const expectedDigest = digestCanonicalEvent(canonical);
    if (expectedDigest !== row.event_digest) {
      return {
        ok: false,
        reason: "DIGEST_MISMATCH",
        sequenceNumber: Number(row.sequence_number),
        message: `Event digest does not match canonical content at sequence ${row.sequence_number}.`,
      };
    }

    const expectedTag = hmacSha256Hex(key, row.event_digest);
    if (
      expectedTag !== row.integrity_authentication_tag &&
      !safeEqualHex(expectedTag, row.integrity_authentication_tag)
    ) {
      return {
        ok: false,
        reason: "TAG_MISMATCH",
        sequenceNumber: row.sequence_number,
        message: "Event authentication tag mismatch.",
      };
    }

    priorDigest = row.event_digest;
    protectedCount += 1;
    lastVerified = row.sequence_number;
  }

  if (
    options.throughSequence != null &&
    lastVerified < options.throughSequence &&
    options.throughSequence > 0
  ) {
    return {
      ok: false,
      reason: "EMPTY",
      message: "Requested sequence boundary exceeds verified events.",
    };
  }

  return {
    ok: true,
    throughSequence: lastVerified,
    protectedEventCount: protectedCount,
  };
}
