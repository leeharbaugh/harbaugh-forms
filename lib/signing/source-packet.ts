/**
 * One source Packet per Signing.
 *
 * Selecting a Packet binds `signings.source_packet_id`, scopes Packet document
 * picking to that Packet, and imports its transaction parties as Draft
 * participants. While Draft, parties added to the Packet later are added
 * automatically (additive, matched by Contact id) unless the manager removed
 * that Contact from this Signing; nothing syncs after activation. Switching
 * is allowed only while the Signing holds no Packet-derived documents or
 * participants; it never remaps.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listIncludedPacketDocumentPacketIds } from "./draft-documents";
import {
  clearAllDraftPacketParticipantSuppressions,
  clearDraftPacketParticipantSuppression,
  suppressedContactIds,
} from "./draft-packet-suppressions";
import { SigningError } from "./errors";
import {
  normalizeOptionalText,
  normalizeRequiredText,
  parsePositiveInt,
  requireManageableDraftSigning,
} from "./manage";
import {
  INELIGIBLE_SOURCE_PACKET_STATUSES,
  packetSourceEligibility,
} from "./packet-signing-eligibility";
import { deriveSigningParticipantsFromPacket } from "./packet-to-signing";
import type { SigningParticipantRoleCode } from "./participant-roles";
import type { SigningActor, SigningRow } from "./types";

export type DraftSourcePacketState = {
  sourcePacket: { id: number; label: string } | null;
  canChangeSourcePacket: boolean;
  changeBlockedReason: string | null;
  selectablePackets: { id: number; label: string }[];
};

export type SelectDraftSourcePacketResult = {
  sourcePacketId: number;
  addedParticipantCount: number;
  skippedExistingParticipantCount: number;
  reviewNote: string | null;
  participants: {
    id: string;
    fullName: string;
    email: string;
    linkedContactId: number | null;
  }[];
};

const SWITCH_BLOCKED_MESSAGE =
  "This Signing already has documents or participants from its source Packet. Start a new Signing to use a different Packet.";

function packetLabel(row: { id: number; label: string | null }): string {
  return row.label?.trim() ? row.label.trim() : `Packet ${row.id}`;
}

async function hasPacketDerivedParticipants(
  admin: SupabaseClient,
  signingId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("signing_participants")
    .select("id", { count: "exact", head: true })
    .eq("signing_id", signingId)
    .neq("participant_status", "REMOVED")
    .not("linked_contact_id", "is", null);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * Whether a bound Signing may move to a different source Packet. Only when no
 * included Packet documents and no Packet-linked participants remain.
 */
async function assessSourcePacketSwitch(
  admin: SupabaseClient,
  signing: SigningRow,
): Promise<{ allowed: boolean; reason: string | null }> {
  if (signing.source_packet_id == null) {
    return { allowed: true, reason: null };
  }
  const packetIds = await listIncludedPacketDocumentPacketIds(admin, signing.id);
  if (packetIds.length > 0) {
    return { allowed: false, reason: SWITCH_BLOCKED_MESSAGE };
  }
  if (await hasPacketDerivedParticipants(admin, signing.id)) {
    return { allowed: false, reason: SWITCH_BLOCKED_MESSAGE };
  }
  return { allowed: true, reason: null };
}

async function requireOwnedPacket(
  actor: SigningActor,
  admin: SupabaseClient,
  packetId: number,
): Promise<{ id: number; label: string | null }> {
  const { data: packet, error } = await admin
    .from("packets")
    .select("id, owner_user_id, status, label")
    .eq("id", packetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!packet || !packetSourceEligibility(packet, actor.userId).eligible) {
    throw new SigningError(
      "INVALID_PACKET",
      "The Packet is not available to this Signing.",
    );
  }
  return { id: packet.id as number, label: (packet.label as string | null) ?? null };
}

