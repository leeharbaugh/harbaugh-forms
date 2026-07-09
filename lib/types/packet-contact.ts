import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact } from "@/lib/types/contact";
import { formatContactDisplayName } from "@/lib/types/contact";
import type { PacketWorkflowType } from "@/lib/types/packet-workflow";

export type PacketContactRole =
  | "PRIMARY"
  | "CO_CLIENT"
  | "SPOUSE"
  | "POWER_OF_ATTORNEY"
  | "BUYER"
  | "TENANT"
  | "SELLER"
  | "LANDLORD"
  | "OTHER";

export type PacketContact = {
  id: number;
  packet_id: number;
  contact_id: number;
  packet_role: PacketContactRole;
  sort_order: number;
  create_date: string;
  update_date: string;
  status: string;
  contacts?: Contact | null;
};

export type PacketContactAssignment = {
  contactId: number;
  packetRole: PacketContactRole;
  sortOrder: number;
};

const ROLE_LABELS: Record<PacketContactRole, string> = {
  PRIMARY: "Primary",
  CO_CLIENT: "Co-client",
  SPOUSE: "Spouse",
  POWER_OF_ATTORNEY: "Power of attorney",
  BUYER: "Buyer",
  TENANT: "Tenant",
  SELLER: "Seller",
  LANDLORD: "Landlord",
  OTHER: "Other",
};

export const PACKET_CONTACT_ROLES: PacketContactRole[] = [
  "PRIMARY",
  "CO_CLIENT",
  "SPOUSE",
  "POWER_OF_ATTORNEY",
  "BUYER",
  "TENANT",
  "SELLER",
  "LANDLORD",
  "OTHER",
];

/** Roles treated as buyers/clients on buyer/tenant representation agreements. */
export const BUYER_CLIENT_PACKET_ROLES: PacketContactRole[] = [
  "BUYER",
  "CO_CLIENT",
  "SPOUSE",
  "TENANT",
  "PRIMARY",
];

export function isBuyerClientPacketRole(role: PacketContactRole): boolean {
  return BUYER_CLIENT_PACKET_ROLES.includes(role);
}

export function formatPacketContactRole(role: PacketContactRole): string {
  return ROLE_LABELS[role];
}

export function getPacketContactRolesForWorkflow(
  workflow: PacketWorkflowType | null,
): PacketContactRole[] {
  switch (workflow) {
    case "buyer_rep":
      return ["BUYER", "CO_CLIENT", "SPOUSE", "TENANT", "OTHER"];
    case "listing":
      return ["SELLER", "CO_CLIENT", "SPOUSE", "LANDLORD", "OTHER"];
    case "contract_offer":
      return ["PRIMARY", "CO_CLIENT", "BUYER", "SELLER", "OTHER"];
    default:
      return PACKET_CONTACT_ROLES;
  }
}

export function getDefaultPacketRole(
  workflow: PacketWorkflowType,
  index: number,
): PacketContactRole {
  switch (workflow) {
    case "buyer_rep":
      return index === 0 ? "BUYER" : "CO_CLIENT";
    case "listing":
      return index === 0 ? "SELLER" : "CO_CLIENT";
    case "contract_offer":
      return index === 0 ? "PRIMARY" : "CO_CLIENT";
  }
}

export function buildPacketContactAssignments(
  workflow: PacketWorkflowType,
  contactIds: number[],
): PacketContactAssignment[] {
  return contactIds.map((contactId, index) => ({
    contactId,
    packetRole: getDefaultPacketRole(workflow, index),
    sortOrder: index,
  }));
}

/** Roles commonly used for seller-side parties on residential contracts. */
export const SELLER_SIDE_PACKET_ROLES: PacketContactRole[] = [
  "SELLER",
  "CO_CLIENT",
  "SPOUSE",
  "LANDLORD",
];

/** Roles commonly used for buyer-side parties on residential contracts. */
export const BUYER_SIDE_PACKET_ROLES: PacketContactRole[] = [
  "BUYER",
  "CO_CLIENT",
  "SPOUSE",
  "TENANT",
  "PRIMARY",
];

