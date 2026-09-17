/**
 * Ceremony / management boundary helpers for Transaction Coordinators.
 *
 * Workspace management authority never implies participant signing authority.
 * TC (and agent) management sessions cannot drive ceremony placement, mark
 * adoption, Finish, or identity affirmation — those require a participant
 * ceremony browser session.
 */
import type { SigningAuthorityResult } from "./authority";

export const TC_CEREMONY_PROHIBITIONS = [
  "affirm_participant_identity",
  "accept_participant_consent",
  "adopt_participant_signature",
  "adopt_participant_initials",
  "place_signature_or_initials",
  "remove_replace_participant_placements_via_workspace",
  "press_finish_for_participant",
  "satisfy_agent_broker_participant_field",
  "sign_on_behalf_of_agent_broker",
  "use_representative_signing_as_tc_shortcut",
  "use_management_session_as_ceremony_session",
] as const;

export type TcCeremonyProhibition = (typeof TC_CEREMONY_PROHIBITIONS)[number];

/**
 * True when the actor's Signing authority is operational (agent/TC/ORG_ADMIN)
 * and therefore must not be treated as ceremony authority.
 */
export function isWorkspaceManagementAuthority(
  authority: SigningAuthorityResult,
): boolean {
  return (
    authority.canManage ||
    authority.activeAssociation != null ||
    authority.activeOperatorAssociation != null ||
    authority.isBrokerageAdministrator
  );
}

/**
 * Management authority is never sufficient for ceremony writes.
 * Call sites that accept only ceremony sessions already enforce this;
 * this predicate documents the invariant for tests and future guards.
 */
export function managementAuthorityAllowsCeremonyWrites(
  authority: SigningAuthorityResult,
): boolean {
  void authority;
  return false;
}
