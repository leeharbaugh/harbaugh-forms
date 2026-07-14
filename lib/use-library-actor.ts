"use client";

import {
  isActiveAppAdmin,
  type LibraryActor,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("status, app_role, onboarding_status")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setActor({
          userId: user.id,
          isActiveAdmin: isActiveAppAdmin(profile),
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
