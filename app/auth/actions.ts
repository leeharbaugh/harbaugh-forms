"use server";

import { isUsableApplicationAccount } from "@/lib/admin/invite-validation";
import { createClient } from "@/lib/supabase/server";
import { assertSupabaseEnv, formatAuthNetworkError } from "@/lib/supabase/env";
import type { Profile } from "@/lib/types/profile";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  try {
    assertSupabaseEnv();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Missing Supabase configuration.",
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Unable to establish a session." };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      await supabase.auth.signOut();
      return { error: profileError.message };
    }

    if (profile) {
      const typed = profile as Profile;
      if (!isUsableApplicationAccount(typed)) {
        await supabase.auth.signOut();
        return {
          error:
            "This account is inactive. Contact an administrator for access.",
        };
      }

      if (typed.onboarding_status === "INVITED") {
        await supabase.rpc("activate_invited_profile");
      }
    }
  } catch (error) {
    return { error: formatAuthNetworkError(error) };
  }

  redirect("/");
}