export function getOrderedContactsByPacketRoles(
  packetContacts: PacketContact[],
  roles: PacketContactRole[],
): Contact[] {
  const roleSet = new Set(roles);

  return sortPacketContacts(
    packetContacts.filter(
      (row) =>
        row.status === "ACTIVE" &&
        row.contacts &&
        roleSet.has(row.packet_role),
    ),
  ).map((row) => row.contacts as Contact);
}

export function getOrderedSellerContacts(
  packetContacts: PacketContact[],
): Contact[] {
  return getOrderedContactsByPacketRoles(
    packetContacts,
    SELLER_SIDE_PACKET_ROLES,
  );
}

export function getOrderedBuyerContacts(
  packetContacts: PacketContact[],
): Contact[] {
  return getOrderedContactsByPacketRoles(
    packetContacts,
    BUYER_SIDE_PACKET_ROLES,
  );
}

export type NumberedPacketContactRolePrefix =
  | "buyer"
  | "seller"
  | "tenant"
  | "landlord";

/** Nth active party for buyer_1/buyer_2, seller_1/seller_2, etc. (by sort_order). */
export function getOrderedContactsForNumberedRolePrefix(
  packetContacts: PacketContact[],
  prefix: NumberedPacketContactRolePrefix,
): Contact[] {
  switch (prefix) {
    case "buyer":
      return getOrderedBuyerContacts(packetContacts);
    case "seller":
      return getOrderedSellerContacts(packetContacts);
    case "tenant":
      return getOrderedContactsByPacketRoles(packetContacts, [
        "TENANT",
        "CO_CLIENT",
        "SPOUSE",
        "PRIMARY",
        "OTHER",
      ]);
    case "landlord":
      return getOrderedContactsByPacketRoles(packetContacts, [
        "LANDLORD",
        "CO_CLIENT",
        "SPOUSE",
        "OTHER",
      ]);
  }
}

export function getPacketContactByNumberedRoleSlug(
  packetContacts: PacketContact[],
  roleSlug: string,
): Contact | null {
  const normalized = roleSlug.trim().toLowerCase();
  const match = normalized.match(/^(buyer|seller|tenant|landlord)_(\d+)$/);
  if (!match) {
    return null;
  }

  const prefix = match[1] as NumberedPacketContactRolePrefix;
  const index = Number(match[2]);
  if (!Number.isInteger(index) || index < 1) {
    return null;
  }

  return (
    getOrderedContactsForNumberedRolePrefix(packetContacts, prefix)[index - 1] ??
    null
  );
}

export function formatJoinedContactNames(contacts: Contact[]): string {
  return contacts
    .map((contact) => formatContactDisplayName(contact))
    .filter(Boolean)
    .join(", ");
}

export function getOrderedPacketContactNames(
  packetContacts: Pick<PacketContact, "sort_order" | "status" | "contacts">[],
): string {
  const activeContacts = packetContacts
    .filter((row) => row.status === "ACTIVE" && row.contacts)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (activeContacts.length === 0) {
    return "Unnamed packet";
  }

  return activeContacts
    .map((row) => formatContactDisplayName(row.contacts as Contact))
    .join(" & ");
}

export function sortPacketContacts<
  T extends { sort_order?: number; id: number },
>(contacts: T[]): T[] {
  return [...contacts].sort((a, b) => {
    const aOrder = a.sort_order ?? 0;
    const bOrder = b.sort_order ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.id - b.id;
  });
}

/** Active buyer/client packet contacts in display order. */
export function getOrderedBuyerClientPacketContacts(
  packetContacts: PacketContact[],
): PacketContact[] {
  return sortPacketContacts(
    packetContacts.filter(
      (row) =>
        row.status === "ACTIVE" &&
        row.contacts &&
        isBuyerClientPacketRole(row.packet_role),
    ),
  );
}

