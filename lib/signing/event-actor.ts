/**
 * Resolve durable Signing event actor_type from evaluated authority.
 * Never hardcode PRIMARY_AGENT for an authenticated operational actor.
 */

import type { SigningAuthorityResult } from "./authority";

export type SigningEventActorType =
  | "PRIMARY_AGENT"
  | "CO_AGENT"
  | "TRANSACTION_COORDINATOR"
  | "BROKERAGE_ADMINISTRATOR"
  | "PARTICIPANT"
  | "SYSTEM_ADMINISTRATOR"
  | "SYSTEM";

/**
 * Precedence when a User qualifies through multiple paths for the action
 * that was authorized:
 * 1. Active agent association (PRIMARY / CO_AGENT) — transaction role
 * 2. Active TC operator association — delegated operational role
 * 3. Originating ORG_ADMIN — brokerage administrative path
 *
 * A User who is both ORG_ADMIN and TC is attributed as TRANSACTION_COORDINATOR
 * when the operation was authorized through TC association; as
 * BROKERAGE_ADMINISTRATOR when authorized only through ORG_ADMIN (no agent/TC
 * association on this Signing). Prefer the association that actually granted
 * management when both TC and ORG_ADMIN apply: TC association wins so
 * certificate "on behalf of" semantics stay accurate.
 */
export function resolveSigningEventActorType(
  authority: SigningAuthorityResult,
): SigningEventActorType {
  if (authority.activeAssociation?.associationRole === "PRIMARY") {
    return "PRIMARY_AGENT";
  }
  if (authority.activeAssociation?.associationRole === "CO_AGENT") {
    return "CO_AGENT";
  }
  if (authority.activeOperatorAssociation) {
    return "TRANSACTION_COORDINATOR";
  }
  if (authority.isBrokerageAdministrator) {
    return "BROKERAGE_ADMINISTRATOR";
  }
  // Fail closed: never invent PRIMARY_AGENT when authority is unresolved.
  throw new Error("SIGNING_EVENT_ACTOR_UNRESOLVED");
}

/**
 * Require a loaded authority result before writing a meaningful Signing event.
 * Call sites must not fall back to PRIMARY_AGENT when the bundle is missing.
 */
export function requireSigningEventActorType(
  authority: SigningAuthorityResult | null | undefined,
): SigningEventActorType {
  if (!authority) {
    throw new Error("SIGNING_EVENT_ACTOR_AUTHORITY_REQUIRED");
  }
  return resolveSigningEventActorType(authority);
}

/** Sanitized responsible-context metadata for "on behalf of" events. */
export function buildResponsibleContextMetadata(options: {
  responsibleUserId: string | null;
  responsibleDisplayName: string | null;
}): Record<string, string> | undefined {
  const meta: Record<string, string> = {};
  if (options.responsibleUserId) {
    meta.responsibleUserId = options.responsibleUserId;
  }
  if (options.responsibleDisplayName) {
    meta.responsibleDisplayName = options.responsibleDisplayName;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}
