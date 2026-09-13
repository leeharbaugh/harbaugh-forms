/** Development-only validation for F9 atomic audit logging. */
import { createClient } from "@supabase/supabase-js";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing ${name}`);
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) fail(`Refusing to run outside development (${url})`);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) fail("Need anon/publishable and service/secret keys");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const browser = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: settings, error: settingsError } = await admin
    .from("audit_settings")
    .select("id, ordinary_logging_enabled, last_changed_by_user_id, last_changed_at")
    .eq("status", "ACTIVE")
    .single();
  if (settingsError || !settings) fail(`Could not load audit settings: ${settingsError?.message}`);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: "lee@leeharbaugh.com" });
  if (linkError || !link?.properties?.hashed_token) fail(`Could not mint browser session: ${linkError?.message}`);
  const { error: verifyError } = await browser.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
  if (verifyError) fail(`Could not verify browser session: ${verifyError.message}`);
  const { data: sessionData } = await browser.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const claimPayload = accessToken ? JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString()) as { sub?: string; role?: string } : null;
  if (claimPayload?.sub !== LEE_USER_ID || claimPayload.role !== "authenticated") {
    fail("Development browser client did not receive an authenticated Lee session");
  }

  try {
    const { error: directWriteError } = await browser
      .from("audit_settings")
      .update({ ordinary_logging_enabled: !settings.ordinary_logging_enabled })
      .eq("id", settings.id);
    const { data: afterDirect } = await admin
      .from("audit_settings")
      .select("ordinary_logging_enabled")
      .eq("id", settings.id)
      .single();
    if (afterDirect?.ordinary_logging_enabled !== settings.ordinary_logging_enabled) {
      fail("Direct browser write changed the audit setting");
    }
    ok(
      directWriteError
        ? `browser direct audit-setting write rejected (${directWriteError.message})`
        : "browser direct audit-setting write was denied by RLS with no affected row",
    );

    const targetEnabled = !settings.ordinary_logging_enabled;
    const { data: eventId, error: rpcError } = await admin.rpc("set_ordinary_audit_logging_enabled", {
      p_enabled: targetEnabled,
      p_actor_user_id: LEE_USER_ID,
      p_actor_display_name: "F9 validation",
      p_actor_role_snapshot: "ADMIN",
    });
    if (rpcError || !eventId) fail(`Trusted atomic change failed: ${rpcError?.message}`);

    const { data: afterRpc } = await admin
      .from("audit_settings")
      .select("ordinary_logging_enabled, last_changed_by_user_id")
      .eq("id", settings.id)
      .single();
    const { data: event, error: eventError } = await admin
      .from("audit_events")
      .select("action, is_mandatory, actor_user_id, target_entity_id")
      .eq("id", eventId)
      .single();
    const expectedAction = targetEnabled ? "audit_logging_enabled" : "audit_logging_disabled";
    if (afterRpc?.ordinary_logging_enabled !== targetEnabled || afterRpc.last_changed_by_user_id !== LEE_USER_ID || eventError || event?.action !== expectedAction || event.is_mandatory !== true || event.actor_user_id !== LEE_USER_ID || event.target_entity_id !== String(settings.id)) {
      fail("Trusted audit-setting change did not persist matching mandatory evidence");
    }
    ok("trusted audit-setting change and mandatory event were recorded together");

    const { error: restoreError } = await admin.rpc("set_ordinary_audit_logging_enabled", {
      p_enabled: settings.ordinary_logging_enabled,
      p_actor_user_id: LEE_USER_ID,
      p_actor_display_name: "F9 validation cleanup",
      p_actor_role_snapshot: "ADMIN",
    });
    if (restoreError) fail(`Could not restore audit setting: ${restoreError.message}`);
    ok("original audit setting restored through the same trusted operation");
  } finally {
    await browser.auth.signOut();
  }

  console.log("\nAll F9 atomic audit-logging development checks passed.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));