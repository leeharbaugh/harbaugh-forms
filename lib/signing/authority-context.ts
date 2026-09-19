/**
 * Load Signing authority inputs (agents + operators + delegations) and evaluate.
 * Trusted-server only; never trust browser-supplied association ids.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateSigningAuthority,
  type SigningAuthorityResult,
  type SigningAuthoritySnapshot,
  type SigningOperatorAssociationSnapshot,
  type SigningOperatorDelegationSnapshot,
} from "./authority";
import type { SigningOrganizationMembership } from "./eligibility";
import type { SigningActor, SigningAgentAssociationRow, SigningRow } from "./types";

export type SigningOperatorAssociationRow = {
  id: string;
  signing_id: string;
  operator_user_id: string;
  operator_role: "TRANSACTION_COORDINATOR";
  operator_display_name: string;
  operator_email: string | null;
  status: string;
  signing_operator_delegation_id: string | null;
  effective_started_at: string;
  effective_ended_at: string | null;
  end_reason: string | null;
  added_by_user_id: string | null;
  ended_by_user_id: string | null;
  create_date: string;
  update_date: string;
};

export type SigningAuthorityBundle = {
  signing: SigningRow;
  associations: SigningAgentAssociationRow[];
  operatorAssociations: SigningOperatorAssociationRow[];
  authority: SigningAuthorityResult;
};

function mapOperatorAssociation(
  row: SigningOperatorAssociationRow,
): SigningOperatorAssociationSnapshot {
  return {
    id: row.id,
    operatorUserId: row.operator_user_id,
    operatorRole: row.operator_role,
    status: row.status,
    effectiveEndedAt: row.effective_ended_at,
    signingOperatorDelegationId: row.signing_operator_delegation_id,
  };
}

export async function loadSigningOperatorAssociations(
  admin: SupabaseClient,
  signingId: string,
): Promise<SigningOperatorAssociationRow[]> {
  const { data, error } = await admin
    .from("signing_operator_associations")
    .select("*")
    .eq("signing_id", signingId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SigningOperatorAssociationRow[];
}

export async function loadDelegationsForOperatorAssociations(
  admin: SupabaseClient,
  operatorAssociations: readonly SigningOperatorAssociationRow[],
): Promise<SigningOperatorDelegationSnapshot[]> {
  const ids = [
    ...new Set(
      operatorAssociations
        .map((row) => row.signing_operator_delegation_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (ids.length === 0) return [];

  const { data, error } = await admin
    .from("signing_operator_delegations")
    .select(
      "id, organization_id, responsible_user_id, delegate_user_id, operator_role, status, revoked_at, effective_ended_at",
    )
    .in("id", ids);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    organizationId: row.organization_id as string,
    responsibleUserId: row.responsible_user_id as string,
    delegateUserId: row.delegate_user_id as string,
    operatorRole: row.operator_role as "TRANSACTION_COORDINATOR",
    status: row.status as string,
    revokedAt: (row.revoked_at as string | null) ?? null,
    effectiveEndedAt: (row.effective_ended_at as string | null) ?? null,
  }));
}

export function buildAuthoritySnapshot(options: {
  signing: SigningRow;
  associations: readonly SigningAgentAssociationRow[];
  operatorAssociations?: readonly SigningOperatorAssociationRow[];
  operatorDelegations?: readonly SigningOperatorDelegationSnapshot[];
}): SigningAuthoritySnapshot {
  return {
    signingId: options.signing.id,
    originatingOrganizationId: options.signing.originating_organization_id,
    lifecycleState: options.signing.lifecycle_state,
    currentPrimaryAgentAssociationId:
      options.signing.current_primary_agent_association_id,
    originalSenderUserId: options.signing.original_sender_user_id,
    associations: options.associations.map((row) => ({
      id: row.id,
      agentUserId: row.agent_user_id,
      associationRole: row.association_role,
      effectiveEndedAt: row.effective_ended_at,
    })),
    operatorAssociations: (options.operatorAssociations ?? []).map(
      mapOperatorAssociation,
    ),
    operatorDelegations: options.operatorDelegations ?? [],
  };
}

export async function evaluateLoadedSigningAuthority(options: {
  signing: SigningRow;
  associations: readonly SigningAgentAssociationRow[];
  operatorAssociations: readonly SigningOperatorAssociationRow[];
  actorUserId: string;
  memberships: readonly SigningOrganizationMembership[];
  admin: SupabaseClient;
}): Promise<SigningAuthorityResult> {
  const operatorDelegations = await loadDelegationsForOperatorAssociations(
    options.admin,
    options.operatorAssociations,
  );
  return evaluateSigningAuthority({
    signing: buildAuthoritySnapshot({
      signing: options.signing,
      associations: options.associations,
      operatorAssociations: options.operatorAssociations,
      operatorDelegations,
    }),
    actorUserId: options.actorUserId,
    memberships: options.memberships,
  });
}

export async function loadSigningAuthorityBundle(
  admin: SupabaseClient,
  actor: SigningActor,
  signingId: string,
): Promise<SigningAuthorityBundle | null> {
  const { data: signing, error: signingError } = await admin
    .from("signings")
    .select("*")
    .eq("id", signingId)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);
  if (!signing) return null;

  const typed = signing as SigningRow;

  const [{ data: associations, error: associationError }, operatorAssociations] =
    await Promise.all([
      admin
        .from("signing_agent_associations")
        .select("*")
        .eq("signing_id", typed.id),
      loadSigningOperatorAssociations(admin, typed.id),
    ]);
  if (associationError) throw new Error(associationError.message);

  const agentAssociations = (associations ??
    []) as SigningAgentAssociationRow[];

  const authority = await evaluateLoadedSigningAuthority({
    signing: typed,
    associations: agentAssociations,
    operatorAssociations,
    actorUserId: actor.userId,
    memberships: actor.memberships,
    admin,
  });

  return {
    signing: typed,
    associations: agentAssociations,
    operatorAssociations,
    authority,
  };
}
