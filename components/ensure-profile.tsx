"use client";

import { ensureUserProfile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef } from "react";

export function EnsureProfile() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    const supabase = createClient();
    void ensureUserProfile(supabase).catch((error) => {
      console.error("[EnsureProfile] Failed to ensure profile:", error);
    });
  }, []);

  return null;
}
