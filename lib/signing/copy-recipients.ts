/**
 * Completed Signing copy recipients (non-signers).
 * Soft-remove only; never affects Complete or frozen evidence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { canManageCompletedSigningOperations } from "./completed-package-authority";
import {
  ensureCompletedPackageCredential,
  findCurrentCompletedPackageCredential,
  revokeCompletedPackageCredential,
} from "./completed-package-credentials";
import { enqueueCompletedPackageDelivery } from "./completed-package-delivery";
import { revokeCompletedPackageSessionsForCredential } from "./completed-package-sessions";
import { requireSigningEventActorType } from "./event-actor";
import { SigningError } from "./errors";
import {
  normalizeOptionalText,
  normalizeRequiredText,
} from "./manage";
import { appendSigningEvent } from "./signing-events";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SigningCopyRecipientRow = {
  id: string;
  signing_id: string;
  email: string;
  display_name: string | null;
  role_label: string | null;
  associated_user_id: string | null;
  associated_contact_id: string | null;
  added_by_user_id: string | null;
  status: string;
  removed_at: string | null;
  removed_by_user_id: string | null;
  removal_reason: string | null;
};

async function requireCompletedManageableSigning(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
) {
  if (!isUuid(signingIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  const bundle = await loadSigningAuthorityBundle(admin, actor, signingIdRaw);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (
    !canManageCompletedSigningOperations(
      bundle.authority,
      bundle.signing.lifecycle_state,
    )
  ) {
    throw new SigningError(
      "FORBIDDEN",
      "You cannot manage copy recipients for this Signing.",
    );
  }
  return bundle;
}

export async function listActiveCopyRecipients(
  admin: SupabaseClient,
  signingId: string,
): Promise<SigningCopyRecipientRow[]> {
  const { data, error } = await admin
    .from("signing_copy_recipients")
    .select("*")
    .eq("signing_id", signingId)
    .eq("status", "ACTIVE")
    .order("create_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SigningCopyRecipientRow[];
}

export async function addCopyRecipientWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    email: unknown;
    displayName?: unknown;
    roleLabel?: unknown;
    associatedUserId?: unknown;
    associatedContactId?: unknown;
  },
  admin: SupabaseClient,
): Promise<SigningCopyRecipientRow> {
  const bundle = await requireCompletedManageableSigning(
    actor,
    input.signingId,
    admin,
  );

  const email = normalizeRequiredText(input.email, "email", 320).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new SigningError("INVALID_INPUT", "Invalid email address.");
  }
  const displayName = normalizeOptionalText(
    input.displayName,
    "display name",
    200,
  );
  const roleLabel = normalizeOptionalText(input.roleLabel, "role", 120);

  let associatedUserId: string | null = null;
  if (input.associatedUserId !== undefined && input.associatedUserId !== null) {
    if (!isUuid(input.associatedUserId)) {
      throw new SigningError("INVALID_INPUT", "Invalid associated User id.");
    }
    associatedUserId = input.associatedUserId;
  }

  let associatedContactId: string | null = null;
  if (
    input.associatedContactId !== undefined &&
    input.associatedContactId !== null
  ) {
    if (!isUuid(input.associatedContactId)) {
      throw new SigningError("INVALID_INPUT", "Invalid associated Contact id.");
    }
    associatedContactId = input.associatedContactId;
  }

  const { data: inserted, error: insertError } = await admin
    .from("signing_copy_recipients")
    .insert({
      signing_id: bundle.signing.id,
      email,
      display_name: displayName,
      role_label: roleLabel,
      associated_user_id: associatedUserId,
      associated_contact_id: associatedContactId,
      added_by_user_id: actor.userId,
      status: "ACTIVE",
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Failed to add copy recipient.");
  }

  const recipient = inserted as SigningCopyRecipientRow;

  const ensured = await ensureCompletedPackageCredential({
    admin,
    signingId: bundle.signing.id,
    target: { signingCopyRecipientId: recipient.id },
    issuedByUserId: actor.userId,
  });

  await enqueueCompletedPackageDelivery({
    admin,
    signingId: bundle.signing.id,
    credentialId: ensured.credentialId,
    signingCopyRecipientId: recipient.id,
    recipientEmail: email,
    recipientName: displayName ?? email,
    packageRevisionId: bundle.signing.frozen_package_revision_id,
    initiatedByUserId: actor.userId,
  });

  const { kickSigningWorkProcessing } = await import("./signing-worker-kick");
  kickSigningWorkProcessing({ admin, signingId: bundle.signing.id });

  await appendSigningEvent(admin, {
    signingId: bundle.signing.id,
    eventType: "COPY_RECIPIENT_ADDED",
    actorType: requireSigningEventActorType(bundle.authority),
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Copy recipient added",
    detailsJson: {
      copyRecipientId: recipient.id,
      email,
    },
  });

  return recipient;
}

export async function softRemoveCopyRecipientWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    copyRecipientId: unknown;
    reason?: unknown;
  },
  admin: SupabaseClient,
): Promise<SigningCopyRecipientRow> {
  const bundle = await requireCompletedManageableSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.copyRecipientId)) {
    throw new SigningError("INVALID_INPUT", "Invalid copy recipient id.");
  }

  const reason = normalizeOptionalText(input.reason, "removal reason", 200);

  const { data: updated, error } = await admin
    .from("signing_copy_recipients")
    .update({
      status: "REMOVED",
      removed_at: new Date().toISOString(),
      removed_by_user_id: actor.userId,
      removal_reason: reason,
    })
    .eq("id", input.copyRecipientId)
    .eq("signing_id", bundle.signing.id)
    .eq("status", "ACTIVE")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    throw new SigningError("NOT_FOUND", "Active copy recipient not found.");
  }

  const recipient = updated as SigningCopyRecipientRow;
  const currentCredential = await findCurrentCompletedPackageCredential({
    admin,
    signingId: bundle.signing.id,
    target: { signingCopyRecipientId: recipient.id },
  });
  let revokedCredentialId: string | null = null;
  if (currentCredential) {
    revokedCredentialId = currentCredential.credentialId;
    await revokeCompletedPackageSessionsForCredential({
      admin,
      signingId: bundle.signing.id,
      credentialId: currentCredential.credentialId,
    });
    await revokeCompletedPackageCredential({
      admin,
      signingId: bundle.signing.id,
      credentialId: currentCredential.credentialId,
      revokedByUserId: actor.userId,
      reason: "COPY_RECIPIENT_REMOVED",
    });

    // Park pending/failed delivery work for this credential (no further sends).
    const { data: pendingWork } = await admin
      .from("signing_work_items")
      .select("id, reference_json, processing_state")
      .eq("signing_id", bundle.signing.id)
      .eq("work_type", "DELIVER_COMPLETED_PACKAGE")
      .in("processing_state", ["PENDING", "PROCESSING", "FAILED"]);
    const nowIso = new Date().toISOString();
    for (const item of pendingWork ?? []) {
      const reference = (item.reference_json ?? {}) as Record<string, unknown>;
      const credentialRef = String(
        reference.completedPackageCredentialId ?? reference.credentialId ?? "",
      );
      if (credentialRef !== currentCredential.credentialId) continue;
      await admin
        .from("signing_work_items")
        .update({
          processing_state: "SUCCEEDED",
          completed_at: nowIso,
          claimed_by: null,
          claimed_until: null,
          last_error_safe:
            "Cancelled: copy recipient removed; completed-package delivery stopped.",
          next_attempt_at: null,
        })
        .eq("id", item.id as string)
        .neq("processing_state", "SUCCEEDED");
    }

    await admin
      .from("signing_delivery_instructions")
      .update({ delivery_state: "FAILED" })
      .eq("signing_id", bundle.signing.id)
      .eq("signing_copy_recipient_id", recipient.id)
      .eq("completed_package_credential_id", currentCredential.credentialId)
      .in("delivery_state", ["PENDING", "QUEUED"]);
  }

  await appendSigningEvent(admin, {
    signingId: bundle.signing.id,
    eventType: "COPY_RECIPIENT_REMOVED",
    actorType: requireSigningEventActorType(bundle.authority),
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    summary: "Copy recipient removed",
    detailsJson: {
      copyRecipientId: recipient.id,
      reason,
      revokedCredentialId,
    },
  });

  return recipient;
}
