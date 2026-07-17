import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentState, PacketForm } from "@/lib/types/packet";
import {
  canMarkPacketFormFinal,
  canReopenPacketFormToDraft,
  isPacketFormValueEditable,
  isValidPacketFormLifecycleTransition,
  packetFormLifecycleBlockedMessage,
} from "@/lib/types/packet-form-lifecycle";

export type PacketFormLifecycleRow = Pick<
  PacketForm,
  "id" | "packet_id" | "document_state" | "status" | "owner_user_id"
>;

export class PacketFormLifecycleError extends Error {
  readonly code:
    | "not_found"
    | "not_active"
    | "not_editable"
    | "invalid_transition"
    | "unauthorized"
    | "stale_state";

  constructor(
    code: PacketFormLifecycleError["code"],
    message: string,
  ) {
    super(message);
    this.name = "PacketFormLifecycleError";
    this.code = code;
  }
}

export async function loadPacketFormLifecycleRow(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<PacketFormLifecycleRow> {
  const { data, error } = await supabase
    .from("packet_forms")
    .select("id, packet_id, document_state, status, owner_user_id")
    .eq("id", packetFormId)
    .single();

  if (error || !data) {
    throw new PacketFormLifecycleError(
      "not_found",
      error?.message ?? "Packet form not found.",
    );
  }

  return data as PacketFormLifecycleRow;
}

export async function assertPacketFormAllowsValueMutation(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<PacketFormLifecycleRow> {
  const row = await loadPacketFormLifecycleRow(supabase, packetFormId);

  if (row.status !== "ACTIVE") {
    throw new PacketFormLifecycleError(
      "not_active",
      "Only active packet forms can be edited.",
    );
  }

  if (!isPacketFormValueEditable(row.document_state, row.status)) {
    throw new PacketFormLifecycleError(
      "not_editable",
      packetFormLifecycleBlockedMessage(row.document_state),
    );
  }

  return row;
}

export async function assertFieldInstancePacketFormEditable(
  supabase: SupabaseClient,
  fieldInstanceId: string,
): Promise<PacketFormLifecycleRow> {
  const { data, error } = await supabase
    .from("field_instances")
    .select("id, packet_form_id")
    .eq("id", fieldInstanceId)
    .eq("status", "ACTIVE")
    .single();

  if (error || !data?.packet_form_id) {
    throw new PacketFormLifecycleError(
      "not_found",
      error?.message ?? "Field instance not found.",
    );
  }

  return assertPacketFormAllowsValueMutation(supabase, data.packet_form_id);
}

/**
 * Ensure missing mapped instances exist (insert-only), then DRAFT → FINAL.
 * Does not recalculate existing snapshots.
 */
export async function markPacketFormFinal(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<PacketFormLifecycleRow> {
  const row = await loadPacketFormLifecycleRow(supabase, packetFormId);

  if (row.status !== "ACTIVE") {
    throw new PacketFormLifecycleError(
      "not_active",
      "Only active packet forms can be marked Final.",
    );
  }

  if (!canMarkPacketFormFinal(row.document_state, row.status)) {
    throw new PacketFormLifecycleError(
      "invalid_transition",
      `Only Draft forms can be marked Final (current state: ${row.document_state}).`,
    );
  }

  const { ensureFieldInstancesForPacketForm } = await import(
    "@/lib/field-instances"
  );
  await ensureFieldInstancesForPacketForm(supabase, packetFormId);

  const { data, error } = await supabase
    .from("packet_forms")
    .update({ document_state: "FINAL" satisfies DocumentState })
    .eq("id", packetFormId)
    .eq("status", "ACTIVE")
    .eq("document_state", "DRAFT")
    .select("id, packet_id, document_state, status, owner_user_id")
    .maybeSingle();

  if (error) {
    throw new PacketFormLifecycleError("unauthorized", error.message);
  }

  if (!data) {
    throw new PacketFormLifecycleError(
      "stale_state",
      "This form is no longer a Draft. Reload and try again.",
    );
  }

  return data as PacketFormLifecycleRow;
}

/**
 * FINAL → DRAFT only. Does not refresh or recalculate values.
 */
export async function reopenPacketFormToDraft(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<PacketFormLifecycleRow> {
  const row = await loadPacketFormLifecycleRow(supabase, packetFormId);

  if (row.status !== "ACTIVE") {
    throw new PacketFormLifecycleError(
      "not_active",
      "Only active packet forms can be reopened.",
    );
  }

  if (!canReopenPacketFormToDraft(row.document_state, row.status)) {
    if (row.document_state === "SIGNED") {
      throw new PacketFormLifecycleError(
        "invalid_transition",
        "Signed forms cannot be reopened.",
      );
    }
    throw new PacketFormLifecycleError(
      "invalid_transition",
      `Only Final forms can be reopened as Draft (current state: ${row.document_state}).`,
    );
  }

  if (!isValidPacketFormLifecycleTransition(row.document_state, "DRAFT")) {
    throw new PacketFormLifecycleError(
      "invalid_transition",
      "Invalid lifecycle transition.",
    );
  }

  const { data, error } = await supabase
    .from("packet_forms")
    .update({ document_state: "DRAFT" satisfies DocumentState })
    .eq("id", packetFormId)
    .eq("status", "ACTIVE")
    .eq("document_state", "FINAL")
    .select("id, packet_id, document_state, status, owner_user_id")
    .maybeSingle();

  if (error) {
    throw new PacketFormLifecycleError("unauthorized", error.message);
  }

  if (!data) {
    throw new PacketFormLifecycleError(
      "stale_state",
      "This form is no longer Final. Reload and try again.",
    );
  }

  return data as PacketFormLifecycleRow;
}
