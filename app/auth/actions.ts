"use server";

import { createClient } from "@/lib/supabase/server";
import { assertSupabaseEnv, formatAuthNetworkError } from "@/lib/supabase/env";
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
  } catch (error) {
    return { error: formatAuthNetworkError(error) };
  }

  redirect("/");
}
