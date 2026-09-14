/**
 * Development-only validation for F3/F4 account-state enforcement.
 * It uses one disposable user, organization, and packet, then removes them.
 */
import { createClient } from "@supabase/supabase-js";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing ${name}`);
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) fail(`Refusing to run outside development (${url})`);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) fail("Need anon/publishable and service/secret keys");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const browser = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `account-state-${stamp}@example.invalid`;
  const password = `Account-state-${stamp}-temporary-password`;
  let userId: string | null = null;
  let organizationId: string | null = null;
  let packetId: number | null = null;

  try {
    const { data: userData, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError || !userData.user) fail(`Could not create fixture user: ${userError?.message}`);
    userId = userData.user.id;

    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .insert({ name: `Account-state validation ${stamp}`, organization_type: "OTHER", status: "ACTIVE" })
      .select("id")
      .single();
    if (organizationError || !organization) fail(`Could not create fixture organization: ${organizationError?.message}`);
    organizationId = organization.id as string;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId, email, first_name: "Account", last_name: "State", display_name: "Account State Validator",
      app_role: "USER", status: "ACTIVE", onboarding_status: "ACTIVE", must_change_password: false,
      primary_organization_id: organizationId,
    });
    if (profileError) fail(`Could not prepare fixture profile: ${profileError.message}`);
    const { error: membershipError } = await admin.from("organization_members").insert({
      organization_id: organizationId, user_id: userId, membership_role: "MEMBER", status: "ACTIVE",
    });
    if (membershipError) fail(`Could not prepare fixture membership: ${membershipError.message}`);

    const { data: packet, error: packetError } = await admin.from("packets").insert({
      label: `Account-state validation ${stamp}`, packet_type: "custom", status: "ACTIVE", owner_user_id: userId,
    }).select("id, label").single();
    if (packetError || !packet) fail(`Could not create fixture packet: ${packetError?.message}`);
    packetId = packet.id as number;
    const originalLabel = packet.label as string;

    const { error: signInError } = await browser.auth.signInWithPassword({ email, password });
    if (signInError) fail(`Could not sign in fixture user: ${signInError.message}`);

    const { data: activePackets, error: activeReadError } = await browser.from("packets").select("id").eq("id", packetId);
    if (activeReadError || activePackets?.length !== 1) fail("Active account could not read its own packet");
    const { data: activeMembership } = await browser.rpc("is_active_organization_member", { p_organization_id: organizationId });
    if (activeMembership !== true) fail("Active organization membership predicate was not true");
    ok("active account and active organization retain intended access");

    const { error: forceFlagError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
    if (forceFlagError) fail(`Could not force password change: ${forceFlagError.message}`);
    const { error: clearAttemptError } = await browser.from("profiles").update({ must_change_password: false }).eq("id", userId);
    if (!clearAttemptError) fail("Browser client cleared its forced-password flag directly");
    const { data: forcedPackets, error: forcedReadError } = await browser.from("packets").select("id").eq("id", packetId);
    if (forcedReadError || (forcedPackets?.length ?? 0) !== 0) fail("Forced-password account retained packet read access");
    const { error: forcedWriteError } = await browser.from("packets").update({ label: "forbidden forced-password write" }).eq("id", packetId);
    const { data: afterForcedWrite } = await admin.from("packets").select("label").eq("id", packetId).single();
    if ((!forcedWriteError && afterForcedWrite?.label !== originalLabel) || afterForcedWrite?.label !== originalLabel) fail("Forced-password account changed packet data");
    ok("forced-password account cannot clear its flag or access packet data");

    const { error: clearByTrustedPathError } = await admin.from("profiles").update({ must_change_password: false }).eq("id", userId);
    if (clearByTrustedPathError) fail(`Could not restore forced-password fixture: ${clearByTrustedPathError.message}`);
    const { error: disableError } = await admin.from("profiles").update({ status: "INACTIVE" }).eq("id", userId);
    if (disableError) fail(`Could not disable fixture account: ${disableError.message}`);
    const { data: disabledPackets, error: disabledReadError } = await browser.from("packets").select("id").eq("id", packetId);
    if (disabledReadError || (disabledPackets?.length ?? 0) !== 0) fail("Disabled account retained packet read access");
    const { error: disabledWriteError } = await browser.from("packets").update({ label: "forbidden disabled write" }).eq("id", packetId);
    const { data: afterDisabledWrite } = await admin.from("packets").select("label").eq("id", packetId).single();
    if ((!disabledWriteError && afterDisabledWrite?.label !== originalLabel) || afterDisabledWrite?.label !== originalLabel) fail("Disabled account changed packet data");
    ok("disabled account cannot access packet data with its existing session");

    await admin.from("profiles").update({ status: "ACTIVE" }).eq("id", userId);
    const { error: inactiveOrgError } = await admin.from("organizations").update({ status: "INACTIVE" }).eq("id", organizationId);
    if (inactiveOrgError) fail(`Could not deactivate fixture organization: ${inactiveOrgError.message}`);
    const { data: inactiveMembership } = await browser.rpc("is_active_organization_member", { p_organization_id: organizationId });
    if (inactiveMembership !== false) fail("Inactive organization membership predicate remained true");
    ok("inactive organization loses its membership authorization predicate");
  } finally {
    await browser.auth.signOut();
    if (packetId) await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
  }

  console.log("\nAll F3/F4 account-state development checks passed.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
