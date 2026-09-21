/**
 * Minimal post-Complete Signing operations read model.
 * Never exposes raw bearer tokens or wrap material.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { canManageCompletedSigningOperations } from "./completed-package-authority";
import { listActiveCopyRecipients } from "./copy-recipients";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type DeliveryStatusLabel =
  | "Pending"
  | "Processing"
  | "Provider Accepted"
  | "Failed"
  | "Unknown";

export function mapDeliveryStateToLabel(
  deliveryState: string | null | undefined,
): DeliveryStatusLabel {
  switch (deliveryState) {
    case "PENDING":
      return "Pending";
    case "PROCESSING":
      return "Processing";
    case "ACCEPTED":
      return "Provider Accepted";
    case "FAILED":
      return "Failed";
    default:
      return deliveryState ? "Unknown" : "Pending";
  }
}

export type CompletedPackageDeliveryRow = {
  credentialId: string;
  recipientKind: "PARTICIPANT" | "COPY";
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  isCurrent: boolean;
  revokedAt: string | null;
  deliveryState: string | null;
  deliveryLabel: DeliveryStatusLabel;
  lastFailureSafe: string | null;
};

export type CompletedOpsSnapshot = {
  canManage: boolean;
  lifecycleState: string;
  finalizationCondition: string;
  deliveries: CompletedPackageDeliveryRow[];
  copyRecipients: Array<{
    id: string;
    email: string;
    displayName: string | null;
    roleLabel: string | null;
    status: string;
  }>;
  pendingWorkCount: number;
  failedFinalization: boolean;
};

export async function loadCompletedOpsSnapshotForActor(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<CompletedOpsSnapshot | null> {
  if (!isUuid(signingIdRaw)) return null;
  const bundle = await loadSigningAuthorityBundle(admin, actor, signingIdRaw);
  if (!bundle || !bundle.authority.canRead) return null;

  const lifecycleState = bundle.signing.lifecycle_state as string;
  const finalizationCondition = bundle.signing.finalization_condition as string;
  const canManage = canManageCompletedSigningOperations(
    bundle.authority,
    lifecycleState,
  );

  const { count: pendingWorkCount } = await admin
    .from("signing_work_items")
    .select("id", { count: "exact", head: true })
    .eq("signing_id", bundle.signing.id)
    .in("processing_state", ["PENDING", "PROCESSING", "FAILED"]);

  if (lifecycleState !== "COMPLETE") {
    return {
      canManage: false,
      lifecycleState,
      finalizationCondition,
      deliveries: [],
      copyRecipients: [],
      pendingWorkCount: pendingWorkCount ?? 0,
      failedFinalization: finalizationCondition === "FAILED",
    };
  }

  const { data: credentials, error: credError } = await admin
    .from("signing_completed_package_credentials")
    .select(
      "id, signing_participant_id, signing_copy_recipient_id, is_current, revoked_at",
    )
    .eq("signing_id", bundle.signing.id)
    .order("create_date", { ascending: true });
  if (credError) throw new Error(credError.message);

  const { data: instructions, error: instructionError } = await admin
    .from("signing_delivery_instructions")
    .select(
      "id, signing_participant_id, signing_copy_recipient_id, completed_package_credential_id, delivery_state, create_date",
    )
    .eq("signing_id", bundle.signing.id)
    .eq("purpose", "COMPLETED_PACKAGE")
    .order("create_date", { ascending: true });
  if (instructionError) throw new Error(instructionError.message);

  const instructionIds = (instructions ?? []).map((row) => row.id as string);
  const failureByInstruction = new Map<string, string>();
  if (instructionIds.length > 0) {
    const { data: attempts, error: attemptError } = await admin
      .from("signing_delivery_attempts")
      .select(
        "delivery_instruction_id, outcome, failure_detail_safe, attempt_number",
      )
      .in("delivery_instruction_id", instructionIds)
      .order("attempt_number", { ascending: true });
    if (attemptError) throw new Error(attemptError.message);
    for (const attempt of attempts ?? []) {
      const id = attempt.delivery_instruction_id as string;
      if (attempt.outcome === "FAILED") {
        failureByInstruction.set(
          id,
          (attempt.failure_detail_safe as string | null) ??
            "Completed-package delivery failed.",
        );
      } else {
        failureByInstruction.delete(id);
      }
    }
  }

  const latestInstructionByCredential = new Map<
    string,
    { delivery_state: string | null; id: string }
  >();
  for (const row of instructions ?? []) {
    const credentialId = row.completed_package_credential_id as string | null;
    if (!credentialId) continue;
    latestInstructionByCredential.set(credentialId, {
      id: row.id as string,
      delivery_state: (row.delivery_state as string | null) ?? null,
    });
  }

  const participantIds = (credentials ?? [])
    .map((row) => row.signing_participant_id as string | null)
    .filter((id): id is string => Boolean(id));
  const copyIds = (credentials ?? [])
    .map((row) => row.signing_copy_recipient_id as string | null)
    .filter((id): id is string => Boolean(id));

  const participantName = new Map<string, { name: string; email: string }>();
  if (participantIds.length > 0) {
    const { data } = await admin
      .from("signing_participants")
      .select("id, full_name, email")
      .in("id", participantIds);
    for (const row of data ?? []) {
      participantName.set(row.id as string, {
        name: row.full_name as string,
        email: row.email as string,
      });
    }
  }

  const copyName = new Map<
    string,
    { name: string | null; email: string; role: string | null }
  >();
  if (copyIds.length > 0) {
    const { data } = await admin
      .from("signing_copy_recipients")
      .select("id, display_name, email, role_label")
      .in("id", copyIds);
    for (const row of data ?? []) {
      copyName.set(row.id as string, {
        name: (row.display_name as string | null) ?? null,
        email: row.email as string,
        role: (row.role_label as string | null) ?? null,
      });
    }
  }

  const deliveries: CompletedPackageDeliveryRow[] = [];
  for (const row of credentials ?? []) {
    const credentialId = row.id as string;
    const instruction = latestInstructionByCredential.get(credentialId);
    const participantId = row.signing_participant_id as string | null;
    const copyRecipientId = row.signing_copy_recipient_id as string | null;
    if (participantId) {
      const info = participantName.get(participantId);
      deliveries.push({
        credentialId,
        recipientKind: "PARTICIPANT",
        recipientId: participantId,
        recipientName: info?.name ?? "Participant",
        recipientEmail: info?.email ?? "",
        isCurrent: row.is_current === true,
        revokedAt: (row.revoked_at as string | null) ?? null,
        deliveryState: instruction?.delivery_state ?? null,
        deliveryLabel: mapDeliveryStateToLabel(instruction?.delivery_state),
        lastFailureSafe: instruction
          ? failureByInstruction.get(instruction.id) ?? null
          : null,
      });
    } else if (copyRecipientId) {
      const info = copyName.get(copyRecipientId);
      deliveries.push({
        credentialId,
        recipientKind: "COPY",
        recipientId: copyRecipientId,
        recipientName: info?.name ?? "Copy recipient",
        recipientEmail: info?.email ?? "",
        isCurrent: row.is_current === true,
        revokedAt: (row.revoked_at as string | null) ?? null,
        deliveryState: instruction?.delivery_state ?? null,
        deliveryLabel: mapDeliveryStateToLabel(instruction?.delivery_state),
        lastFailureSafe: instruction
          ? failureByInstruction.get(instruction.id) ?? null
          : null,
      });
    }
  }

  const copyRecipients = (await listActiveCopyRecipients(
    admin,
    bundle.signing.id,
  )).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roleLabel: row.role_label,
    status: row.status,
  }));

  return {
    canManage,
    lifecycleState,
    finalizationCondition,
    deliveries,
    copyRecipients,
    pendingWorkCount: pendingWorkCount ?? 0,
    failedFinalization: finalizationCondition === "FAILED",
  };
}
