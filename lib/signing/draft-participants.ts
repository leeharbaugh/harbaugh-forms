import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import {
  normalizeOptionalText,
  normalizeRequiredText,
  parseNonNegativeInt,
  requireManageableDraftSigning,
} from "./manage";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type SigningParticipantRow = {
  id: string;
  signing_id: string;
  linked_user_id: string | null;
  linked_contact_id: number | null;
  participant_status: string;
  full_name: string;
  email: string;
  optional_role: string | null;
  display_order: number;
};

async function nextParticipantDisplayOrder(
  admin: SupabaseClient,
  signingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("signing_participants")
    .select("display_order")
    .eq("signing_id", signingId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data?.[0]?.display_order as number | undefined) ?? -1) + 1;
}

export async function addDraftSigningParticipantWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    fullName: unknown;
    email: unknown;
    optionalRole?: unknown;
    linkedUserId?: unknown;
    linkedContactId?: unknown;
    displayOrder?: unknown;
  },
  admin: SupabaseClient,
): Promise<SigningParticipantRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  const fullName = normalizeRequiredText(input.fullName, "full name", 200);
  const email = normalizeRequiredText(input.email, "email", 320).toLowerCase();
  const optionalRole = normalizeOptionalText(input.optionalRole, "role", 120);

  let linkedUserId: string | null = null;
  if (input.linkedUserId !== undefined && input.linkedUserId !== null) {
    if (!isUuid(input.linkedUserId)) {
      throw new SigningError("INVALID_INPUT", "Invalid linked User id.");
    }
    linkedUserId = input.linkedUserId;
  }

  let linkedContactId: number | null = null;
  if (input.linkedContactId !== undefined && input.linkedContactId !== null) {
    const raw = input.linkedContactId;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? Number(raw)
          : NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new SigningError("INVALID_INPUT", "Invalid linked Contact id.");
    }
    const { data: contact, error: contactError } = await admin
      .from("contacts")
      .select("id, owner_user_id, status")
      .eq("id", parsed)
      .maybeSingle();
    if (contactError) throw new Error(contactError.message);
    if (!contact || contact.status !== "ACTIVE") {
      throw new SigningError("INVALID_INPUT", "Contact is not available.");
    }
    if (contact.owner_user_id !== actor.userId) {
      throw new SigningError("INVALID_INPUT", "Contact is not available.");
    }
    linkedContactId = parsed;
  }

  const displayOrder =
    input.displayOrder === undefined
      ? await nextParticipantDisplayOrder(admin, signing.id)
      : parseNonNegativeInt(input.displayOrder, "display order");

  const { data, error } = await admin
    .from("signing_participants")
    .insert({
      signing_id: signing.id,
      full_name: fullName,
      email,
      optional_role: optionalRole,
      linked_user_id: linkedUserId,
      linked_contact_id: linkedContactId,
      participant_status: "PENDING",
      display_order: displayOrder,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to add participant.");
  }
  return data as SigningParticipantRow;
}

export async function updateDraftSigningParticipantWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    participantId: unknown;
    fullName?: unknown;
    email?: unknown;
    optionalRole?: unknown;
  },
  admin: SupabaseClient,
): Promise<SigningParticipantRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.participantId)) {
    throw new SigningError("INVALID_INPUT", "Invalid participant id.");
  }

  const patch: Record<string, string | null> = {};
  if (input.fullName !== undefined) {
    patch.full_name = normalizeRequiredText(input.fullName, "full name", 200);
  }
  if (input.email !== undefined) {
    patch.email = normalizeRequiredText(input.email, "email", 320).toLowerCase();
  }
  if (input.optionalRole !== undefined) {
    patch.optional_role = normalizeOptionalText(input.optionalRole, "role", 120);
  }
  if (Object.keys(patch).length === 0) {
    throw new SigningError("INVALID_INPUT", "No participant updates provided.");
  }

  const { data, error } = await admin
    .from("signing_participants")
    .update(patch)
    .eq("id", input.participantId)
    .eq("signing_id", signing.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update participant.");
  }
  return data as SigningParticipantRow;
}

export async function removeDraftSigningParticipantWithActor(
  actor: SigningActor,
  input: { signingId: unknown; participantId: unknown },
  admin: SupabaseClient,
): Promise<void> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.participantId)) {
    throw new SigningError("INVALID_INPUT", "Invalid participant id.");
  }

  await admin
    .from("signing_draft_fields")
    .delete()
    .eq("signing_id", signing.id)
    .eq("signing_participant_id", input.participantId);

  const { error } = await admin
    .from("signing_participants")
    .delete()
    .eq("id", input.participantId)
    .eq("signing_id", signing.id);
  if (error) throw new Error(error.message);
}
