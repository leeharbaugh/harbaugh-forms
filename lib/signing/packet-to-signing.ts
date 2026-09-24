/**
 * Packet → Signing creation and participant derivation.
 *
 * Source of truth for parties: ACTIVE packet_contacts joined to contacts.
 * Does not guess representative capacity from roles.
 * Does not include agents/brokers/TCs as participants.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatContactDisplayName,
  hasUsableContactDisplayName,
  type Contact,
} from "@/lib/types/contact";
import type { PacketContactRole } from "@/lib/types/packet-contact";
import { addDraftSigningDocumentWithActor } from "./draft-documents";
import { addDraftSigningParticipantWithActor } from "./draft-participants";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { createDraftSigningWithActor } from "./operations";
import type { SigningActor } from "./types";

/** Roles treated as transaction parties who may need to sign. */
export const PACKET_SIGNING_PARTY_ROLES: readonly PacketContactRole[] = [
  "BUYER",
  "SELLER",
  "TENANT",
  "LANDLORD",
  "PRIMARY",
  "CO_CLIENT",
  "SPOUSE",
  "POWER_OF_ATTORNEY",
  "OTHER",
] as const;

export type DerivedPacketSigningParticipant = {
  fullName: string;
  email: string;
  optionalRole: string | null;
  linkedContactId: number;
  packetRole: PacketContactRole;
};

function roleLabel(role: PacketContactRole): string {
  switch (role) {
    case "BUYER":
      return "Buyer";
    case "SELLER":
      return "Seller";
    case "TENANT":
      return "Tenant";
    case "LANDLORD":
      return "Landlord";
    case "PRIMARY":
      return "Primary";
    case "CO_CLIENT":
      return "Co-client";
    case "SPOUSE":
      return "Spouse";
    case "POWER_OF_ATTORNEY":
      return "Power of attorney";
    case "OTHER":
      return "Other";
  }
}

/**
 * Deterministic derivation: one participant per contact id (first role wins
 * for optional_role label; sort_order then id).
 */
export async function deriveSigningParticipantsFromPacket(
  admin: SupabaseClient,
  packetId: number,
): Promise<{
  participants: DerivedPacketSigningParticipant[];
  reviewNote: string | null;
}> {
  const { data, error } = await admin
    .from("packet_contacts")
    .select("contact_id, packet_role, sort_order, status, contacts(*)")
    .eq("packet_id", packetId)
    .eq("status", "ACTIVE")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);

  const allowed = new Set<string>(PACKET_SIGNING_PARTY_ROLES);
  const seenContacts = new Set<number>();
  const participants: DerivedPacketSigningParticipant[] = [];
  let skippedUnnamed = 0;

  for (const row of data ?? []) {
    const role = row.packet_role as PacketContactRole;
    if (!allowed.has(role)) continue;
    const contactId = row.contact_id as number;
    if (seenContacts.has(contactId)) continue;

    const contactRaw = row.contacts;
    const contact = (
      Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
    ) as Contact | null;
    if (!contact || contact.status !== "ACTIVE") continue;
    if (!hasUsableContactDisplayName(contact)) {
      skippedUnnamed += 1;
      continue;
    }

    seenContacts.add(contactId);
    const email = (contact.email ?? "").trim().toLowerCase();
    participants.push({
      fullName: formatContactDisplayName(contact),
      email,
      optionalRole: roleLabel(role),
      linkedContactId: contactId,
      packetRole: role,
    });
  }

  const reviewParts = [
    "Review participants before sending.",
    skippedUnnamed > 0
      ? `${skippedUnnamed} Packet contact(s) were skipped because they have no usable display name.`
      : null,
    "Representative capacity is not inferred from Packet roles — set it during preparation when needed.",
  ].filter(Boolean);

  return {
    participants,
    reviewNote:
      participants.length > 0 || skippedUnnamed > 0
        ? reviewParts.join(" ")
        : "No Packet transaction parties were found. Add participants manually before Send.",
  };
}

export type CreateSigningFromPacketResult = {
  signingId: string;
  title: string;
  documentCount: number;
  participantCount: number;
  reviewNote: string | null;
  existingActiveSigningCount: number;
};

/**
 * Create a mutable Draft Signing from a Packet: provenance, eligible documents,
 * and derived transaction parties. No package revision; no email sent.
 */
export async function createSigningFromPacketWithActor(
  actor: SigningActor,
  input: {
    packetId: unknown;
    title?: unknown;
    /** When true, create even if another DRAFT/IN_PROGRESS Signing exists. */
    confirmDuplicate?: unknown;
  },
  admin: SupabaseClient,
): Promise<CreateSigningFromPacketResult> {
  assertNativeSigningEnabled();

  const raw = input.packetId;
  const packetId =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : NaN;
  if (!Number.isInteger(packetId) || packetId <= 0) {
    throw new SigningError("INVALID_PACKET", "Invalid Packet.");
  }

  const { data: packet, error: packetError } = await admin
    .from("packets")
    .select("id, owner_user_id, status, label")
    .eq("id", packetId)
    .maybeSingle();
  if (packetError) throw new Error(packetError.message);
  if (!packet || packet.status === "DELETED") {
    throw new SigningError("INVALID_PACKET", "The Packet is not available.");
  }
  if (packet.owner_user_id !== actor.userId) {
    throw new SigningError(
      "FORBIDDEN",
      "You can only create a Signing from your own Packet.",
    );
  }

  const { count: activeCount, error: activeError } = await admin
    .from("signings")
    .select("id", { count: "exact", head: true })
    .eq("source_packet_id", packetId)
    .in("lifecycle_state", ["DRAFT", "IN_PROGRESS"]);
  if (activeError) throw new Error(activeError.message);
  const existingActiveSigningCount = activeCount ?? 0;
  if (existingActiveSigningCount > 0 && input.confirmDuplicate !== true) {
    throw new SigningError(
      "CONFIRM_DUPLICATE",
      `This Packet already has ${existingActiveSigningCount} active Signing(s). Confirm to create another.`,
    );
  }

  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : `Signing — ${String(packet.label ?? `Packet ${packetId}`)}`;

  const signing = await createDraftSigningWithActor(
    actor,
    { title, sourcePacketId: packetId },
    admin,
  );

  const { data: forms, error: formError } = await admin
    .from("packet_forms")
    .select(
      "id, document_name, status, availability_state, storage_path, sort_order",
    )
    .eq("packet_id", packetId)
    .eq("status", "ACTIVE")
    .eq("availability_state", "AVAILABLE")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (formError) throw new Error(formError.message);

  let documentCount = 0;
  for (const form of forms ?? []) {
    if (!form.storage_path) continue;
    await addDraftSigningDocumentWithActor(
      actor,
      {
        signingId: signing.id,
        sourcePacketFormId: form.id,
        displayName: form.document_name ?? "Document",
      },
      admin,
    );
    documentCount += 1;
  }

  const derived = await deriveSigningParticipantsFromPacket(admin, packetId);
  let participantCount = 0;
  for (const party of derived.participants) {
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
    participantCount += 1;
  }

  return {
    signingId: signing.id,
    title: signing.title,
    documentCount,
    participantCount,
    reviewNote: derived.reviewNote,
    existingActiveSigningCount,
  };
}
