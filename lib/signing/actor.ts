import "server-only";

import { assertNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { SigningError } from "@/lib/signing/errors";
import {
  hasSigningAccountAccess,
  type SigningOrganizationMembership,
} from "@/lib/signing/eligibility";
import type { SigningActor } from "@/lib/signing/types";
import { formatProfileDisplayName } from "@/lib/types/profile";
import type { Profile } from "@/lib/types/profile";
import { createClient } from "@/lib/supabase/server";

export type { SigningActor };

type MembershipJoinRow = {
  organization_id: string;
  membership_role: "MEMBER" | "ORG_ADMIN";
  status: string;
  organizations:
    | { status: string }
    | { status: string }[]
    | null;
};

/**
 * Resolve the authenticated Signing actor from the server session.
 * Never trusts browser-supplied user, role, or organization identity.
 * Feature gate is enforced before any privileged work.
 *
 * Originating-organization derivation is intentionally NOT required here so
 * multi-org Users can still read/manage Signings they already authority for
 * even when primary organization is unset. Create derives originating org
 * separately from primary/sole active membership.
 */
export async function requireSigningActor(): Promise<SigningActor> {
  assertNativeSigningEnabled();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new SigningError(
      "UNAUTHENTICATED",
      "You must be signed in to use Native Signing.",
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new SigningError(
      "FORBIDDEN",
      "No application profile found for this account.",
    );
  }

  const typed = profile as Profile;
  if (!hasSigningAccountAccess(typed)) {
    throw new SigningError(
      "INELIGIBLE_ACCOUNT",
      "This account is not eligible for Native Signing.",
    );
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, membership_role, status, organizations(status)")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const memberships: SigningOrganizationMembership[] = (
    (membershipRows ?? []) as MembershipJoinRow[]
  ).flatMap((row) => {
    const org = Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations;
    if (!org) return [];
    return [
      {
        organizationId: row.organization_id,
        membershipRole: row.membership_role,
        membershipStatus: row.status,
        organizationStatus: org.status,
      },
    ];
  });

  return {
    userId: user.id,
    email: user.email ?? typed.email,
    displayName: formatProfileDisplayName(typed),
    profile: typed,
    memberships,
  };
}
