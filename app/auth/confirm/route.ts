import { processAuthConfirm } from "@/lib/auth/email-otp";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();

  const result = await processAuthConfirm({
    supabase,
    params: {
      tokenHash: searchParams.get("token_hash"),
      type: searchParams.get("type"),
      code: searchParams.get("code"),
      next: searchParams.get("next"),
    },
  });

  redirect(result.redirectTo);
}
