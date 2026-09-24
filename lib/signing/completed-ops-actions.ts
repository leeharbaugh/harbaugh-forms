"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  addCopyRecipientWithActor,
  listActiveCopyRecipients,
  softRemoveCopyRecipientWithActor,
} from "@/lib/signing/copy-recipients";
import {
  replaceCompletedPackageCredentialWithActor,
  resendCompletedPackageWithActor,
  revokeCompletedPackageCredentialWithActor,
} from "@/lib/signing/completed-package-delivery";
import { loadCompletedOpsSnapshotForActor } from "@/lib/signing/completed-ops";
import { loadSigningAuthorityBundle } from "@/lib/signing/authority-context";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import { requestFinalizationRetryWithActor } from "@/lib/signing/finalization-retry";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/signing/types";

export type CompletedOpsActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): CompletedOpsActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof Error && error.message) {
    console.error("[native-signing-completed-ops] unexpected error:", error.message);
  } else {
    console.error("[native-signing-completed-ops] unexpected error");
  }
  return { ok: false, code: "INTERNAL", error: "Unexpected Signing error." };
}

export async function getCompletedOpsSnapshotAction(input: {
  signingId: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await loadCompletedOpsSnapshotForActor(
      actor,
      input.signingId,
      admin,
    );
    if (!data) {
      return { ok: false, code: "NOT_FOUND", error: "Signing not found." };
    }
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resendCompletedPackageAction(input: {
  signingId: string;
  credentialId: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await resendCompletedPackageWithActor(actor, input, admin);
    return { ok: true, data: { instructionId: data.deliveryInstructionId } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function replaceCompletedPackageLinkAction(input: {
  signingId: string;
  credentialId: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    await replaceCompletedPackageCredentialWithActor(
      actor,
      { ...input, resend: true },
      admin,
    );
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeCompletedPackageLinkAction(input: {
  signingId: string;
  credentialId: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    await revokeCompletedPackageCredentialWithActor(actor, input, admin);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listCopyRecipientsAction(input: {
  signingId: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    if (!isUuid(input.signingId)) {
      throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
    }
    const bundle = await loadSigningAuthorityBundle(
      admin,
      actor,
      input.signingId,
    );
    if (!bundle || !bundle.authority.canRead) {
      throw new SigningError("NOT_FOUND", "Signing not found.");
    }
    if (!bundle.authority.canManage) {
      throw new SigningError(
        "FORBIDDEN",
        "You cannot manage copy recipients for this Signing.",
      );
    }
    const rows = await listActiveCopyRecipients(admin, bundle.signing.id);
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        roleLabel: row.role_label,
        status: row.status,
      })),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addCopyRecipientAction(input: {
  signingId: string;
  email: string;
  displayName?: string;
  roleLabel?: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const row = await addCopyRecipientWithActor(actor, input, admin);
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeCopyRecipientAction(input: {
  signingId: string;
  copyRecipientId: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    await softRemoveCopyRecipientWithActor(actor, input, admin);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function retryFinalizationAction(input: {
  signingId: string;
}): Promise<CompletedOpsActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await requestFinalizationRetryWithActor(actor, input, admin);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}
