/**
 * Development-only R12 Stage 1 Native Signing boundary validator.
 * Proves deny-by-default table/Storage access against harbaugh-forms-dev.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  NATIVE_SIGNING_STAGE1_TABLES,
  SIGNING_ARTIFACTS_BUCKET,
} from "../lib/signing/stage1-schema.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function expectRejected(
  label: string,
  action: () => Promise<{ error: { message: string } | null; data?: unknown }>,
) {
  const { error, data } = await action();
  if (!error) {
    fail(`${label} unexpectedly succeeded (${JSON.stringify(data)})`);
  }
  ok(`${label} rejected (${error.message})`);
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) fail("Need anon/publishable and service/secret keys");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const browser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const email = `signing-stage1-${stamp}@example.invalid`;
  const password = `Stage1-${stamp}-Aa1!`;
  let userId: string | null = null;
  let organizationId: string | null = null;
  let signingId: string | null = null;
  let packetId: number | null = null;
  let packetFormId: number | null = null;
  const artifactPath = `stage1-validation/${stamp}-${randomUUID()}.pdf`;
  const pdfBytes = new TextEncoder().encode("%PDF-1.4 stage1-validation");

  try {
    for (const table of NATIVE_SIGNING_STAGE1_TABLES) {
      const { error } = await admin.from(table).select("*").limit(0);
      if (error) fail(`table ${table} missing or unreadable by service role: ${error.message}`);
    }
    ok(`all ${NATIVE_SIGNING_STAGE1_TABLES.length} Stage 1 tables exist`);

    const { data: bucket, error: bucketError } = await admin.storage.getBucket(
      SIGNING_ARTIFACTS_BUCKET,
    );
    if (bucketError || !bucket) {
      fail(`signing-artifacts bucket missing: ${bucketError?.message}`);
    }
    if (bucket.public) fail("signing-artifacts bucket must be private");
    ok("signing-artifacts bucket exists and is private");

    const { data: createdUser, error: createUserError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createUserError || !createdUser.user) {
      fail(`createUser failed: ${createUserError?.message}`);
    }
    userId = createdUser.user.id;

    const { data: organization, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: `Stage1 Org ${stamp}`,
        organization_type: "OTHER",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (orgError || !organization) fail(`org create failed: ${orgError?.message}`);
    organizationId = organization.id as string;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      first_name: "Stage",
      last_name: "One",
      display_name: "Stage One Validator",
      app_role: "USER",
      status: "ACTIVE",
      onboarding_status: "ACTIVE",
      must_change_password: false,
      primary_organization_id: organizationId,
    });
    if (profileError) fail(`profile upsert failed: ${profileError.message}`);

    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      membership_role: "MEMBER",
      status: "ACTIVE",
    });
    if (memberError) fail(`membership create failed: ${memberError.message}`);

    const { data: signing, error: signingError } = await admin
      .from("signings")
      .insert({
        originating_organization_id: organizationId,
        original_sender_user_id: userId,
        original_sender_display_name: "Stage One",
        original_sender_email: email,
        title: `Stage 1 validation ${stamp}`,
      })
      .select("id")
      .single();
    if (signingError || !signing) {
      fail(`service-role signing insert failed: ${signingError?.message}`);
    }
    signingId = signing.id as string;
    ok("service-role can insert a signing row");

    // Same-Signing root pointer protection: a foreign Signing's revision must
    // not become this Signing's current_package_revision_id.
    const { data: otherSigning, error: otherSigningError } = await admin
      .from("signings")
      .insert({
        originating_organization_id: organizationId,
        original_sender_user_id: userId,
        original_sender_display_name: "Stage One Other",
        original_sender_email: email,
        title: `Stage 1 other signing ${stamp}`,
      })
      .select("id")
      .single();
    if (otherSigningError || !otherSigning) {
      fail(`other signing insert failed: ${otherSigningError?.message}`);
    }
    const otherSigningId = otherSigning.id as string;

    const { data: otherRevision, error: otherRevisionError } = await admin
      .from("signing_package_revisions")
      .insert({
        signing_id: otherSigningId,
        revision_number: 1,
        promotion_reason: "INITIAL",
      })
      .select("id")
      .single();
    if (otherRevisionError || !otherRevision) {
      fail(`other revision insert failed: ${otherRevisionError?.message}`);
    }

    const { error: crossPointerError } = await admin
      .from("signings")
      .update({ current_package_revision_id: otherRevision.id })
      .eq("id", signingId);
    if (!crossPointerError) {
      fail("cross-Signing current_package_revision_id should be rejected");
    }
    ok(
      `cross-Signing package revision pointer rejected (${crossPointerError.message})`,
    );

    const { data: otherAssociation, error: otherAssociationError } = await admin
      .from("signing_agent_associations")
      .insert({
        signing_id: otherSigningId,
        agent_user_id: userId,
        association_role: "PRIMARY",
        agent_display_name: "Stage One Other",
        agent_email: email,
      })
      .select("id")
      .single();
    if (otherAssociationError || !otherAssociation) {
      fail(`other association insert failed: ${otherAssociationError?.message}`);
    }

    const { error: crossAgentError } = await admin
      .from("signings")
      .update({ current_primary_agent_association_id: otherAssociation.id })
      .eq("id", signingId);
    if (!crossAgentError) {
      fail("cross-Signing current_primary_agent_association_id should be rejected");
    }
    ok(
      `cross-Signing primary agent pointer rejected (${crossAgentError.message})`,
    );

    await admin.from("signing_agent_associations").delete().eq("id", otherAssociation.id);
    await admin.from("signing_package_revisions").delete().eq("id", otherRevision.id);
    await admin.from("signings").delete().eq("id", otherSigningId);

    const { error: eventError } = await admin.from("signing_events").insert({
      signing_id: signingId,
      event_type: "STAGE1_VALIDATION",
      actor_type: "SYSTEM",
      summary: "Stage 1 boundary validation fixture",
    });
    if (eventError) fail(`service-role event insert failed: ${eventError.message}`);
    ok("service-role can append a signing_event");

    const { data: events, error: eventReadError } = await admin
      .from("signing_events")
      .select("sequence_number")
      .eq("signing_id", signingId);
    if (eventReadError || !events?.length || events[0].sequence_number !== 1) {
      fail("server-assigned signing_events.sequence_number was not 1");
    }
    ok("signing_events sequence_number is server-assigned");

    const { error: eventUpdateError } = await admin
      .from("signing_events")
      .update({ summary: "mutated" })
      .eq("signing_id", signingId);
    if (!eventUpdateError) fail("signing_events update should be append-only blocked");
    ok(`signing_events update blocked (${eventUpdateError.message})`);

    const { error: uploadError } = await admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .upload(artifactPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      fail(`service-role artifact upload failed: ${uploadError.message}`);
    }
    ok("service-role can upload a signing-artifacts object");

    const { error: signInError } = await browser.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) fail(`browser sign-in failed: ${signInError.message}`);
    ok("ordinary authenticated browser session established");

    for (const table of NATIVE_SIGNING_STAGE1_TABLES) {
      await expectRejected(`authenticated SELECT ${table}`, () =>
        browser.from(table).select("*").limit(1),
      );
      await expectRejected(`authenticated INSERT ${table}`, () =>
        browser.from(table).insert({ id: randomUUID() } as never),
      );
      await expectRejected(`authenticated DELETE ${table}`, () =>
        browser.from(table).delete().eq("id", signingId as string),
      );
    }

    await expectRejected("anonymous SELECT signings", () =>
      anon.from("signings").select("*").limit(1),
    );
    await expectRejected("anonymous INSERT signings", () =>
      anon.from("signings").insert({
        originating_organization_id: organizationId,
        original_sender_display_name: "Anon",
        title: "Nope",
      } as never),
    );

    await expectRejected("authenticated storage download signing-artifacts", async () => {
      const result = await browser.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .download(artifactPath);
      return { error: result.error };
    });
    await expectRejected("authenticated storage upload signing-artifacts", async () => {
      const result = await browser.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .upload(`stage1-validation/browser-${stamp}.pdf`, pdfBytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      return { error: result.error };
    });
    await expectRejected("authenticated storage remove signing-artifacts", async () => {
      const result = await browser.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .remove([artifactPath]);
      if (!result.error) {
        const retained = await admin.storage
          .from(SIGNING_ARTIFACTS_BUCKET)
          .download(artifactPath);
        if (retained.data) {
          return { error: { message: "remove did not delete protected object" } };
        }
      }
      return { error: result.error };
    });
    await expectRejected("anonymous storage download signing-artifacts", async () => {
      const result = await anon.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .download(artifactPath);
      return { error: result.error };
    });

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        label: `Stage1 annotation check ${stamp}`,
        packet_type: "custom",
        status: "ACTIVE",
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(`packet create failed: ${packetError?.message}`);
    packetId = packet.id as number;

    const { data: packetForm, error: packetFormError } = await admin
      .from("packet_forms")
      .insert({
        packet_id: packetId,
        form_id: null,
        status: "ACTIVE",
        document_state: "DRAFT",
        availability_state: "AVAILABLE",
        document_name: `Stage1 Draft Form ${stamp}`,
        document_type: "PDF",
        origin: "external_upload",
        sort_order: 1,
        is_required: false,
        field_data: {},
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (packetFormError || !packetForm) {
      fail(`packet_form create failed: ${packetFormError?.message}`);
    }
    packetFormId = packetForm.id as number;

    const { data: annotation, error: annotationError } = await browser
      .from("packet_form_annotations")
      .insert({
        id: randomUUID(),
        packet_id: packetId,
        packet_form_id: packetFormId,
        page_number: 1,
        annotation_type: "typed_signature",
        text_value: "Stage One",
        font_id: "caveat",
        x: 10,
        y: 10,
        width: 120,
        height: 36,
        rotation: 0,
        created_by_user_id: userId,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (annotationError || !annotation) {
      fail(
        `DRAFT annotation insert should still succeed for packet owner: ${annotationError?.message}`,
      );
    }
    ok("existing Fill Form DRAFT annotation insert still works for packet owner");

    const { error: softDeleteError } = await browser
      .from("packet_form_annotations")
      .update({ status: "DELETED" })
      .eq("id", annotation.id);
    if (softDeleteError) {
      fail(`annotation soft-delete failed: ${softDeleteError.message}`);
    }
    ok("existing Fill Form annotation soft-delete still works");

    console.log("\nAll Stage 1 Native Signing deny-by-default development checks passed.");
  } finally {
    await browser.auth.signOut();
    await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).remove([artifactPath]);
    if (packetFormId) {
      await admin.from("packet_form_annotations").delete().eq("packet_form_id", packetFormId);
      await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", packetFormId);
    }
    if (packetId) {
      await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    }
    if (signingId) {
      await admin.from("signing_events").delete().eq("signing_id", signingId);
      await admin.from("signings").delete().eq("id", signingId);
    }
    if (organizationId) {
      await admin.from("organization_members").delete().eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (userId) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
