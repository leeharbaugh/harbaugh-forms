import type { Profile } from "../types/profile";
import type { SigningOrganizationMembership } from "./eligibility";

export type SigningActor = {
  userId: string;
  email: string | null;
  displayName: string;
  profile: Profile;
  memberships: SigningOrganizationMembership[];
};

/**
 * Shared Stage 2 Native Signing types and input validation helpers.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Matches practical UI title limits; schema is unbounded text with non-blank check. */
export const SIGNING_TITLE_MAX_LENGTH = 200;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalizeSigningTitle(title: unknown): string {
  if (typeof title !== "string") {
    throw new Error("TITLE_REQUIRED");
  }
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("TITLE_REQUIRED");
  }
  if (trimmed.length > SIGNING_TITLE_MAX_LENGTH) {
    throw new Error("TITLE_TOO_LONG");
  }
  return trimmed;
}

export type SigningRow = {
  id: string;
  create_date: string;
  update_date: string;
  originating_organization_id: string;
  source_packet_id: number | null;
  /** Actual User who created the Signing (may be a TC). */
  created_by_user_id?: string | null;
  original_sender_user_id: string | null;
  original_sender_display_name: string;
  original_sender_email: string | null;
  current_primary_agent_association_id: string | null;
  title: string;
  lifecycle_state: string;
  finalization_condition: string;
  current_package_revision_id: string | null;
  frozen_package_revision_id: string | null;
  sender_timezone: string;
  requested_completion_date: string | null;
  reminder_frequency: string;
  reminders_enabled: boolean;
};

export type SigningAgentAssociationRow = {
  id: string;
  signing_id: string;
  agent_user_id: string | null;
  association_role: "PRIMARY" | "CO_AGENT";
  agent_display_name: string;
  agent_email: string | null;
  effective_started_at: string;
  effective_ended_at: string | null;
  end_reason: string | null;
  added_by_user_id: string | null;
  ended_by_user_id: string | null;
};

export type SigningSummary = {
  id: string;
  title: string;
  lifecycleState: string;
  finalizationCondition: string;
  originatingOrganizationId: string;
  sourcePacketId: number | null;
  createdByUserId: string | null;
  originalSenderUserId: string | null;
  originalSenderDisplayName: string;
  originalSenderEmail: string | null;
  currentPrimaryAgentAssociationId: string | null;
  createDate: string;
  updateDate: string;
  canManage: boolean;
  canRead: boolean;
  isBrokerageAdministrator: boolean;
  isTransactionCoordinator: boolean;
  primaryAssociation: {
    id: string;
    agentUserId: string | null;
    associationRole: "PRIMARY" | "CO_AGENT";
    agentDisplayName: string;
    effectiveEndedAt: string | null;
  } | null;
};