export async function loadDraftSourcePacketStateWithActor(
  actor: SigningActor,
  input: { signingId: unknown },
  admin: SupabaseClient,
): Promise<DraftSourcePacketState> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  let sourcePacket: DraftSourcePacketState["sourcePacket"] = null;
  if (signing.source_packet_id != null) {
    const { data, error } = await admin
      .from("packets")
      .select("id, label")
      .eq("id", signing.source_packet_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    sourcePacket = {
      id: signing.source_packet_id,
      label: packetLabel({
        id: signing.source_packet_id,
        label: (data?.label as string | null) ?? null,
      }),
    };
  }

  const { allowed, reason } = await assessSourcePacketSwitch(admin, signing);

  let selectablePackets: DraftSourcePacketState["selectablePackets"] = [];
  if (allowed) {
    const { data, error } = await admin
      .from("packets")
      .select("id, label, owner_user_id, status")
      .eq("owner_user_id", actor.userId)
      .not("status", "in", `(${INELIGIBLE_SOURCE_PACKET_STATUSES.join(",")})`)
      .order("id", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    selectablePackets = (data ?? [])
      .filter((row) => packetSourceEligibility(row, actor.userId).eligible)
      .map((row) => ({
      id: row.id as number,
      label: packetLabel({
        id: row.id as number,
        label: (row.label as string | null) ?? null,
      }),
    }));
  }

  return {
    sourcePacket,
    canChangeSourcePacket: allowed,
    changeBlockedReason: reason,
    selectablePackets,
  };
}

const SELECTION_ERRORS: Record<string, [SigningError["code"], string]> = {
  SOURCE_PACKET_CONFLICT: [
    "CONFLICT",
    "The Signing's source Packet changed. Reload and try again.",
  ],
  SOURCE_PACKET_HAS_DOCUMENTS: ["INVALID_PACKET", SWITCH_BLOCKED_MESSAGE],
  SOURCE_PACKET_HAS_PARTICIPANTS: ["INVALID_PACKET", SWITCH_BLOCKED_MESSAGE],
  SOURCE_PACKET_NOT_DRAFT: [
    "CONFLICT",
    "Only a Draft Signing can change its source Packet.",
  ],
  SOURCE_PACKET_SIGNING_NOT_FOUND: ["NOT_FOUND", "Signing not found."],
};

function selectionError(message: string): Error {
  const key = Object.keys(SELECTION_ERRORS).find((code) =>
    message.includes(code),
  );
  if (!key) return new Error(message);
  const [code, text] = SELECTION_ERRORS[key];
  return new SigningError(code, text);
}

type PacketPartyInsert = {
  full_name: string;
  email: string;
  optional_role: string | null;
  role_code: SigningParticipantRoleCode;
  linked_contact_id: number;
};

/**
 * Eligible Packet parties as participant inserts. Only contacts the actor owns
 * are usable; another owner's contact is never imported.
 */
async function buildPacketParties(
  actor: SigningActor,
  admin: SupabaseClient,
  packetId: number,
): Promise<{ parties: PacketPartyInsert[]; reviewNote: string | null }> {
  const derived = await deriveSigningParticipantsFromPacket(admin, packetId);
  const usable = derived.participants.filter(
    (party) => party.contactOwnerUserId === actor.userId,
  );
  const unavailable = derived.participants.length - usable.length;
  const reviewNote = [
    derived.reviewNote,
    unavailable > 0
      ? `${unavailable} Packet party(ies) were skipped because the contact is not available to you.`
      : null,
  ]
    .filter(Boolean)
    .join(" ") || null;
  const parties = usable.map((party) => ({
    full_name: normalizeRequiredText(party.fullName, "full name", 200),
    email: party.email
      ? normalizeRequiredText(party.email, "email", 320).toLowerCase()
      : "",
    optional_role: normalizeOptionalText(party.optionalRole, "role", 120),
    role_code: party.roleCode,
    linked_contact_id: party.linkedContactId,
  }));
  return { parties, reviewNote };
}

async function linkedContactIds(
  admin: SupabaseClient,
  signingId: string,
): Promise<Set<number>> {
  const { data, error } = await admin
    .from("signing_participants")
    .select("linked_contact_id")
    .eq("signing_id", signingId)
    .neq("participant_status", "REMOVED")
    .not("linked_contact_id", "is", null);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.linked_contact_id as number));
}

