export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return { url, publishableKey };
}

export function assertSupabaseEnv() {
  const { url, publishableKey } = getSupabaseEnv();

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart npm run dev.",
    );
  }

  if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL looks invalid. Copy the Project URL from Supabase Dashboard → Project Settings → API.",
    );
  }

  return { url, publishableKey };
}

export function formatAuthNetworkError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred.";
  }

  if (
    error.message === "Failed to fetch" ||
    error.message.includes("fetch failed") ||
    error.name === "AuthRetryableFetchError"
  ) {
    return "Cannot reach Supabase. Verify NEXT_PUBLIC_SUPABASE_URL in .env.local matches your dashboard Project URL, open that URL's /auth/v1/health in your browser, then restart npm run dev.";
  }

  return error.message;
}
