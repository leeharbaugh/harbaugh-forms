/**
 * Central Signing event append boundary (Stage 6).
 *
 * Prefer protected event-chain append. Unprotected inserts are allowed only
 * when no chain genesis exists yet and event-chain keys are not configured
 * (legacy Stage 1–5 development fixtures). Once chain state exists, append
 * fails closed without keys.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendProtectedSigningEvent,
  loadEventChainState,
  type AppendSigningEventInput,
  type SigningEventRow,
} from "./event-chain";
import {
  loadEventChainKeyringFromEnv,
  SigningEventChainConfigError,
} from "./event-chain-keys";

export async function appendSigningEvent(
  admin: SupabaseClient,
  input: AppendSigningEventInput,
): Promise<SigningEventRow | null> {
  const existingChain = await loadEventChainState(admin, input.signingId);

  try {
    loadEventChainKeyringFromEnv();
    return await appendProtectedSigningEvent(admin, input);
  } catch (error) {
    if (error instanceof SigningEventChainConfigError) {
      if (existingChain) {
        throw error;
      }
      // Legacy unprotected path for pre-chain development fixtures only.
      const { data, error: insertError } = await admin
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
          details_json: input.detailsJson ?? null,
          idempotency_key: input.idempotencyKey ?? null,
        })
        .select("*")
        .maybeSingle();
      if (insertError) {
        if (
          insertError.code === "23505" ||
          /duplicate key/i.test(insertError.message)
        ) {
          return null;
        }
        throw new Error(insertError.message);
      }
      return (data as SigningEventRow | null) ?? null;
    }
    throw error;
  }
}
