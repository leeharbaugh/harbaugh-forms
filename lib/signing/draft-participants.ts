import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSigningCapacityLabel,
  isSigningCapacityMode,
  type SigningCapacityLabel,
  type SigningCapacityMode,
} from "./capacity-notices";
import { SigningError } from "./errors";
import {
  isSigningParticipantRoleCode,
  type SigningParticipantRoleCode,
} from "./participant-roles";
import {
  normalizeOptionalText,
  normalizeRequiredText,
  parseNonNegativeInt,
  requireManageableDraftSigning,
} from "./manage";
import type { SigningActor, SigningRow } from "./types";
import { isUuid } from "./types";
import {
  brokerSignerIdentityFromSettings,
  contactSignerIdentity,
  participantIdentitySourceKind,
  userSignerIdentity,
  type ParticipantIdentitySourceKind,
} from "./draft-participant-sync";
import {
  clearDraftPacketParticipantSuppression,
  suppressDraftPacketParticipant,
} from "./draft-packet-suppressions";
import { fetchActiveBrokerageSettings } from "@/lib/types/brokerage-settings";
import type { Contact } from "@/lib/types/contact";

const LINKED_IDENTITY_EDIT_MESSAGE: Record<
  Exclude<ParticipantIdentitySourceKind, "AD_HOC">,
  string
> = {
  CONTACT:
    "This participant's name and email come from the linked Contact. Edit the Contact instead.",
  USER: "Your name and email come from your profile. Edit your profile instead.",
  BROKER:
    "The broker's name and email come from the brokerage profile. Edit the brokerage profile instead.",
};

export type SigningParticipantRow = {
  id: string;
  signing_id: string;
  linked_user_id: string | null;
  linked_contact_id: number | null;
  participant_status: string;
  full_name: string;
  email: string;
  optional_role: string | null;
  role_code: SigningParticipantRoleCode | null;
  linked_brokerage_settings_id: number | null;
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

/** `undefined` leaves the role unchanged; null or "" clears it. */
function parseRoleCode(value: unknown): SigningParticipantRoleCode | null {
  if (value === null || value === "") return null;
  if (!isSigningParticipantRoleCode(value)) {
    throw new SigningError("INVALID_INPUT", "Choose a valid participant role.");
  }
  return value;
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
    roleCode?: unknown;
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

  const optionalRole = normalizeOptionalText(input.optionalRole, "role", 120);
  const roleCode =
    input.roleCode === undefined ? null : parseRoleCode(input.roleCode);
  const capacity = parseCapacityFields(input);

  let fullName: string;
  let email: string;
  let linkedContactId: number | null = null;
  if (input.linkedContactId === undefined || input.linkedContactId === null) {
    fullName = normalizeRequiredText(input.fullName, "full name", 200);
    email = normalizeEmailOptional(input.email);
  } else {
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
      .select("*")
      .eq("id", parsed)
      .maybeSingle();
    if (contactError) throw new Error(contactError.message);
    if (!contact || contact.status !== "ACTIVE") {
      throw new SigningError("INVALID_INPUT", "Contact is not available.");
    }
    if (contact.owner_user_id !== actor.userId) {
      throw new SigningError("INVALID_INPUT", "Contact is not available.");
    }
    const identity = contactSignerIdentity(contact as Contact);
    if (!identity) {
      throw new SigningError(
        "INVALID_INPUT",
        "This Contact needs a name before it can sign.",
      );
    }
    const { count: alreadyLinked, error: linkedError } = await admin
      .from("signing_participants")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", signing.id)
      .eq("linked_contact_id", parsed)
      .neq("participant_status", "REMOVED");
    if (linkedError) throw new Error(linkedError.message);
    if ((alreadyLinked ?? 0) > 0) {
      throw new SigningError(
        "CONFLICT",
        "This Contact is already a participant on this Signing.",
      );
    }
    fullName = identity.fullName;
    email = identity.email;
    linkedContactId = parsed;
    await clearDraftPacketParticipantSuppression(admin, signing.id, parsed);
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
      role_code: roleCode,
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
    roleCode?: unknown;
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

  const { data: current, error: currentError } = await admin
    .from("signing_participants")
    .select("id, linked_contact_id, linked_user_id, linked_brokerage_settings_id")
    .eq("id", input.participantId)
    .eq("signing_id", signing.id)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) {
    throw new SigningError("NOT_FOUND", "Participant not found.");
  }

  const patch: Record<string, string | null> = {};
  if (input.fullName !== undefined || input.email !== undefined) {
    const source = participantIdentitySourceKind(current);
    if (source !== "AD_HOC") {
      throw new SigningError(
        "INVALID_INPUT",
        LINKED_IDENTITY_EDIT_MESSAGE[source],
      );
    }
  }
  if (input.fullName !== undefined) {
    patch.full_name = normalizeRequiredText(input.fullName, "full name", 200);
  }
  if (input.email !== undefined) {
    patch.email = normalizeEmailOptional(input.email);
  }
  if (input.optionalRole !== undefined) {
    patch.optional_role = normalizeOptionalText(input.optionalRole, "role", 120);
  }
  if (input.roleCode !== undefined) {
    patch.role_code = parseRoleCode(input.roleCode);
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
  if (error?.message.includes("SIGNING_PARTICIPANT_IDENTITY_FROZEN")) {
    throw new SigningError(
      "CONFLICT",
      "Participant details are locked once the Signing is sent or started.",
    );
  }
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

  const { data: participant, error: participantError } = await admin
    .from("signing_participants")
    .select("id, linked_contact_id")
    .eq("id", input.participantId)
    .eq("signing_id", signing.id)
    .maybeSingle();
  if (participantError) throw new Error(participantError.message);
  if (!participant) {
    throw new SigningError("NOT_FOUND", "Participant not found.");
  }
  if (participant.linked_contact_id != null) {
    await suppressDraftPacketParticipant(
      admin,
      signing.id,
      participant.linked_contact_id as number,
      actor.userId,
    );
  }

  await admin
    .from("signing_draft_fields")
    .delete()
    .eq("signing_id", signing.id)
    .eq("signing_participant_id", input.participantId);
  const { error: preparedError } = await admin
    .from("signing_draft_prepared_content")
    .delete()
    .eq("signing_id", signing.id)
    .eq("signing_participant_id", input.participantId);
  if (preparedError) throw new Error(preparedError.message);

  const { error } = await admin
    .from("signing_participants")
    .delete()
    .eq("id", input.participantId)
    .eq("signing_id", signing.id);
  if (error) throw new Error(error.message);
}

export type InternalSignerKind = "SELF" | "BROKER";

export type InternalSignerOption = {
  available: boolean;
  alreadyIncluded: boolean;
  fullName: string | null;
  unavailableReason: string | null;
};

export type InternalSignerOptions = {
  self: InternalSignerOption;
  broker: InternalSignerOption;
};

type InternalSignerIdentity = {
  fullName: string;
  email: string;
  roleCode: SigningParticipantRoleCode;
  linkedUserId: string | null;
  linkedBrokerageSettingsId: number | null;
};

/** The signed-in User, from the server session profile (never browser input). */
function selfSignerIdentity(actor: SigningActor): InternalSignerIdentity | null {
  const identity = userSignerIdentity(actor.profile, actor.email);
  if (!identity) return null;
  return {
    ...identity,
    roleCode: "AGENT",
    linkedUserId: actor.userId,
    linkedBrokerageSettingsId: null,
  };
}

/**
 * The broker from the Signing's originating organization's active brokerage
 * profile (the same organization-scoped source Packet fields use). Requires a
 * broker name and email; never another organization's profile.
 */
async function brokerSignerIdentity(
  admin: SupabaseClient,
  signing: SigningRow,
): Promise<InternalSignerIdentity | null> {
  const settings = await fetchActiveBrokerageSettings(
    admin,
    signing.originating_organization_id,
  );
  if (!settings) return null;
  const identity = brokerSignerIdentityFromSettings(settings);
  if (!identity) return null;
  return {
    ...identity,
    roleCode: "BROKER",
    linkedUserId: null,
    linkedBrokerageSettingsId: settings.id,
  };
}

async function findInternalSigner(
  admin: SupabaseClient,
  signingId: string,
  identity: InternalSignerIdentity,
): Promise<SigningParticipantRow | null> {
  let query = admin
    .from("signing_participants")
    .select("*")
    .eq("signing_id", signingId)
    .neq("participant_status", "REMOVED");
  query = identity.linkedUserId
    ? query.eq("linked_user_id", identity.linkedUserId)
    : query.eq("linked_brokerage_settings_id", identity.linkedBrokerageSettingsId!);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SigningParticipantRow | null) ?? null;
}

export async function loadInternalSignerOptionsWithActor(
  actor: SigningActor,
  input: { signingId: unknown },
  admin: SupabaseClient,
): Promise<InternalSignerOptions> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  async function option(
    identity: InternalSignerIdentity | null,
    unavailableReason: string,
  ): Promise<InternalSignerOption> {
    if (!identity) {
      return { available: false, alreadyIncluded: false, fullName: null, unavailableReason };
    }
    const existing = await findInternalSigner(admin, signing.id, identity);
    return {
      available: true,
      alreadyIncluded: existing !== null,
      fullName: identity.fullName,
      unavailableReason: null,
    };
  }

  return {
    self: await option(
      selfSignerIdentity(actor),
      "Your profile needs a name before you can sign.",
    ),
    broker: await option(
      await brokerSignerIdentity(admin, signing),
      "No broker name and email in this organization's brokerage profile.",
    ),
  };
}

