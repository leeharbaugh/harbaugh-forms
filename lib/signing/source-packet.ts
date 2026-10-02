/**
 * One source Packet per Signing.
 *
 * Selecting a Packet binds `signings.source_packet_id`, scopes Packet document
 * picking to that Packet, and imports its transaction parties as Draft
 * participants (snapshot, no live sync). Switching is allowed only while the
 * Signing holds no Packet-derived documents or participants; it never remaps.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listIncludedPacketDocumentPacketIds } from "./draft-documents";
import { SigningError } from "./errors";
import {
  normalizeOptionalText,
  normalizeRequiredText,
  parsePositiveInt,
  requireManageableDraftSigning,
} from "./manage";
import { deriveSigningParticipantsFromPacket } from "./packet-to-signing";
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
  if (
    !packet ||
    packet.status === "DELETED" ||
    packet.owner_user_id !== actor.userId
  ) {
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
      .select("id, label")
      .eq("owner_user_id", actor.userId)
      .neq("status", "DELETED")
      .order("id", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    selectablePackets = (data ?? []).map((row) => ({
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
  }

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
    linked_contact_id: party.linkedContactId,
  }));

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
