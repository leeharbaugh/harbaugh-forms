import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSigningCapacityLabel,
  isSigningCapacityMode,
  type SigningCapacityLabel,
  type SigningCapacityMode,
} from "./capacity-notices";
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
  signing_capacity_mode: SigningCapacityMode;
  represented_party_name: string | null;
  capacity_label: SigningCapacityLabel | null;
  capacity_wording: string | null;
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

function normalizeEmailOptional(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const email = normalizeRequiredText(value, "email", 320).toLowerCase();
  return email;
}

function parseCapacityFields(input: {
  signingCapacityMode?: unknown;
  representedPartyName?: unknown;
  capacityLabel?: unknown;
  capacityWording?: unknown;
}): {
  signing_capacity_mode: SigningCapacityMode;
  represented_party_name: string | null;
  capacity_label: SigningCapacityLabel | null;
  capacity_wording: string | null;
} {
  const modeRaw = input.signingCapacityMode ?? "PERSONAL";
  if (!isSigningCapacityMode(modeRaw)) {
    throw new SigningError(
      "INVALID_INPUT",
      "Signing capacity must be Personal or Representative.",
    );
  }

  if (modeRaw === "PERSONAL") {
    return {
      signing_capacity_mode: "PERSONAL",
      represented_party_name: null,
      capacity_label: null,
      capacity_wording: null,
    };
  }

  const represented = normalizeRequiredText(
    input.representedPartyName,
    "represented party",
    200,
  );
  if (!isSigningCapacityLabel(input.capacityLabel)) {
    throw new SigningError(
      "INVALID_INPUT",
      "Choose a capacity for representative signing.",
    );
  }
  const wording = normalizeRequiredText(
    input.capacityWording,
    "execution wording",
    400,
  );
  return {
    signing_capacity_mode: "REPRESENTATIVE",
    represented_party_name: represented,
    capacity_label: input.capacityLabel,
    capacity_wording: wording,
  };
}

export async function addDraftSigningParticipantWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    fullName: unknown;
    email?: unknown;
    optionalRole?: unknown;
    linkedUserId?: unknown;
    linkedContactId?: unknown;
    displayOrder?: unknown;
    signingCapacityMode?: unknown;
    representedPartyName?: unknown;
    capacityLabel?: unknown;
    capacityWording?: unknown;
  },
  admin: SupabaseClient,
): Promise<SigningParticipantRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  const fullName = normalizeRequiredText(input.fullName, "full name", 200);
  const email = normalizeEmailOptional(input.email);
  const optionalRole = normalizeOptionalText(input.optionalRole, "role", 120);
  const capacity = parseCapacityFields(input);

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
      ...capacity,
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
    signingCapacityMode?: unknown;
    representedPartyName?: unknown;
    capacityLabel?: unknown;
    capacityWording?: unknown;
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
    patch.email = normalizeEmailOptional(input.email);
  }
  if (input.optionalRole !== undefined) {
    patch.optional_role = normalizeOptionalText(input.optionalRole, "role", 120);
  }
  if (
    input.signingCapacityMode !== undefined ||
    input.representedPartyName !== undefined ||
    input.capacityLabel !== undefined ||
    input.capacityWording !== undefined
  ) {
    const { data: existing, error: existingError } = await admin
      .from("signing_participants")
      .select(
        "signing_capacity_mode, represented_party_name, capacity_label, capacity_wording",
      )
      .eq("id", input.participantId)
      .eq("signing_id", signing.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) {
      throw new SigningError("NOT_FOUND", "Participant not found.");
    }
    const capacity = parseCapacityFields({
      signingCapacityMode:
        input.signingCapacityMode ?? existing.signing_capacity_mode,
      representedPartyName:
        input.representedPartyName !== undefined
          ? input.representedPartyName
          : existing.represented_party_name,
      capacityLabel:
        input.capacityLabel !== undefined
          ? input.capacityLabel
          : existing.capacity_label,
      capacityWording:
        input.capacityWording !== undefined
          ? input.capacityWording
          : existing.capacity_wording,
    });
    Object.assign(patch, capacity);
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

/**
 * Remove a Draft participant (no package evidence yet). Hard-deletes the Draft
 * row and dependent Draft fields. Activated removal is not supported here.
 */
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
