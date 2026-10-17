/**
 * Participant role vocabulary. A role is a preparation label (and the future
 * key for Signing Placement Templates); it is never identity proof, legal
 * authority, or a substitute for representative capacity.
 */
import {
  formatPacketContactRole,
  PACKET_CONTACT_ROLES,
  type PacketContactRole,
} from "@/lib/types/packet-contact";

export const SIGNING_PARTICIPANT_ROLE_CODES = [
  "BUYER",
  "SELLER",
  "TENANT",
  "LANDLORD",
  "AGENT",
  "BROKER",
  "OTHER",
] as const;

export type SigningParticipantRoleCode =
  (typeof SIGNING_PARTICIPANT_ROLE_CODES)[number];

const ROLE_LABELS: Record<SigningParticipantRoleCode, string> = {
  BUYER: "Buyer",
  SELLER: "Seller",
  TENANT: "Tenant",
  LANDLORD: "Landlord",
  AGENT: "Agent",
  BROKER: "Broker",
  OTHER: "Other",
};

export function isSigningParticipantRoleCode(
  value: unknown,
): value is SigningParticipantRoleCode {
  return (
    typeof value === "string" &&
    (SIGNING_PARTICIPANT_ROLE_CODES as readonly string[]).includes(value)
  );
}

export function signingParticipantRoleLabel(code: SigningParticipantRoleCode): string {
  return ROLE_LABELS[code];
}

/** Packet party roles outside the core vocabulary map to OTHER (label keeps detail). */
export function roleCodeForPacketRole(role: PacketContactRole): SigningParticipantRoleCode {
  switch (role) {
    case "BUYER":
    case "SELLER":
    case "TENANT":
    case "LANDLORD":
    case "AGENT":
      return role;
    default:
      return "OTHER";
  }
}

/** Packet roles that name a Signing role directly. */
const DIRECT_PACKET_ROLES: readonly PacketContactRole[] = [
  "BUYER",
  "SELLER",
  "TENANT",
  "LANDLORD",
  "AGENT",
];

export function isDirectPacketRole(role: PacketContactRole): boolean {
  return DIRECT_PACKET_ROLES.includes(role);
}

export type PacketSigningRole = {
  roleCode: SigningParticipantRoleCode;
  optionalRole: string;
  packetRole: PacketContactRole;
};

/**
 * A Contact's Signing role from all of its Packet roles, most explicit source
 * first (the Packet contact row, then a representation-agreement client row).
 * The first direct role wins over any relationship role (Primary, Co-client,
 * Spouse, Power of attorney); the relationship role then stays as the label,
 * never the role. With no direct role, the first role maps to Other.
 */
export function packetSigningRole(
  roles: readonly PacketContactRole[],
): PacketSigningRole {
  if (roles.length === 0) throw new Error("packetSigningRole needs at least one role");
  const direct = roles.find(isDirectPacketRole);
  if (!direct) {
    return {
      roleCode: "OTHER",
      optionalRole: formatPacketContactRole(roles[0]),
      packetRole: roles[0],
    };
  }
  const relationship = roles.find(
    (role) => !isDirectPacketRole(role) && role !== "OTHER",
  );
  return {
    roleCode: roleCodeForPacketRole(direct),
    optionalRole: formatPacketContactRole(relationship ?? direct),
    packetRole: direct,
  };
}

/**
 * True when a participant's role is exactly what a Packet import produces for
 * a Contact, so no manager has edited it in the Draft. A direct role can carry
 * a relationship label only when the Contact is also a representation-agreement
 * client (`agreementRole`), so a manager's edit such as Buyer · Primary on a
 * Packet without an agreement is never mistaken for an import.
 */
export function isPacketImportedRole(
  current: { roleCode: string | null; optionalRole: string | null },
  agreementRole: PacketContactRole | null,
): boolean {
  const matches = (derived: PacketSigningRole) =>
    derived.roleCode === current.roleCode &&
    derived.optionalRole === (current.optionalRole?.trim() || null);
  if (PACKET_CONTACT_ROLES.some((role) => matches(packetSigningRole([role])))) {
    return true;
  }
  if (!agreementRole || !isDirectPacketRole(agreementRole)) return false;
  return PACKET_CONTACT_ROLES.some(
    (role) =>
      !isDirectPacketRole(role) &&
      role !== "OTHER" &&
      matches(packetSigningRole([role, agreementRole])),
  );
}

/**
 * Display text for a participant's role: the vocabulary label, plus the free
 * text label when it adds detail (e.g. "Other · Spouse"). Legacy participants
 * with only free text show that text.
 */
export function participantRoleDisplay(
  roleCode: string | null | undefined,
  optionalRole: string | null | undefined,
): string | null {
  const label = optionalRole?.trim() || null;
  if (!isSigningParticipantRoleCode(roleCode)) return label;
  const base = ROLE_LABELS[roleCode];
  if (!label || label.toLowerCase() === base.toLowerCase()) return base;
  return `${base} · ${label}`;
}
