import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatPacketContactRole,
  type PacketContactRole,
} from "@/lib/types/packet-contact";
import type { Packet } from "@/lib/types/packet";
import type { Property } from "@/lib/types/property";
import {
  formatPacketWorkflowType,
  isPacketWorkflowType,
  type PacketWorkflowType,
} from "@/lib/types/packet-workflow";

export type ContactAssociatedPacketRow = {
  id: number;
  packet_id: number;
  packet_role: PacketContactRole;
  sort_order: number;
  create_date: string;
  update_date: string;
  packets: ContactAssociatedPacketJoin | ContactAssociatedPacketJoin[] | null;
};

type PropertySummary = Pick<
  Property,
  "street_address" | "unit" | "city" | "state" | "zip"
>;

type ContactAssociatedPacketJoin = Pick<
  Packet,
  "id" | "label" | "packet_type" | "property_id" | "status" | "create_date" | "update_date"
> & {
  properties: PropertySummary | PropertySummary[] | null;
};

export type ContactAssociatedPacket = {
  packet: Omit<ContactAssociatedPacketJoin, "properties"> & {
    properties: PropertySummary | null;
  };
  roles: string[];
  assignmentCreateDate: string;
  assignmentUpdateDate: string;
};

export const CONTACT_ASSOCIATED_PACKETS_SELECT = `
  id,
  packet_id,
  packet_role,
  sort_order,
  create_date,
  update_date,
  packets(
    id,
    label,
    packet_type,
    property_id,
    status,
    create_date,
    update_date,
    properties(
      street_address,
      unit,
      city,
      state,
      zip
    )
  )
`;

const NUMBERED_PACKET_ROLES: PacketContactRole[] = [
  "BUYER",
  "SELLER",
  "TENANT",
  "LANDLORD",
];

export function formatContactPacketRoleLabel(
  role: PacketContactRole,
  sortOrder: number,
): string {
  if (NUMBERED_PACKET_ROLES.includes(role)) {
    const slug = role.toLowerCase();
    return `${slug}_${sortOrder + 1}`;
  }

  return formatPacketContactRole(role);
}

function normalizePropertyJoin(
  raw: ContactAssociatedPacketJoin["properties"],
): PropertySummary | null {
  if (!raw) {
    return null;
  }

  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function normalizePacketJoin(
  raw: ContactAssociatedPacketRow["packets"],
): (Omit<ContactAssociatedPacketJoin, "properties"> & {
  properties: PropertySummary | null;
}) | null {
  if (!raw) {
    return null;
  }

  const packet = Array.isArray(raw) ? raw[0] : raw;
  if (!packet) {
    return null;
  }

  return {
    ...packet,
    properties: normalizePropertyJoin(packet.properties),
  };
}

export function groupContactAssociatedPackets(
  rows: ContactAssociatedPacketRow[],
): ContactAssociatedPacket[] {
  const grouped = new Map<number, ContactAssociatedPacket>();

  for (const row of rows) {
    const packet = normalizePacketJoin(row.packets);
    if (!packet || packet.status !== "ACTIVE") {
      continue;
    }

    const roleLabel = formatContactPacketRoleLabel(
      row.packet_role,
      row.sort_order,
    );
    const existing = grouped.get(packet.id);

    if (existing) {
      if (!existing.roles.includes(roleLabel)) {
        existing.roles.push(roleLabel);
      }

      if (row.update_date > existing.assignmentUpdateDate) {
        existing.assignmentUpdateDate = row.update_date;
      }
      if (row.create_date < existing.assignmentCreateDate) {
        existing.assignmentCreateDate = row.create_date;
      }
      continue;
    }

    grouped.set(packet.id, {
      packet,
      roles: [roleLabel],
      assignmentCreateDate: row.create_date,
      assignmentUpdateDate: row.update_date,
    });
  }

  return [...grouped.values()].sort((a, b) => {
    const dateCompare = b.packet.update_date.localeCompare(a.packet.update_date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return b.packet.id - a.packet.id;
  });
}

export async function fetchContactAssociatedPackets(
  supabase: SupabaseClient,
  contactId: number,
): Promise<ContactAssociatedPacket[]> {
  const { data, error } = await supabase
    .from("packet_contacts")
    .select(CONTACT_ASSOCIATED_PACKETS_SELECT)
    .eq("contact_id", contactId)
    .eq("status", "ACTIVE")
    .order("update_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return groupContactAssociatedPackets(
    (data as unknown as ContactAssociatedPacketRow[]) ?? [],
  );
}

export function formatContactAssociatedPacketType(
  packetType: PacketWorkflowType | string | null,
): string {
  if (!packetType || !isPacketWorkflowType(packetType)) {
    return "—";
  }

  return formatPacketWorkflowType(packetType);
}
