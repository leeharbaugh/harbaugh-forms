/**
 * Participant role vocabulary. A role is a preparation label (and the future
 * key for Signing Placement Templates); it is never identity proof, legal
 * authority, or a substitute for representative capacity.
 */
import type { PacketContactRole } from "@/lib/types/packet-contact";

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
      return role;
    default:
      return "OTHER";
  }
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