/**
 * Add the signed-in User (role Agent) or the organization's broker (role
 * Broker) as an ordinary signing participant. Identity is server-derived;
 * the participant goes through the same ceremony as everyone else. Adding the
 * same User / broker profile twice returns the existing participant.
 */
export async function includeInternalSignerWithActor(
  actor: SigningActor,
  input: { signingId: unknown; kind: unknown },
  admin: SupabaseClient,
): Promise<{ added: boolean; participant: SigningParticipantRow }> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (input.kind !== "SELF" && input.kind !== "BROKER") {
    throw new SigningError("INVALID_INPUT", "Choose who to include as a signer.");
  }
  const identity =
    input.kind === "SELF"
      ? selfSignerIdentity(actor)
      : await brokerSignerIdentity(admin, signing);
  if (!identity) {
    throw new SigningError(
      "INVALID_INPUT",
      input.kind === "SELF"
        ? "Your profile needs a name before you can sign."
        : "This organization's brokerage profile has no broker name and email.",
    );
  }

  const existing = await findInternalSigner(admin, signing.id, identity);
  if (existing) return { added: false, participant: existing };

  const { data, error } = await admin
    .from("signing_participants")
    .insert({
      signing_id: signing.id,
      full_name: identity.fullName,
      email: identity.email,
      role_code: identity.roleCode,
      linked_user_id: identity.linkedUserId,
      linked_brokerage_settings_id: identity.linkedBrokerageSettingsId,
      participant_status: "PENDING",
      display_order: await nextParticipantDisplayOrder(admin, signing.id),
      signing_capacity_mode: "PERSONAL",
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const raced = await findInternalSigner(admin, signing.id, identity);
    if (raced) return { added: false, participant: raced };
  }
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to add participant.");
  }
  return { added: true, participant: data as SigningParticipantRow };
}
