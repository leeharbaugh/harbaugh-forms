import "server-only";

import {
  buildAuditUpdateDiff,
  sanitizeAuditMetadata,
  type AuditMetadata,
} from "@/lib/audit/sanitize";
import { MANDATORY_AUDIT_ACTIONS } from "@/lib/audit/constants";
import { createAdminClient } from "@/lib/supabase/admin";

export { buildAuditUpdateDiff, sanitizeAuditMetadata, MANDATORY_AUDIT_ACTIONS };
export type { AuditMetadata };

export type AuditEventCategory =
  | "brokerage"
  | "invitation"
  | "user"
  | "trec"
  | "audit_config"
  | "security"
  | "contact"
  | "property"
  | "form"
  | "packet"
  | "document"
  | "delivery"
  | "compliance"
  | "transaction"
  | "impersonation"
  | "auth";

export type RecordAuditEventInput = {
  actorUserId?: string | null;
  actorProfileId?: string | null;
  actorDisplayName?: string | null;
  actorRoleSnapshot?: string | null;
  organizationId?: string | null;
  brokerageOfficeId?: string | null;
  eventCategory: AuditEventCategory | string;
  action: string;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  summary: string;
  metadata?: AuditMetadata | null;
  correlationId?: string | null;
  success?: boolean;
  failureClassification?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  /** Force write even when ordinary logging is disabled. */
  mandatory?: boolean;
  eventAt?: string | null;
};

export type AuditSettingsRow = {
  id: number;
  create_date: string;
  update_date: string;
  status: string;
  ordinary_logging_enabled: boolean;
  last_changed_by_user_id: string | null;
  last_changed_at: string | null;
};

function isMandatoryEvent(input: RecordAuditEventInput): boolean {
  if (input.mandatory) {
    return true;
  }
  return MANDATORY_AUDIT_ACTIONS.has(input.action);
}

export async function getAuditSettings(): Promise<AuditSettingsRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("audit_settings")
    .select("*")
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as AuditSettingsRow | null) ?? null;
}

export async function isOrdinaryAuditLoggingEnabled(): Promise<boolean> {
  const settings = await getAuditSettings();
  return settings?.ordinary_logging_enabled !== false;
}

/**
 * Centralized trusted audit writer. Uses service-role client so browser
 * clients cannot insert arbitrary rows through RLS.
 */
export async function recordAuditEvent(
  input: RecordAuditEventInput,
): Promise<{ recorded: boolean; id?: number }> {
  const mandatory = isMandatoryEvent(input);
  if (!mandatory) {
    const enabled = await isOrdinaryAuditLoggingEnabled();
    if (!enabled) {
      return { recorded: false };
    }
  }

  const admin = createAdminClient();
  const metadata = sanitizeAuditMetadata(input.metadata);
  const { data, error } = await admin
    .from("audit_events")
    .insert({
      event_at: input.eventAt ?? new Date().toISOString(),
      actor_user_id: input.actorUserId ?? null,
      actor_profile_id: input.actorProfileId ?? input.actorUserId ?? null,
      actor_display_name: input.actorDisplayName ?? null,
      actor_role_snapshot: input.actorRoleSnapshot ?? null,
      organization_id: input.organizationId ?? null,
      brokerage_office_id: input.brokerageOfficeId ?? null,
      event_category: input.eventCategory,
      action: input.action,
      target_entity_type: input.targetEntityType ?? null,
      target_entity_id: input.targetEntityId ?? null,
      summary: input.summary.trim(),
      metadata,
      correlation_id: input.correlationId ?? null,
      success: input.success ?? true,
      failure_classification: input.failureClassification ?? null,
      source_ip: input.sourceIp ?? null,
      user_agent: input.userAgent ?? null,
      is_mandatory: mandatory,
      status: "ACTIVE",
    })
    .select("id")
    .single();

  if (error) {
    // Audit write failures must not crash business flows.
    console.error("[audit] failed to record event", input.action, error.message);
    return { recorded: false };
  }

  return { recorded: true, id: data.id as number };
}

export async function setOrdinaryAuditLoggingEnabled(options: {
  enabled: boolean;
  actorUserId: string;
  actorDisplayName?: string | null;
  actorRoleSnapshot?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: current, error: readError } = await admin
    .from("audit_settings")
    .select("*")
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (readError) {
    return { ok: false, error: readError.message };
  }
  if (!current) {
    return { ok: false, error: "Audit settings row is missing." };
  }

  const { error: updateError } = await admin
    .from("audit_settings")
    .update({
      ordinary_logging_enabled: options.enabled,
      last_changed_by_user_id: options.actorUserId,
      last_changed_at: nowIso,
    })
    .eq("id", current.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await recordAuditEvent({
    actorUserId: options.actorUserId,
    actorDisplayName: options.actorDisplayName,
    actorRoleSnapshot: options.actorRoleSnapshot ?? "ADMIN",
    eventCategory: "audit_config",
    action: options.enabled
      ? "audit_logging_enabled"
      : "audit_logging_disabled",
    targetEntityType: "audit_settings",
    targetEntityId: String(current.id),
    summary: options.enabled
      ? "Ordinary business audit logging was enabled."
      : "Ordinary business audit logging was disabled.",
    metadata: {
      changedFields: ["ordinary_logging_enabled"],
      safeOldValues: {
        ordinary_logging_enabled: current.ordinary_logging_enabled,
      },
      safeNewValues: { ordinary_logging_enabled: options.enabled },
    },
    mandatory: true,
  });

  return { ok: true };
}

export type AuditEventListFilters = {
  page?: number;
  pageSize?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  actorUserId?: string | null;
  organizationId?: string | null;
  brokerageOfficeId?: string | null;
  eventCategory?: string | null;
  action?: string | null;
  targetEntityType?: string | null;
  success?: boolean | null;
};

export type AuditEventRow = {
  id: number;
  create_date: string;
  update_date: string;
  status: string;
  event_at: string;
  actor_user_id: string | null;
  actor_profile_id: string | null;
  actor_display_name: string | null;
  actor_role_snapshot: string | null;
  organization_id: string | null;
  brokerage_office_id: string | null;
  event_category: string;
  action: string;
  target_entity_type: string | null;
  target_entity_id: string | null;
  summary: string;
  metadata: AuditMetadata;
  correlation_id: string | null;
  success: boolean;
  failure_classification: string | null;
  source_ip: string | null;
  user_agent: string | null;
  is_mandatory: boolean;
};

export async function listAuditEvents(filters: AuditEventListFilters = {}): Promise<{
  rows: AuditEventRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = createAdminClient();
  let query = admin
    .from("audit_events")
    .select("*", { count: "exact" })
    .eq("status", "ACTIVE")
    .order("event_at", { ascending: false })
    .range(from, to);

  if (filters.dateFrom) {
    query = query.gte("event_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("event_at", filters.dateTo);
  }
  if (filters.actorUserId) {
    query = query.eq("actor_user_id", filters.actorUserId);
  }
  if (filters.organizationId) {
    query = query.eq("organization_id", filters.organizationId);
  }
  if (filters.brokerageOfficeId) {
    query = query.eq("brokerage_office_id", filters.brokerageOfficeId);
  }
  if (filters.eventCategory) {
    query = query.eq("event_category", filters.eventCategory);
  }
  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.targetEntityType) {
    query = query.eq("target_entity_type", filters.targetEntityType);
  }
  if (typeof filters.success === "boolean") {
    query = query.eq("success", filters.success);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    rows: (data ?? []) as AuditEventRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}
