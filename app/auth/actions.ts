"use server";

import { isUsableApplicationAccount } from "@/lib/admin/invite-validation";
import { AUTH_LOGIN_PATH } from "@/lib/auth/email-otp";
import { validateNewPassword } from "@/lib/auth/password-policy";
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

export async function updatePasswordAction(formData: FormData) {
  try {
    assertSupabaseEnv();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Missing Supabase configuration.",
    };
  }

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const policy = validateNewPassword({ password, confirmPassword });
  if (!policy.ok) {
    return { error: policy.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        error:
          "Your session has expired. Open a fresh invitation or password-reset link, then try again.",
        redirectTo: AUTH_LOGIN_PATH,
      };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { error: error.message };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

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
