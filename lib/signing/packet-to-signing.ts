/**
 * Packet → Signing creation and participant derivation.
 *
 * Source of truth for parties: ACTIVE packet_contacts joined to contacts, plus
 * ACTIVE clients of the Packet's representation agreement (legacy Packets).
 * Does not guess representative capacity from roles.
 * Packet Contact role AGENT may become a Signing participant role Agent; that
 * is not co-agent association, Include-me, or brokerage management authority.
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
import {
  assertPacketSigningEligible,
  getPacketSigningEligibility,
} from "./packet-signing-eligibility";
import {
  packetSigningRole,
  type SigningParticipantRoleCode,
} from "./participant-roles";
import { resolvePacketSigningTitle, type SigningActor } from "./types";

/** Roles treated as transaction parties who may need to sign. */
export const PACKET_SIGNING_PARTY_ROLES: readonly PacketContactRole[] = [
  "BUYER",
  "SELLER",
  "TENANT",
  "LANDLORD",
  "AGENT",
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
  roleCode: SigningParticipantRoleCode;
  linkedContactId: number;
  contactOwnerUserId: string | null;
  packetRole: PacketContactRole;
  /** The Contact's role as a representation-agreement client, if any. */
  agreementRole: PacketContactRole | null;
};

function agreementClientRole(agreementType: unknown): PacketContactRole {
  if (agreementType === "BUYER_REP") return "BUYER";
  if (agreementType === "LISTING") return "SELLER";
  return "PRIMARY";
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * A Packet's parties live in ACTIVE packet_contacts and, for Packets created
 * from a representation agreement, in that agreement's ACTIVE clients.
 */
async function loadPacketPartyRows(
  admin: SupabaseClient,
  packetId: number,
): Promise<
  {
    contactId: number;
    role: PacketContactRole;
    contact: Contact | null;
    fromAgreement: boolean;
  }[]
> {
  const { data, error } = await admin
    .from("packet_contacts")
    .select("contact_id, packet_role, sort_order, status, contacts(*)")
    .eq("packet_id", packetId)
    .eq("status", "ACTIVE")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => ({
    contactId: row.contact_id as number,
    role: row.packet_role as PacketContactRole,
    contact: firstJoined(row.contacts as Contact | Contact[] | null),
    fromAgreement: false,
  }));

  const { data: packet, error: packetError } = await admin
    .from("packets")
    .select(
      "representation_agreement_id, representation_agreements(agreement_type, representation_agreement_clients(contact_id, sort_order, status, contacts(*)))",
    )
    .eq("id", packetId)
    .maybeSingle();
  if (packetError) throw new Error(packetError.message);

  type AgreementJoin = {
    agreement_type: string;
    representation_agreement_clients:
      | {
          contact_id: number;
          sort_order: number;
          status: string;
          contacts: Contact | Contact[] | null;
        }[]
      | null;
  };
  const agreement = firstJoined(
    packet?.representation_agreements as unknown as
      | AgreementJoin
      | AgreementJoin[]
      | null,
  );
  if (agreement) {
    const role = agreementClientRole(agreement.agreement_type);
    const clients = [...(agreement.representation_agreement_clients ?? [])]
      .filter((link) => link.status === "ACTIVE")
      .sort((a, b) => a.sort_order - b.sort_order || a.contact_id - b.contact_id);
    for (const link of clients) {
      rows.push({
        contactId: link.contact_id,
        role,
        contact: firstJoined(link.contacts),
        fromAgreement: true,
      });
    }
  }

  return rows;
}

/**
 * Deterministic derivation: one participant per contact id, in first-seen
 * order (packet_contacts before agreement clients). The role comes from all of
 * the Contact's rows via `packetSigningRole`: a direct role (Buyer, Seller,
 * Tenant, Landlord, Agent) wins over a relationship role, which stays as the
 * label.
 */
export async function deriveSigningParticipantsFromPacket(
  admin: SupabaseClient,
  packetId: number,
): Promise<{
  participants: DerivedPacketSigningParticipant[];
  reviewNote: string | null;
}> {
  const rows = await loadPacketPartyRows(admin, packetId);

  const allowed = new Set<string>(PACKET_SIGNING_PARTY_ROLES);
  const byContact = new Map<
    number,
    {
      contact: Contact | null;
      roles: PacketContactRole[];
      agreementRole: PacketContactRole | null;
    }
  >();
  for (const row of rows) {
    if (!allowed.has(row.role)) continue;
    let entry = byContact.get(row.contactId);
    if (!entry) {
      entry = { contact: row.contact, roles: [], agreementRole: null };
      byContact.set(row.contactId, entry);
    }
    entry.roles.push(row.role);
    if (row.fromAgreement && entry.agreementRole === null) {
      entry.agreementRole = row.role;
    }
  }

  const participants: DerivedPacketSigningParticipant[] = [];
  let skippedUnnamed = 0;
  for (const [contactId, entry] of byContact) {
    const contact = entry.contact;
    if (!contact || contact.status !== "ACTIVE") continue;
    if (!hasUsableContactDisplayName(contact)) {
      skippedUnnamed += 1;
      continue;
    }
    const role = packetSigningRole(entry.roles);
    participants.push({
      fullName: formatContactDisplayName(contact),
      email: (contact.email ?? "").trim().toLowerCase(),
      optionalRole: role.optionalRole,
      roleCode: role.roleCode,
      linkedContactId: contactId,
      contactOwnerUserId: contact.owner_user_id ?? null,
      packetRole: role.packetRole,
      agreementRole: entry.agreementRole,
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
  assertPacketSigningEligible(getPacketSigningEligibility({ packet, actor }));
  if (!packet) throw new SigningError("INVALID_PACKET", "Invalid Packet.");

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

  const title = resolvePacketSigningTitle(input.title, {
    id: packetId,
    label: packet.label ?? null,
  });

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
        roleCode: party.roleCode,
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
