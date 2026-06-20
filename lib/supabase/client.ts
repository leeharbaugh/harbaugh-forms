import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, publishableKey } = assertSupabaseEnv();

  return createBrowserClient(url, publishableKey);
}