/** The bound source Packet when the actor may read it; otherwise null. */
async function ownedSourcePacketId(
  actor: SigningActor,
  admin: SupabaseClient,
  signing: SigningRow,
): Promise<number | null> {
  const packetId = signing.source_packet_id;
  if (packetId == null) return null;
  const { data: packet, error } = await admin
    .from("packets")
    .select("id, owner_user_id, status")
    .eq("id", packetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!packet || !packetSourceEligibility(packet, actor.userId).eligible) {
    return null;
  }
  return packetId;
}

export type DraftPacketAutoAddResult = {
  addedParticipants: { fullName: string; linkedContactId: number }[];
};

/**
 * Draft auto-add from the bound source Packet. Caller must already have
 * authorized Draft management for `signing`. Inserts eligible parties
 * (actor-owned Contacts only) whose Contact is neither linked nor
 * deliberately removed from this Signing. Matched by Contact id only. Never
 * deletes, merges or overwrites participants; ad hoc and Include me /
 * Include broker participants are untouched. Does nothing once a package
 * revision exists or the Signing leaves Draft.
 *
 * An automatic add (not a Restore) marks its rows `auto_added_from_packet_at`
 * in the same transaction as the insert, so the notice never depends on
 * which request performed the add.
 */
export async function autoAddDraftPacketParticipants(
  actor: SigningActor,
  admin: SupabaseClient,
  signing: SigningRow,
  options: { onlyContactId?: number } = {},
): Promise<DraftPacketAutoAddResult> {
  if (
    signing.lifecycle_state !== "DRAFT" ||
    signing.current_package_revision_id != null
  ) {
    return { addedParticipants: [] };
  }
  const packetId = await ownedSourcePacketId(actor, admin, signing);
  if (packetId == null) return { addedParticipants: [] };

  const [{ parties }, existing, suppressed] = await Promise.all([
    buildPacketParties(actor, admin, packetId),
    linkedContactIds(admin, signing.id),
    suppressedContactIds(admin, signing.id),
  ]);
  const candidates = parties.filter(
    (party) =>
      !existing.has(party.linked_contact_id) &&
      !suppressed.has(party.linked_contact_id) &&
      (options.onlyContactId === undefined ||
        party.linked_contact_id === options.onlyContactId),
  );
  if (candidates.length === 0) return { addedParticipants: [] };

  const autoAdded = options.onlyContactId === undefined;
  const { error } = await admin.rpc("signing_select_source_packet", {
    p_signing_id: signing.id,
    p_expected_source_packet_id: packetId,
    p_packet_id: packetId,
    p_parties: candidates.map((party) => ({ ...party, auto_added: autoAdded })),
  });
  if (error) {
    if (
      error.message.includes("SOURCE_PACKET_NOT_DRAFT") ||
      error.message.includes("SOURCE_PACKET_CONFLICT")
    ) {
      return { addedParticipants: [] };
    }
    throw selectionError(error.message);
  }

  const after = await linkedContactIds(admin, signing.id);
  return {
    addedParticipants: candidates
      .filter((party) => after.has(party.linked_contact_id))
      .map((party) => ({
        fullName: party.full_name,
        linkedContactId: party.linked_contact_id,
      })),
  };
}

/**
 * Draft notice: participants Draft auto-add inserted that are still on this
 * Signing (current names), from the marker written with the insert.
 */
export async function listDraftPacketAutoAddedParticipantNames(
  admin: SupabaseClient,
  signingId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("signing_participants")
    .select("full_name")
    .eq("signing_id", signingId)
    .neq("participant_status", "REMOVED")
    .not("auto_added_from_packet_at", "is", null)
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.full_name));
}

export type DraftRemovedPacketParticipants = {
  available: boolean;
  removedParticipants: {
    fullName: string;
    roleCode: SigningParticipantRoleCode;
    optionalRole: string | null;
    linkedContactId: number;
  }[];
};

/**
 * Read-only: source-Packet parties the manager removed from this Draft that
 * the Packet still lists (drives the Restore list).
 */
