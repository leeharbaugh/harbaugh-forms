/**
 * Development-only validation: per-agent form identity and Settings isolation
 * against real RLS. Creates two temporary agents in Davey Goosmann Realty,
 * then removes them. Blocked writes reuse the stored values, so even a broken
 * policy could not change shared development data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadFieldResolverContext, resolveFieldValueFromContext } from "@/lib/field-resolver";
import type { Field } from "@/lib/types/field";
import {
  loadCurrentUserAgentProfile,
  saveCurrentUserAgentProfile,
} from "@/lib/user-agent-profile";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const DAVEY_GOOSMANN_REALTY = "Davey Goosmann Realty";

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

const agentField = (sourcePath: string) =>
  ({
    id: `validation-${sourcePath}`,
    field_key: sourcePath.toUpperCase(),
    source_type: "settings_agent",
    source_path: sourcePath,
    field_data_type: "text",
    field_widget_type: "text",
  }) as Field;

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

  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceKey, clientOptions);
  const browserA = createClient(url, anonKey, clientOptions);
  const browserB = createClient(url, anonKey, clientOptions);
  const stamp = Date.now();
  const userIds: string[] = [];
  const packetIds: number[] = [];

  async function createAgent(
    label: "A" | "B",
    organizationId: string,
    profile: Record<string, string>,
  ) {
    const email = `agent-identity-${label.toLowerCase()}-${stamp}@example.invalid`;
    const password = `AgentIdentity-${label}-${stamp}-temporary`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) fail(`Could not create fixture agent ${label}: ${error?.message}`);
    const userId = data.user.id;
    userIds.push(userId);

    const steps = [
      admin.from("profiles").upsert({
        id: userId,
        email,
        first_name: profile.legal_first_name,
        last_name: profile.legal_last_name,
        display_name: `${profile.legal_first_name} ${profile.legal_last_name}`,
        app_role: "USER",
        status: "ACTIVE",
        onboarding_status: "ACTIVE",
        must_change_password: false,
        primary_organization_id: organizationId,
      }),
      admin.from("organization_members").insert({
        organization_id: organizationId,
        user_id: userId,
        membership_role: "MEMBER",
        status: "ACTIVE",
      }),
      admin.from("user_agent_settings").upsert({ user_id: userId, status: "ACTIVE", ...profile }),
    ];
    for (const step of steps) {
      const { error: stepError } = await step;
      if (stepError) fail(`Could not prepare fixture agent ${label}: ${stepError.message}`);
    }

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        label: `Agent identity ${label} ${stamp}`,
        packet_type: "custom",
        status: "ACTIVE",
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(`Could not create packet for agent ${label}: ${packetError?.message}`);
    packetIds.push(packet.id as number);

    return { userId, email, password, packetId: packet.id as number };
  }

  async function signIn(client: SupabaseClient, email: string, password: string) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) fail(`Could not sign in ${email}: ${error.message}`);
  }

  try {
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("id")
      .eq("name", DAVEY_GOOSMANN_REALTY)
      .eq("status", "ACTIVE")
      .single();
    if (organizationError || !organization) fail("Development Davey Goosmann Realty not found");
    const organizationId = organization.id as string;

    const { data: shared, error: sharedError } = await admin
      .from("brokerage_settings")
      .select("id, brokerage_name, update_date")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .single();
    if (sharedError || !shared) fail("Development brokerage profile not found");

    const agentA = await createAgent("A", organizationId, {
      legal_first_name: "Avery",
      legal_last_name: `Stone${stamp}`,
      trec_license_number: "0111111",
      email: "avery@example.invalid",
      phone: "817-555-0101",
    });
    const agentB = await createAgent("B", organizationId, {
      legal_first_name: "Jordan",
      legal_last_name: `Reyes${stamp}`,
      trec_license_number: "0222222",
      email: "jordan@example.invalid",
      phone: "817-555-0202",
    });
    await signIn(browserA, agentA.email, agentA.password);
    await signIn(browserB, agentB.email, agentB.password);

    // 1–3. Each owner's packet resolves that owner's identity and the shared brokerage.
    for (const [label, agent, client] of [
      ["A", agentA, browserA],
      ["B", agentB, browserB],
    ] as const) {
      const context = await loadFieldResolverContext(client, agent.packetId);
      if (context.agentProfile?.user_id !== agent.userId) {
        fail(`Agent ${label}'s packet did not load agent ${label}'s own profile`);
      }
      if (context.settings?.id !== shared.id) {
        fail(`Agent ${label}'s packet did not use the shared brokerage profile`);
      }
    }
    const adminContextB = await loadFieldResolverContext(admin, agentB.packetId);
    const license = resolveFieldValueFromContext({
      field: agentField("agent_license_number"),
      context: adminContextB,
    }).value;
    if (license !== "0222222") fail(`Agent B's packet resolved license ${license}`);
    ok("each agent's packet resolves that agent's own profile; brokerage profile stays shared");
    ok("resolution follows the packet owner, not the viewing service/admin client");

    // Packets stay private, so another agent cannot resolve them at all.
    let crossAgentBlocked = false;
    try {
      await loadFieldResolverContext(browserA, agentB.packetId);
    } catch {
      crossAgentBlocked = true;
    }
    if (!crossAgentBlocked) fail("Agent A could load agent B's packet");
    ok("agent A cannot load agent B's packet");

    // 5. Settings isolation under RLS.
    const ownProfile = await loadCurrentUserAgentProfile(browserB);
    if (ownProfile?.user_id !== agentB.userId) fail("Agent B could not read their own profile");
    const { data: otherRows } = await browserB
      .from("user_agent_settings")
      .select("user_id")
      .eq("user_id", agentA.userId);
    if ((otherRows?.length ?? 0) !== 0) fail("Agent B could read agent A's profile");
    const { data: crossUpdate } = await browserB
      .from("user_agent_settings")
      .update({ trec_license_number: "0111111" })
      .eq("user_id", agentA.userId)
      .select("user_id");
    if ((crossUpdate?.length ?? 0) !== 0) fail("Agent B could update agent A's profile");
    const { error: crossInsertError } = await browserB
      .from("user_agent_settings")
      .insert({ user_id: agentA.userId, status: "ACTIVE" });
    if (!crossInsertError) fail("Agent B could create a profile row for agent A");

    const saved = await saveCurrentUserAgentProfile(browserB, {
      agent_first_name: "Jordan",
      agent_middle_name: "",
      agent_last_name: `Reyes${stamp}`,
      agent_license_number: "0222223",
      agent_phone: "8175550203",
      agent_email: "Jordan.Updated@Example.invalid",
      agent_address: "",
      agent_address_line_2: "",
      agent_city: "",
      agent_state: "TX",
      agent_zip: "",
    });
    if (saved.user_id !== agentB.userId || saved.trec_license_number !== "0222223") {
      fail("Agent B's Settings save did not update agent B's own profile");
    }
    const { data: agentAAfter } = await admin
      .from("user_agent_settings")
      .select("trec_license_number")
      .eq("user_id", agentA.userId)
      .single();
    if (agentAAfter?.trec_license_number !== "0111111") fail("Agent A's profile changed");
    ok("Settings saves only the signed-in agent's profile; other agents' rows are unreadable and unwritable");

    // 6. Non-admin agents cannot change the shared brokerage profile.
    const { data: brokerageUpdate } = await browserB
      .from("brokerage_settings")
      .update({ brokerage_name: shared.brokerage_name })
      .eq("id", shared.id)
      .select("id");
    if ((brokerageUpdate?.length ?? 0) !== 0) fail("A non-admin agent updated brokerage settings");
    const { data: insertedBrokerage, error: brokerageInsertError } = await browserB
      .from("brokerage_settings")
      .insert({ organization_id: organizationId, status: "INACTIVE" })
      .select("id");
    if (!brokerageInsertError) {
      for (const row of insertedBrokerage ?? []) {
        await admin.from("brokerage_settings").delete().eq("id", row.id);
      }
      fail("A non-admin agent inserted brokerage settings");
    }
    const { data: sharedAfter } = await admin
      .from("brokerage_settings")
      .select("update_date")
      .eq("id", shared.id)
      .single();
    if (sharedAfter?.update_date !== shared.update_date) fail("Shared brokerage profile changed");
    ok("non-admin agents cannot insert or update the shared brokerage profile");
  } finally {
    await browserA.auth.signOut();
    await browserB.auth.signOut();
    for (const packetId of packetIds) {
      await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
    const { data: remainingProfiles } = await admin
      .from("user_agent_settings")
      .select("user_id")
      .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: remainingPackets } = await admin
      .from("packets")
      .select("id")
      .in("id", packetIds.length > 0 ? packetIds : [-1])
      .neq("status", "DELETED");
    if ((remainingProfiles?.length ?? 0) > 0 || (remainingPackets?.length ?? 0) > 0) {
      console.error("WARN: fixture cleanup incomplete; remove agent-identity-* fixtures manually.");
    } else {
      ok(`fixtures cleaned up (${userIds.length} users removed, ${packetIds.length} packets soft-deleted)`);
    }
  }

  console.log("\nAll agent identity development checks passed.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
