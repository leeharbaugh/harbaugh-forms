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
  /** Descriptive relationship label only; never a canonical role name. */
  optionalRole: string | null;
  packetRole: PacketContactRole;
};

/** True when a label is a canonical role's name (Buyer, Seller, …, Other). */
export function isCanonicalRoleLabel(label: string | null | undefined): boolean {
  const value = label?.trim().toLowerCase();
  return Boolean(value) && Object.values(ROLE_LABELS).some((name) => name.toLowerCase() === value);
}

/**
 * The label to keep next to a role: trimmed, and dropped when the participant
 * has a role and the label names a canonical role (stale or redundant). A
 * participant without a role keeps legacy free text as is.
 */
export function descriptiveRoleLabel(
  roleCode: string | null | undefined,
  label: string | null | undefined,
): string | null {
  const value = label?.trim() || null;
  if (!value) return null;
  return isSigningParticipantRoleCode(roleCode) && isCanonicalRoleLabel(value) ? null : value;
}

/**
 * A Contact's Signing role from all of its Packet roles, most explicit source
 * first (the Packet contact row, then a representation-agreement client row).
 * The first direct role becomes the role; the first relationship role (Primary,
 * Co-client, Spouse, Power of attorney) becomes the label. A canonical role is
 * never a label. With no direct role, the role is Other.
 */
export function packetSigningRole(
  roles: readonly PacketContactRole[],
): PacketSigningRole {
  if (roles.length === 0) throw new Error("packetSigningRole needs at least one role");
  const direct = roles.find(isDirectPacketRole);
  const relationship = roles.find(
    (role) => !isDirectPacketRole(role) && role !== "OTHER",
  );
  return {
    roleCode: direct ? roleCodeForPacketRole(direct) : "OTHER",
    optionalRole: relationship ? formatPacketContactRole(relationship) : null,
    packetRole: direct ?? roles[0],
  };
}

/**
 * True when a participant's role is exactly what a Packet import produces for
 * a Contact, today or before labels became relationship-only (when a direct
 * role was also stored as its own label, e.g. Seller · "Seller"). Draft role
 * sync uses it, together with `role_overridden_at`, to leave participants a
 * manager edited alone. A direct role carries a relationship label only for a
 * representation-agreement client (`agreementRole`).
 */
export function isPacketImportedRole(
  current: { roleCode: string | null; optionalRole: string | null },
  agreementRole: PacketContactRole | null,
): boolean {
  const label = current.optionalRole?.trim() || null;
  const matches = (roleCode: string, optionalRole: string | null) =>
    roleCode === current.roleCode && optionalRole === label;
  for (const role of PACKET_CONTACT_ROLES) {
    const derived = packetSigningRole([role]);
    if (matches(derived.roleCode, derived.optionalRole)) return true;
    if (matches(roleCodeForPacketRole(role), formatPacketContactRole(role))) return true;
  }
  if (!agreementRole || !isDirectPacketRole(agreementRole)) return false;
  return PACKET_CONTACT_ROLES.some(
    (role) =>
      !isDirectPacketRole(role) &&
      role !== "OTHER" &&
      matches(roleCodeForPacketRole(agreementRole), formatPacketContactRole(role)),
  );
}

/**
 * Display text for a participant's role: the vocabulary label, plus a
 * descriptive relationship label when there is one (e.g. "Buyer · Primary").
 * A label naming a canonical role is never shown next to a role. Legacy
 * participants with only free text show that text.
 */
export function participantRoleDisplay(
  roleCode: string | null | undefined,
  optionalRole: string | null | undefined,
): string | null {
  const label = descriptiveRoleLabel(roleCode, optionalRole);
  if (!isSigningParticipantRoleCode(roleCode)) return label;
  const base = ROLE_LABELS[roleCode];
  return label ? `${base} · ${label}` : base;
}
