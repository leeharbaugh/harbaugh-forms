"use client";

import {
  isActiveAppAdmin,
  type LibraryActor,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

type OrgMembershipRow = {
  organization_id: string;
  membership_role: string;
  status: string;
};

export function useLibraryActor(): {
  actor: LibraryActor | null;
  isLoading: boolean;
} {
  const [actor, setActor] = useState<LibraryActor | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setActor(null);
          setIsLoading(false);
        }
        return;
      }

      const [{ data: profile }, { data: memberships }] = await Promise.all([
        supabase
          .from("profiles")
          .select("status, app_role, onboarding_status")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("organization_members")
          .select("organization_id, membership_role, status")
          .eq("user_id", user.id)
          .eq("status", "ACTIVE"),
      ]);

      const activeMemberships = (memberships ?? []) as OrgMembershipRow[];
      const memberOrganizationIds = activeMemberships.map(
        (row) => row.organization_id,
      );
      const orgAdminOrganizationIds = activeMemberships
        .filter((row) => row.membership_role === "ORG_ADMIN")
        .map((row) => row.organization_id);

      if (!cancelled) {
        setActor({
          userId: user.id,
          isActiveAdmin: isActiveAppAdmin(profile),
          memberOrganizationIds,
          orgAdminOrganizationIds,
        });
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { actor, isLoading };
}
