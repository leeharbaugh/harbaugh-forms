/**
 * Signing-scoped record of Packet participants a manager deliberately removed
 * from a Draft, keyed by Contact id. Draft auto-add skips these Contacts until
 * the manager restores them. Only this Signing is affected: the Contact, the
 * Packet and other Signings are untouched. Callers must already have
 * authorized Draft management; the table itself rejects non-Draft writes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "signing_draft_packet_participant_suppressions";

export async function suppressedContactIds(
  admin: SupabaseClient,
  signingId: string,
): Promise<Set<number>> {
  const { data, error } = await admin
    .from(TABLE)
    .select("linked_contact_id")
    .eq("signing_id", signingId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.linked_contact_id as number));
}

export async function suppressDraftPacketParticipant(
  admin: SupabaseClient,
  signingId: string,
  contactId: number,
  removedByUserId: string,
): Promise<void> {
  const { error } = await admin.from(TABLE).upsert(
    {
      signing_id: signingId,
      linked_contact_id: contactId,
      removed_by_user_id: removedByUserId,
    },
    { onConflict: "signing_id,linked_contact_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function clearDraftPacketParticipantSuppression(
  admin: SupabaseClient,
  signingId: string,
  contactId: number,
): Promise<boolean> {
  const { data, error } = await admin
    .from(TABLE)
    .delete()
    .eq("signing_id", signingId)
    .eq("linked_contact_id", contactId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** A newly bound source Packet starts with no removed participants. */
export async function clearAllDraftPacketParticipantSuppressions(
  admin: SupabaseClient,
  signingId: string,
): Promise<void> {
  const { error } = await admin.from(TABLE).delete().eq("signing_id", signingId);
  if (error) throw new Error(error.message);
}
