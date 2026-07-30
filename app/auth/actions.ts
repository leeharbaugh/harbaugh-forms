"use server";

import { isUsableApplicationAccount } from "@/lib/admin/invite-validation";
import {
  AUTH_CHANGE_PASSWORD_PATH,
  AUTH_LOGIN_PATH,
} from "@/lib/auth/email-otp";
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

  let forcePasswordChange = false;

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

      if (typed.must_change_password) {
        forcePasswordChange = true;
      }
    }
  } catch (error) {
    return { error: formatAuthNetworkError(error) };
  }

  if (forcePasswordChange) {
    redirect(AUTH_CHANGE_PASSWORD_PATH);
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

    // Clear forced-password flag after a successful Auth password update.
    // Never log or return the password value.
    await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id)
      .eq("must_change_password", true);

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