/** Active buyer/client contacts in display order (buyer/tenant rep agreements). */
export function getOrderedBuyerClientContacts(
  packetContacts: PacketContact[],
): Contact[] {
  return getOrderedBuyerClientPacketContacts(packetContacts).map(
    (row) => row.contacts as Contact,
  );
}

export function getBuyerClientContactAtIndex(
  packetContacts: PacketContact[],
  index: number,
): Contact | null {
  if (!Number.isInteger(index) || index < 1) {
    return null;
  }

  return getOrderedBuyerClientContacts(packetContacts)[index - 1] ?? null;
}

export function getPrimaryBuyerClientContact(
  packetContacts: PacketContact[],
): Contact | null {
  return getBuyerClientContactAtIndex(packetContacts, 1);
}

export function parseBuyerClientIndexSlug(slug: string): number | null {
  const match = slug.trim().toLowerCase().match(/^buyer_client_(\d+)$/);
  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  if (!Number.isInteger(index) || index < 1) {
    return null;
  }

  return index;
}

export async function addPacketContact(
  supabase: SupabaseClient,
  packetId: number,
  contactId: number,
  packetRole: PacketContactRole,
  sortOrder: number,
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("packet_contacts")
    .select("id")
    .eq("packet_id", packetId)
    .eq("contact_id", contactId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    throw new Error("This contact is already assigned to the packet.");
  }

  const { error } = await supabase.from("packet_contacts").insert({
    packet_id: packetId,
    contact_id: contactId,
    packet_role: packetRole,
    sort_order: sortOrder,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePacketContactRole(
  supabase: SupabaseClient,
  packetContactId: number,
  packetRole: PacketContactRole,
): Promise<void> {
  const { error } = await supabase
    .from("packet_contacts")
    .update({ packet_role: packetRole })
    .eq("id", packetContactId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }
}

export async function softDeletePacketContact(
  supabase: SupabaseClient,
  packetContactId: number,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("packet_contacts")
    .select("id, status")
    .eq("id", packetContactId)
    .single();

  if (fetchError || !data) {
    throw new Error("Packet contact not found.");
  }

  if (data.status === "DELETED") {
    throw new Error("Contact assignment is already removed.");
  }

  const { error } = await supabase
    .from("packet_contacts")
    .update({ status: "DELETED" })
    .eq("id", packetContactId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }
}

export async function reorderPacketContact(
  supabase: SupabaseClient,
  packetContactId: number,
  direction: -1 | 1,
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from("packet_contacts")
    .select("id, packet_id, sort_order, status")
    .eq("id", packetContactId)
    .single();

  if (currentError || !current) {
    throw new Error("Packet contact not found.");
  }

  if (current.status !== "ACTIVE") {
    throw new Error("Only active contact assignments can be reordered.");
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("packet_contacts")
    .select("id, sort_order")
    .eq("packet_id", current.packet_id)
    .eq("status", "ACTIVE")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (siblingsError || !siblings) {
    throw new Error(siblingsError?.message ?? "Failed to load packet contacts.");
  }

  const ordered = sortPacketContacts(
    siblings as Array<{ id: number; sort_order: number }>,
  );
  const currentIndex = ordered.findIndex((row) => row.id === packetContactId);
  const swapIndex = currentIndex + direction;

  if (currentIndex < 0 || swapIndex < 0 || swapIndex >= ordered.length) {
    return;
  }

  const currentRow = ordered[currentIndex];
  const swapRow = ordered[swapIndex];

  const { error: firstError } = await supabase
    .from("packet_contacts")
    .update({ sort_order: swapRow.sort_order })
    .eq("id", currentRow.id);

  if (firstError) {
    throw new Error(firstError.message);
  }

  const { error: secondError } = await supabase
    .from("packet_contacts")
    .update({ sort_order: currentRow.sort_order })
    .eq("id", swapRow.id);

  if (secondError) {
    throw new Error(secondError.message);
  }
}

export function validatePacketContactsNotEmpty(
  activeContactCount: number,
): string | null {
  if (activeContactCount === 0) {
    return "At least one contact must remain assigned to the packet.";
  }
  return null;
}
