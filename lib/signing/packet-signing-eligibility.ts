/**
 * Canonical Packet → Signing eligibility.
 *
 * One rule set for every place a Packet becomes a Signing source: the Packet
 * page's Create Signing control, the Draft source-Packet selector, and the
 * server paths that create a Signing, bind a source Packet, or add its
 * documents. The server is authoritative; the UI only explains the result.
 *
 * Rules (2026-09-22 "owned Packet" eligibility; 2026-10-09 consolidation):
 *   - the Packet exists and is ACTIVE (Packets are ACTIVE or DELETED only);
 *   - the Signing's responsible User owns the Packet: only the owner's
 *     Contacts can become participants, and Packet references are validated
 *     for the owner, so an administrator who can view another agent's Packet
 *     still cannot start a Signing from it;
 *   - creating a Signing also needs the actor's originating brokerage.
 * Existing Signings on the Packet are not a block (Create Signing asks for
 * confirmation), and a Packet without documents may still start a Signing.
 */
import {
  deriveOriginatingOrganizationId,
  type SigningOrganizationMembership,
} from "./eligibility";
import { SigningError, type SigningErrorCode } from "./errors";

export type PacketSigningIneligibleReason =
  | "PACKET_UNAVAILABLE"
  | "PACKET_DELETED"
  | "NOT_PACKET_OWNER"
  | "NO_ACTIVE_ORGANIZATION"
  | "PRIMARY_ORGANIZATION_REQUIRED";

export type PacketSigningEligibility =
  | { eligible: true; reasonCode: null; message: null }
  | {
      eligible: false;
      reasonCode: PacketSigningIneligibleReason;
      message: string;
    };

export type PacketEligibilityRow = {
  owner_user_id: string | null;
  status: string;
};

/** The only Packet status that can be a Signing source. */
export const SIGNING_SOURCE_PACKET_STATUS = "ACTIVE";

const MESSAGES: Record<PacketSigningIneligibleReason, string> = {
  PACKET_UNAVAILABLE: "The Packet is not available.",
  PACKET_DELETED: "This Packet is deleted. Restore it to create a Signing.",
  NOT_PACKET_OWNER: "Only the Packet's owner can create a Signing from it.",
  NO_ACTIVE_ORGANIZATION:
    "An active brokerage membership is required to create a Signing.",
  PRIMARY_ORGANIZATION_REQUIRED:
    "Set a primary organization before creating a Signing.",
};

const ELIGIBLE: PacketSigningEligibility = {
  eligible: true,
  reasonCode: null,
  message: null,
};

function ineligible(
  reasonCode: PacketSigningIneligibleReason,
): PacketSigningEligibility {
  return { eligible: false, reasonCode, message: MESSAGES[reasonCode] };
}

/** May this Packet be the source of a Signing whose responsible User is `ownerUserId`? */
export function packetSourceEligibility(
  packet: PacketEligibilityRow | null,
  ownerUserId: string,
): PacketSigningEligibility {
  if (!packet) return ineligible("PACKET_UNAVAILABLE");
  if (packet.status === "DELETED") return ineligible("PACKET_DELETED");
  if (packet.status !== SIGNING_SOURCE_PACKET_STATUS) {
    return ineligible("PACKET_UNAVAILABLE");
  }
  if (packet.owner_user_id !== ownerUserId) return ineligible("NOT_PACKET_OWNER");
  return ELIGIBLE;
}

/** May `actor` create a new Signing from this Packet? */
export function getPacketSigningEligibility(input: {
  packet: PacketEligibilityRow | null;
  actor: {
    userId: string;
    profile: { primary_organization_id: string | null };
    memberships: readonly SigningOrganizationMembership[];
  };
}): PacketSigningEligibility {
  const source = packetSourceEligibility(input.packet, input.actor.userId);
  if (!source.eligible) return source;
  try {
    deriveOriginatingOrganizationId({
      primaryOrganizationId: input.actor.profile.primary_organization_id,
      memberships: input.actor.memberships,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NO_ACTIVE_ORGANIZATION") return ineligible("NO_ACTIVE_ORGANIZATION");
    if (code === "AMBIGUOUS_ORGANIZATION") {
      return ineligible("PRIMARY_ORGANIZATION_REQUIRED");
    }
    throw error;
  }
  return ELIGIBLE;
}

const ERROR_CODES: Record<PacketSigningIneligibleReason, SigningErrorCode> = {
  PACKET_UNAVAILABLE: "INVALID_PACKET",
  PACKET_DELETED: "INVALID_PACKET",
  NOT_PACKET_OWNER: "FORBIDDEN",
  NO_ACTIVE_ORGANIZATION: "INELIGIBLE_ORGANIZATION",
  PRIMARY_ORGANIZATION_REQUIRED: "INELIGIBLE_ORGANIZATION",
};

/** Throw the server error for an ineligible result; no-op when eligible. */
export function assertPacketSigningEligible(
  eligibility: PacketSigningEligibility,
): void {
  if (eligibility.eligible) return;
  throw new SigningError(ERROR_CODES[eligibility.reasonCode], eligibility.message);
}
