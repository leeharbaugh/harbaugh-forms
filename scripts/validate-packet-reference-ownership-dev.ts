/** Development-only validation for F7 packet reference ownership. */
import { createClient } from "@supabase/supabase-js";
import { loadFieldResolverContext } from "@/lib/field-resolver";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

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
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) fail("Need anon/publishable and service/secret keys");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const browser = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const victimEmail = `f7-victim-${stamp}@example.invalid`;
  let victimUserId: string | null = null;
  let propertyId: number | null = null;
  let agreementId: number | null = null;
  let packetId: number | null = null;

  try {
    const { data: victim, error: victimError } = await admin.auth.admin.createUser({
      email: victimEmail,
      password: `F7-${stamp}-temporary-password`,
      email_confirm: true,
    });
    if (victimError || !victim.user) fail(`Could not create F7 fixture user: ${victimError?.message}`);
    victimUserId = victim.user.id;

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .insert({
        street_address: `F7 Victim Street ${stamp}`,
        city: "Austin",
        state: "TX",
        zip: "78701",
        property_type: "SINGLE_FAMILY",
        status: "ACTIVE",
        owner_user_id: victimUserId,
      })
      .select("id")
      .single();
    if (propertyError || !property) fail(`Could not create F7 fixture property: ${propertyError?.message}`);
    propertyId = property.id as number;

    const { data: agreement, error: agreementError } = await admin
      .from("representation_agreements")
      .insert({
        agreement_type: "BUYER_REP",
        agreement_status: "ACTIVE",
        effective_date: "2026-01-01",
        property_id: propertyId,
        owner_user_id: victimUserId,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (agreementError || !agreement) fail(`Could not create F7 fixture agreement: ${agreementError?.message}`);
    agreementId = agreement.id as number;

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({ label: `F7 packet ${stamp}`, packet_type: "custom", status: "ACTIVE", owner_user_id: LEE_USER_ID })
      .select("id")
      .single();
    if (packetError || !packet) fail(`Could not create F7 fixture packet: ${packetError?.message}`);
    packetId = packet.id as number;

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: "lee@leeharbaugh.com" });
    if (linkError || !link?.properties?.hashed_token) fail(`Could not mint development browser session: ${linkError?.message}`);
    const { error: verifyError } = await browser.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
    if (verifyError) fail(`Could not verify development browser session: ${verifyError.message}`);

    const { error: propertyWriteError } = await browser.from("packets").update({ property_id: propertyId }).eq("id", packetId);
    const { data: afterProperty } = await admin.from("packets").select("property_id").eq("id", packetId).single();
    if (!propertyWriteError && afterProperty?.property_id !== null) fail("Cross-owner property reference was persisted");
    ok(propertyWriteError ? `cross-owner property reference rejected (${propertyWriteError.message})` : "cross-owner property reference made no change");

    const { error: agreementWriteError } = await browser.from("packets").update({ representation_agreement_id: agreementId }).eq("id", packetId);
    const { data: afterAgreement } = await admin.from("packets").select("representation_agreement_id").eq("id", packetId).single();
    if (!agreementWriteError && afterAgreement?.representation_agreement_id !== null) fail("Cross-owner agreement reference was persisted");
    ok(agreementWriteError ? `cross-owner agreement reference rejected (${agreementWriteError.message})` : "cross-owner agreement reference made no change");

    // Existing corrupt rows can only be created by trusted maintenance. Verify
    // that a privileged resolver still refuses to materialize their data.
    await admin.from("packets").update({ property_id: propertyId, representation_agreement_id: agreementId }).eq("id", packetId);
    const context = await loadFieldResolverContext(admin, packetId);
    if (context.packet.properties || context.representationAgreement || context.buyerRepDetails) {
      fail("Privileged resolver accepted a cross-owner legacy reference");
    }
    ok("privileged resolver ignores cross-owner legacy references");
  } finally {
    await browser.auth.signOut();
    if (packetId) await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    if (agreementId) await admin.from("representation_agreements").update({ status: "DELETED" }).eq("id", agreementId);
    if (propertyId) await admin.from("properties").update({ status: "DELETED" }).eq("id", propertyId);
    if (victimUserId) await admin.auth.admin.deleteUser(victimUserId);
  }

  console.log("\nAll F7 packet-reference ownership development checks passed.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