export async function loadDraftRemovedPacketParticipantsWithActor(
  actor: SigningActor,
  input: { signingId: unknown },
  admin: SupabaseClient,
): Promise<DraftRemovedPacketParticipants> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  const packetId = await ownedSourcePacketId(actor, admin, signing);
  if (packetId == null) return { available: false, removedParticipants: [] };

  const [{ parties }, existing, suppressed] = await Promise.all([
    buildPacketParties(actor, admin, packetId),
    linkedContactIds(admin, signing.id),
    suppressedContactIds(admin, signing.id),
  ]);
  return {
    available: true,
    removedParticipants: parties
      .filter(
        (party) =>
          suppressed.has(party.linked_contact_id) &&
          !existing.has(party.linked_contact_id),
      )
      .map((party) => ({
        fullName: party.full_name,
        roleCode: party.role_code,
        optionalRole: party.optional_role,
        linkedContactId: party.linked_contact_id,
      })),
  };
}

/**
 * Restore a deliberately removed Packet participant: clears this Signing's
 * suppression for the Contact and adds it back from the Packet.
 */
export async function restoreDraftPacketParticipantWithActor(
  actor: SigningActor,
  input: { signingId: unknown; contactId: unknown },
  admin: SupabaseClient,
): Promise<DraftPacketAutoAddResult> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  const contactId = parsePositiveInt(input.contactId, "Contact id");
  const packetId = signing.source_packet_id;
  if (packetId == null) {
    throw new SigningError("INVALID_PACKET", "Choose a source Packet first.");
  }
  await requireOwnedPacket(actor, admin, packetId);
  const { parties } = await buildPacketParties(actor, admin, packetId);
  if (!parties.some((party) => party.linked_contact_id === contactId)) {
    throw new SigningError(
      "INVALID_INPUT",
      "This participant is no longer on the source Packet.",
    );
  }
  await clearDraftPacketParticipantSuppression(admin, signing.id, contactId);
  return autoAddDraftPacketParticipants(actor, admin, signing, {
    onlyContactId: contactId,
  });
}

/**
 * Select the Signing's source Packet and import that Packet's transaction
 * parties as one operation. Parties are derived and validated first; the bind
 * (compare-and-set against the source read here) and the participant inserts
 * then commit together under the Signing row lock, so a Signing is never bound
 * without its parties or populated from a Packet it is not bound to. Existing
 * participants are never deleted or merged; parties already linked by contact
 * id are skipped. One-time Draft population, no live sync.
 */
export async function selectDraftSourcePacketWithActor(
  actor: SigningActor,
  input: { signingId: unknown; packetId: unknown },
  admin: SupabaseClient,
): Promise<SelectDraftSourcePacketResult> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  const packetId = parsePositiveInt(input.packetId, "Packet id");
  await requireOwnedPacket(actor, admin, packetId);

  if (signing.source_packet_id !== packetId) {
    const { allowed, reason } = await assessSourcePacketSwitch(admin, signing);
    if (!allowed) {
      throw new SigningError("INVALID_PACKET", reason ?? SWITCH_BLOCKED_MESSAGE);
    }
    await clearAllDraftPacketParticipantSuppressions(admin, signing.id);
  }

  const { parties, reviewNote } = await buildPacketParties(actor, admin, packetId);

  const { data, error } = await admin.rpc("signing_select_source_packet", {
    p_signing_id: signing.id,
    p_expected_source_packet_id: signing.source_packet_id,
    p_packet_id: packetId,
    p_parties: parties,
  });
  if (error) throw selectionError(error.message);

  const counts = (data ?? {}) as { added?: number; skipped?: number };
  const { data: rows, error: listError } = await admin
    .from("signing_participants")
    .select("id, full_name, email, linked_contact_id")
    .eq("signing_id", signing.id)
    .neq("participant_status", "REMOVED")
    .order("display_order", { ascending: true });
  if (listError) throw new Error(listError.message);

  return {
    sourcePacketId: packetId,
    addedParticipantCount: counts.added ?? 0,
    skippedExistingParticipantCount: counts.skipped ?? 0,
    reviewNote,
    participants: (rows ?? []).map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      email: row.email as string,
      linkedContactId: (row.linked_contact_id as number | null) ?? null,
    })),
  };
}
