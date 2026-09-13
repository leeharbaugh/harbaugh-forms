/** Development-only validation for F10 organization-scoped brokerage settings. */
import { createClient } from "@supabase/supabase-js";
import { loadFieldResolverContext } from "@/lib/field-resolver";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const DAVEY_GOOSMANN_REALTY = "Davey Goosmann Realty";
const OTHER_ORGANIZATION = "New Test Org";

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
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) fail("Need anon/publishable and service/secret keys");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const browser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stamp = Date.now();
  const email = `f10-brokerage-scope-${stamp}@example.invalid`;
  const password = `F10-${stamp}-temporary-password`;
  let userId: string | null = null;
  let packetId: number | null = null;

  try {
    const { data: organizations, error: organizationsError } = await admin
      .from("organizations")
      .select("id, name")
      .in("name", [DAVEY_GOOSMANN_REALTY, OTHER_ORGANIZATION])
      .eq("status", "ACTIVE");
    if (organizationsError) fail(`Could not load organizations: ${organizationsError.message}`);

    const daveyOrganizationId = organizations?.find(
      (organization) => organization.name === DAVEY_GOOSMANN_REALTY,
    )?.id as string | undefined;
    const otherOrganizationId = organizations?.find(
      (organization) => organization.name === OTHER_ORGANIZATION,
    )?.id as string | undefined;
    if (!daveyOrganizationId || !otherOrganizationId) {
      fail("Expected both development organizations were not found");
    }

    const { data: settings, error: settingsError } = await admin
      .from("brokerage_settings")
      .select("id, organization_id")
      .eq("status", "ACTIVE")
      .eq("organization_id", daveyOrganizationId)
      .maybeSingle();
    if (settingsError || !settings) {
      fail(`No active Davey Goosmann Realty brokerage profile: ${settingsError?.message}`);
    }
    ok("active brokerage profile is assigned to Davey Goosmann Realty");

    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError || !userData.user) {
      fail(`Could not create F10 fixture user: ${userError?.message}`);
    }
    userId = userData.user.id;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      first_name: "F10",
      last_name: "Validator",
      display_name: "F10 Validator",
      app_role: "USER",
      status: "ACTIVE",
      onboarding_status: "ACTIVE",
      must_change_password: false,
      primary_organization_id: otherOrganizationId,
    });
    if (profileError) fail(`Could not prepare F10 fixture profile: ${profileError.message}`);

    const { error: membershipError } = await admin
      .from("organization_members")
      .insert({
        organization_id: otherOrganizationId,
        user_id: userId,
        membership_role: "MEMBER",
        status: "ACTIVE",
      });
    if (membershipError) fail(`Could not prepare F10 fixture membership: ${membershipError.message}`);

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        label: `F10 organization scope ${stamp}`,
        packet_type: "custom",
        status: "ACTIVE",
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (packetError || !packet) {
      fail(`Could not create F10 fixture packet: ${packetError?.message}`);
    }
    packetId = packet.id as number;

    const noProfileContext = await loadFieldResolverContext(admin, packetId);
    if (
      noProfileContext.actingOrganizationId !== otherOrganizationId ||
      noProfileContext.settings !== null
    ) {
      fail("Packet resolver used brokerage settings outside the packet owner's organization");
    }
    ok("packet resolver leaves brokerage fields blank when the owner organization has no profile");

    const { error: signInError } = await browser.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) fail(`Could not sign in F10 fixture user: ${signInError.message}`);

    const { data: inaccessibleRows, error: inaccessibleError } = await browser
      .from("brokerage_settings")
      .select("id, organization_id")
      .eq("status", "ACTIVE");
    if (inaccessibleError || (inaccessibleRows?.length ?? 0) !== 0) {
      fail("A user from New Test Org could read Davey Goosmann Realty brokerage settings");
    }
    ok("user from New Test Org cannot read Davey Goosmann Realty brokerage settings");

    const { error: switchMembershipError } = await admin
      .from("organization_members")
      .update({ status: "INACTIVE" })
      .eq("user_id", userId)
      .eq("organization_id", otherOrganizationId);
    if (switchMembershipError) fail(`Could not retire F10 fixture membership: ${switchMembershipError.message}`);
    const { error: daveyMembershipError } = await admin
      .from("organization_members")
      .insert({
        organization_id: daveyOrganizationId,
        user_id: userId,
        membership_role: "MEMBER",
        status: "ACTIVE",
      });
    if (daveyMembershipError) fail(`Could not grant F10 fixture membership: ${daveyMembershipError.message}`);
    const { error: primaryOrganizationError } = await admin
      .from("profiles")
      .update({ primary_organization_id: daveyOrganizationId })
      .eq("id", userId);
    if (primaryOrganizationError) {
      fail(`Could not update F10 fixture primary organization: ${primaryOrganizationError.message}`);
    }

    const { data: accessibleRows, error: accessibleError } = await browser
      .from("brokerage_settings")
      .select("id, organization_id")
      .eq("status", "ACTIVE");
    if (
      accessibleError ||
      accessibleRows?.length !== 1 ||
      accessibleRows[0]?.organization_id !== daveyOrganizationId
    ) {
      fail("A member of Davey Goosmann Realty could not read its brokerage settings");
    }
    ok("member of Davey Goosmann Realty can read its brokerage settings");

    const daveyProfileContext = await loadFieldResolverContext(admin, packetId);
    if (
      daveyProfileContext.actingOrganizationId !== daveyOrganizationId ||
      daveyProfileContext.settings?.organization_id !== daveyOrganizationId
    ) {
      fail("Packet resolver did not use the packet owner's Davey Goosmann Realty profile");
    }
    ok("packet resolver uses the packet owner's organization brokerage profile");
  } finally {
    await browser.auth.signOut();
    if (packetId) {
      await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  }

  console.log("\nAll F10 organization-scoped brokerage settings development checks passed.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
