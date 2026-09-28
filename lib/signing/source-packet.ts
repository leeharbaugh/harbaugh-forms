/**
 * One source Packet per Signing.
 *
 * Selecting a Packet binds `signings.source_packet_id`, scopes Packet document
 * picking to that Packet, and imports its transaction parties as Draft
 * participants (snapshot, no live sync). Switching is allowed only while the
 * Signing holds no Packet-derived documents or participants; it never remaps.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bindSigningSourcePacketIfUnset,
  listIncludedPacketDocumentPacketIds,
} from "./draft-documents";
import { addDraftSigningParticipantWithActor } from "./draft-participants";
import { SigningError } from "./errors";
import { parsePositiveInt, requireManageableDraftSigning } from "./manage";
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

/**
 * Bind (or safely switch) the Signing's source Packet and import that Packet's
 * transaction parties. Existing participants are never deleted or merged;
 * Packet parties already linked by contact id are skipped.
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
    if (signing.source_packet_id == null) {
      await bindSigningSourcePacketIfUnset(admin, signing.id, packetId);
    } else {
      const { allowed, reason } = await assessSourcePacketSwitch(admin, signing);
      if (!allowed) {
        throw new SigningError("INVALID_PACKET", reason ?? SWITCH_BLOCKED_MESSAGE);
      }
      const { data: switched, error: switchError } = await admin
        .from("signings")
        .update({ source_packet_id: packetId })
        .eq("id", signing.id)
        .eq("source_packet_id", signing.source_packet_id)
        .select("id")
        .maybeSingle();
      if (switchError) throw new Error(switchError.message);
      if (!switched) {
        throw new SigningError(
          "CONFLICT",
          "The Signing's source Packet changed. Reload and try again.",
        );
      }
    }
  }

  const derived = await deriveSigningParticipantsFromPacket(admin, packetId);

  const { data: existing, error: existingError } = await admin
    .from("signing_participants")
    .select("linked_contact_id, participant_status")
    .eq("signing_id", signing.id);
  if (existingError) throw new Error(existingError.message);
  const linkedContactIds = new Set(
    (existing ?? [])
      .filter((row) => row.participant_status !== "REMOVED")
      .map((row) => row.linked_contact_id as number | null)
      .filter((id): id is number => id != null),
  );

  let addedParticipantCount = 0;
  let skippedExistingParticipantCount = 0;
  for (const party of derived.participants) {
    if (linkedContactIds.has(party.linkedContactId)) {
      skippedExistingParticipantCount += 1;
      continue;
    }
    await addDraftSigningParticipantWithActor(
      actor,
      {
        signingId: signing.id,
        fullName: party.fullName,
        email: party.email,
        optionalRole: party.optionalRole,
        linkedContactId: party.linkedContactId,
        signingCapacityMode: "PERSONAL",
      },
      admin,
    );
    linkedContactIds.add(party.linkedContactId);
    addedParticipantCount += 1;
  }

  return {
    sourcePacketId: packetId,
    addedParticipantCount,
    skippedExistingParticipantCount,
    reviewNote: derived.reviewNote,
  };
}
