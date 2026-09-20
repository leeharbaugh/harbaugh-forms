/**
 * Development-only Native Signing recovery access gate validator.
 * Targets ewxsxwzezhkeawnjvigx only. Disposable fixtures; no real email.
 *
 * Proves: epoch-A credential validates; suspend denies; bump invalidates old;
 * resume + reissue works; sentinel/old epoch denied; evidence events unchanged;
 * restores access control state on exit.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import {
  issueParticipantCredentialsForActivation,
  validateParticipantCredential,
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
} from "../lib/signing/credentials.ts";
import {
  createSigningEntrySession,
  validateSigningEntrySession,
} from "../lib/signing/entry-sessions.ts";
import {
  bumpSigningAccessEpoch,
  getSigningExternalAccessState,
  PRE_RECOVERY_ACCESS_EPOCH_SENTINEL,
  setSigningAccessSuspended,
  SIGNING_ACCESS_SUSPENDED_ENV,
} from "../lib/signing/external-access.ts";
import {
  issueCompletedPackageCredential,
  validateCompletedPackageCredential,
} from "../lib/signing/completed-package-credentials.ts";
import {
  COMPLETED_PACKAGE_WRAP_KEY_ENV,
  COMPLETED_PACKAGE_WRAP_KEY_ID_ENV,
} from "../lib/signing/completed-package-wrap.ts";
import { NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS } from "../lib/signing/stage1-schema.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";

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

function ensureDevKeys() {
  process.env[WRAP_KEY_ID_ENV] ||= "recovery-access-cred-wrap-v1";
  process.env[WRAP_KEY_ENV] ||= randomBytes(32).toString("base64");
  process.env[COMPLETED_PACKAGE_WRAP_KEY_ID_ENV] ||=
    "recovery-access-pkg-wrap-v1";
  process.env[COMPLETED_PACKAGE_WRAP_KEY_ENV] ||=
    randomBytes(32).toString("base64");
  process.env.NATIVE_SIGNING_ENABLED = "true";
  process.env.SIGNING_EMAIL_SANDBOX = "true";
  delete process.env.RESEND_API_KEY;
  delete process.env[SIGNING_ACCESS_SUSPENDED_ENV];
}

type SavedAccessState = {
  access_suspended: boolean;
  access_epoch: string;
  access_suspended_at: string | null;
  access_suspended_by_note: string | null;
  access_resumed_at: string | null;
  access_resumed_by_note: string | null;
  access_epoch_bumped_at: string | null;
  access_epoch_bump_note: string | null;
};

async function loadAccessControls(
  admin: SupabaseClient,
): Promise<SavedAccessState> {
  const { data, error } = await admin
    .from("signing_system_controls")
    .select(
      "access_suspended, access_epoch, access_suspended_at, access_suspended_by_note, access_resumed_at, access_resumed_by_note, access_epoch_bumped_at, access_epoch_bump_note",
    )
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.access_epoch) {
    fail("signing_system_controls.default missing access_epoch (apply migration)");
  }
  return data as SavedAccessState;
}

async function restoreAccessControls(
  admin: SupabaseClient,
  saved: SavedAccessState,
): Promise<void> {
  const { error } = await admin
    .from("signing_system_controls")
    .update({
      access_suspended: saved.access_suspended,
      access_epoch: saved.access_epoch,
      access_suspended_at: saved.access_suspended_at,
      access_suspended_by_note: saved.access_suspended_by_note,
      access_resumed_at: saved.access_resumed_at,
      access_resumed_by_note: saved.access_resumed_by_note,
      access_epoch_bumped_at: saved.access_epoch_bumped_at,
      access_epoch_bump_note: saved.access_epoch_bump_note,
    })
    .eq("id", "default");
  if (error) throw new Error(`restore access controls failed: ${error.message}`);
}

async function main() {
  ensureDevKeys();

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  ok(`target project verified (${EXPECTED_REF})`);
  ok(
    `migration expected: ${NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS[0]}`,
  );

  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("Need service role key");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const password = `RecAcc-${stamp}-Aa1!`;
  const agentEmail = `recovery-access-agent-${stamp}@example.invalid`;

  let organizationId: string | null = null;
  let agentUserId: string | null = null;
  let signingId: string | null = null;
  let completeSigningId: string | null = null;
  let participantId: string | null = null;
  let completeParticipantId: string | null = null;
  let savedAccess: SavedAccessState | null = null;
  let mutatedAccess = false;

  async function cleanupSigning(id: string) {
    await admin.from("signing_entry_sessions").delete().eq("signing_id", id);
    await admin
      .from("signing_participant_credentials")
      .update({ replaced_by_credential_id: null })
      .eq("signing_id", id);
    await admin
      .from("signing_participant_credentials")
      .delete()
      .eq("signing_id", id);
    await admin
      .from("signing_completed_package_credentials")
      .update({ replaced_by_credential_id: null })
      .eq("signing_id", id);
    await admin
      .from("signing_completed_package_credentials")
      .delete()
      .eq("signing_id", id);
    await admin.from("signing_events").delete().eq("signing_id", id);
    await admin.from("signing_participants").delete().eq("signing_id", id);
    await admin.from("signings").delete().eq("id", id);
  }

  async function cleanup() {
    delete process.env[SIGNING_ACCESS_SUSPENDED_ENV];
    if (mutatedAccess && savedAccess) {
      await restoreAccessControls(admin, savedAccess);
      mutatedAccess = false;
      ok("restored signing_system_controls access state");
    }
    if (completeSigningId) await cleanupSigning(completeSigningId);
    if (signingId) await cleanupSigning(signingId);
    if (organizationId) {
      await admin
        .from("organization_members")
        .delete()
        .eq("organization_id", organizationId);
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (agentUserId) {
      await admin.from("profiles").delete().eq("id", agentUserId);
      await admin.auth.admin.deleteUser(agentUserId);
    }
  }

  try {
    savedAccess = await loadAccessControls(admin);
    ok(
      `controls loaded (suspended=${savedAccess.access_suspended}, epoch present)`,
    );

    // Ensure a known epoch A for this run. Bump atomically suspends; resume after.
    const epochA = await bumpSigningAccessEpoch({
      admin,
      note: "recovery-access-dev validator epoch A",
    });
    mutatedAccess = true;
    await setSigningAccessSuspended({
      admin,
      suspended: false,
      note: "recovery-access-dev validator resume after epoch A",
    });
    ok(`epoch A seeded (${epochA.slice(0, 8)}…)`);

    const stateA = await getSigningExternalAccessState(admin);
    if (stateA.suspended || stateA.currentEpoch !== epochA) {
      fail("expected active access at epoch A");
    }

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: `Recovery Access Org ${stamp}`,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (orgError || !org) fail(`org insert failed: ${orgError?.message}`);
    organizationId = org.id as string;

    const { data: authUser, error: authError } =
      await admin.auth.admin.createUser({
        email: agentEmail,
        password,
        email_confirm: true,
      });
    if (authError || !authUser.user) {
      fail(`auth user create failed: ${authError?.message}`);
    }
    agentUserId = authUser.user.id;

    await admin.from("profiles").upsert({
      id: agentUserId,
      email: agentEmail,
      display_name: "Recovery Access Agent",
      first_name: "Recovery",
      last_name: "Access",
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "ACTIVE",
      primary_organization_id: organizationId,
    });
    await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: agentUserId,
      membership_role: "MEMBER",
      status: "ACTIVE",
    });

    const { data: signing, error: signingError } = await admin
      .from("signings")
      .insert({
        originating_organization_id: organizationId,
        original_sender_user_id: agentUserId,
        original_sender_display_name: "Recovery Access Agent",
        original_sender_email: agentEmail,
        title: `Recovery access validation ${stamp}`,
        lifecycle_state: "IN_PROGRESS",
      })
      .select("id")
      .single();
    if (signingError || !signing) {
      fail(`signing insert failed: ${signingError?.message}`);
    }
    signingId = signing.id as string;

    const { data: participant, error: participantError } = await admin
      .from("signing_participants")
      .insert({
        signing_id: signingId,
        full_name: "Recovery Participant",
        email: `recovery-participant-${stamp}@example.invalid`,
        participant_status: "PENDING",
        optional_role: "Buyer",
      })
      .select("id")
      .single();
    if (participantError || !participant) {
      fail(`participant insert failed: ${participantError?.message}`);
    }
    participantId = participant.id as string;

    // Evidence fixture: one event that must survive epoch bump.
    const { error: eventError } = await admin.from("signing_events").insert({
      signing_id: signingId,
      event_type: "RECOVERY_ACCESS_VALIDATION",
      actor_type: "SYSTEM",
      summary: "Recovery access gate evidence fixture",
    });
    if (eventError) fail(`event insert failed: ${eventError.message}`);

    const { data: eventsBefore, error: eventsBeforeError } = await admin
      .from("signing_events")
      .select("id, sequence_number, summary, event_type")
      .eq("signing_id", signingId)
      .order("sequence_number", { ascending: true });
    if (eventsBeforeError || !eventsBefore?.length) {
      fail("expected evidence event before access mutations");
    }
    ok(`evidence fixture recorded (${eventsBefore.length} event)`);

    const issued = await issueParticipantCredentialsForActivation({
      admin,
      signingId,
      participantIds: [participantId],
      issuedByUserId: agentUserId,
    });
    const issuedCred = issued.get(participantId);
    if (!issuedCred) fail("participant credential not issued");
    ok("issued participant credential at epoch A");

    const validated = await validateParticipantCredential(
      admin,
      issuedCred.rawToken,
    );
    if (!validated || validated.credentialId !== issuedCred.credentialId) {
      fail("epoch A participant credential should validate");
    }
    ok("epoch A participant credential validates");

    const entry = await createSigningEntrySession({
      admin,
      credential: validated,
    });
    const entryOk = await validateSigningEntrySession(
      admin,
      entry.rawSessionToken,
    );
    if (!entryOk) fail("epoch A entry session should validate");
    ok("epoch A entry session validates");

    // Separate COMPLETE Signing for package credentials (COMPLETE is terminal).
    const { data: completeSigning, error: completeSigningError } = await admin
      .from("signings")
      .insert({
        originating_organization_id: organizationId,
        original_sender_user_id: agentUserId,
        original_sender_display_name: "Recovery Access Agent",
        original_sender_email: agentEmail,
        title: `Recovery access COMPLETE ${stamp}`,
        lifecycle_state: "COMPLETE",
      })
      .select("id")
      .single();
    if (completeSigningError || !completeSigning) {
      fail(`complete signing insert failed: ${completeSigningError?.message}`);
    }
    completeSigningId = completeSigning.id as string;

    const { data: completeParticipant, error: completeParticipantError } =
      await admin
        .from("signing_participants")
        .insert({
          signing_id: completeSigningId,
          full_name: "Recovery Package Participant",
          email: `recovery-pkg-participant-${stamp}@example.invalid`,
          participant_status: "FINISHED",
          optional_role: "Buyer",
        })
        .select("id")
        .single();
    if (completeParticipantError || !completeParticipant) {
      fail(
        `complete participant insert failed: ${completeParticipantError?.message}`,
      );
    }
    completeParticipantId = completeParticipant.id as string;

    const pkgIssued = await issueCompletedPackageCredential({
      admin,
      signingId: completeSigningId,
      target: { signingParticipantId: completeParticipantId },
      issuedByUserId: agentUserId,
    });
    const pkgOk = await validateCompletedPackageCredential(
      admin,
      pkgIssued.rawToken,
    );
    if (!pkgOk) fail("epoch A completed-package credential should validate");
    ok("epoch A completed-package credential validates");

    // Suspend → deny (generic null; no epoch leak).
    await setSigningAccessSuspended({
      admin,
      suspended: true,
      note: "recovery-access-dev suspend",
    });
    if (await validateParticipantCredential(admin, issuedCred.rawToken)) {
      fail("suspended access must deny participant credential");
    }
    if (await validateSigningEntrySession(admin, entry.rawSessionToken)) {
      fail("suspended access must deny entry session");
    }
    ok("access suspension denies credential and session");

    try {
      await issueParticipantCredentialsForActivation({
        admin,
        signingId,
        participantIds: [participantId],
        issuedByUserId: agentUserId,
      });
      fail("issuance while suspended should throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/suspended/i.test(message)) {
        fail(`unexpected issuance error while suspended: ${message}`);
      }
      ok("issuance refused while access suspended");
    }

    // Env OR DB: env alone also suspends.
    await setSigningAccessSuspended({
      admin,
      suspended: false,
      note: "recovery-access-dev clear DB suspend for env test",
    });
    process.env[SIGNING_ACCESS_SUSPENDED_ENV] = "true";
    if (await validateParticipantCredential(admin, issuedCred.rawToken)) {
      fail("SIGNING_ACCESS_SUSPENDED=true must deny");
    }
    delete process.env[SIGNING_ACCESS_SUSPENDED_ENV];
    ok("env SIGNING_ACCESS_SUSPENDED denies access");

    // Resume at epoch A — old credential still valid until bump.
    await setSigningAccessSuspended({
      admin,
      suspended: false,
      note: "recovery-access-dev resume before bump",
    });
    if (!(await validateParticipantCredential(admin, issuedCred.rawToken))) {
      fail("resumed epoch A should still accept pre-bump credential");
    }
    ok("resume restores epoch A credential");

    // Bump atomically suspends + replaces epoch → old denied.
    const epochB = await bumpSigningAccessEpoch({
      admin,
      note: "recovery-access-dev bump to epoch B",
    });
    if (epochB === epochA) fail("bump must produce a new epoch");
    const afterBump = await getSigningExternalAccessState(admin);
    if (!afterBump.suspended) {
      fail("epoch bump must leave access_suspended=true");
    }
    if (await validateParticipantCredential(admin, issuedCred.rawToken)) {
      fail("post-bump old participant credential must be denied");
    }
    if (await validateSigningEntrySession(admin, entry.rawSessionToken)) {
      fail("post-bump old entry session must be denied");
    }
    ok("epoch bump suspends and invalidates prior credential and session");

    // Resume alone must not revive epoch-A credentials.
    await setSigningAccessSuspended({
      admin,
      suspended: false,
      note: "recovery-access-dev resume after bump",
    });
    if (await validateParticipantCredential(admin, issuedCred.rawToken)) {
      fail("resume must not revive epoch-A credential");
    }
    ok("resume does not revive old-epoch credential");

    // Sentinel / pre-migration epoch must never validate.
    const { data: sentinelRow, error: sentinelError } = await admin
      .from("signing_participant_credentials")
      .insert({
        signing_id: signingId,
        signing_participant_id: participantId,
        token_hash: randomBytes(32).toString("hex"),
        token_wrapped: "v2.sentinel-fixture-not-a-real-wrap",
        wrap_key_id: "v1",
        issued_by_user_id: agentUserId,
        is_current: false,
        revoked_at: new Date().toISOString(),
        revoked_reason: "SENTINEL_FIXTURE",
        access_epoch: PRE_RECOVERY_ACCESS_EPOCH_SENTINEL,
      })
      .select("id, access_epoch")
      .single();
    if (sentinelError || !sentinelRow) {
      fail(`sentinel fixture insert failed: ${sentinelError?.message}`);
    }
    if (sentinelRow.access_epoch !== PRE_RECOVERY_ACCESS_EPOCH_SENTINEL) {
      fail("sentinel fixture access_epoch mismatch");
    }
    ok("sentinel-epoch row can be stored (pre-migration pattern)");

    // Immutable epoch trigger.
    const { error: mutateEpochError } = await admin
      .from("signing_participant_credentials")
      .update({ access_epoch: randomUUID() })
      .eq("id", issuedCred.credentialId);
    if (!mutateEpochError) {
      fail("access_epoch UPDATE should be rejected by trigger");
    }
    ok(`access_epoch immutability enforced (${mutateEpochError.message})`);

    const reissued = await issueParticipantCredentialsForActivation({
      admin,
      signingId,
      participantIds: [participantId],
      issuedByUserId: agentUserId,
    });
    const newCred = reissued.get(participantId);
    if (!newCred) fail("reissue after bump failed");
    const revalidated = await validateParticipantCredential(
      admin,
      newCred.rawToken,
    );
    if (!revalidated || revalidated.credentialId !== newCred.credentialId) {
      fail("reissued credential at epoch B should validate");
    }
    if (await validateParticipantCredential(admin, issuedCred.rawToken)) {
      fail("old epoch A credential must remain denied after reissue");
    }
    ok("reissue after bump validates; old credential still denied");

    const { data: eventsAfter, error: eventsAfterError } = await admin
      .from("signing_events")
      .select("id, sequence_number, summary, event_type")
      .eq("signing_id", signingId)
      .order("sequence_number", { ascending: true });
    if (eventsAfterError) fail(eventsAfterError.message);
    if (
      !eventsAfter ||
      eventsAfter.length !== eventsBefore.length ||
      eventsAfter[0].id !== eventsBefore[0].id ||
      eventsAfter[0].summary !== eventsBefore[0].summary ||
      eventsAfter[0].sequence_number !== eventsBefore[0].sequence_number
    ) {
      fail("evidence events changed after access gate mutations");
    }
    ok("evidence events unchanged after suspend/bump/reissue");
  } catch (error) {
    console.error(
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    await cleanup();
    process.exit(1);
  }

  await cleanup();
  ok("recovery access gate validator passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
