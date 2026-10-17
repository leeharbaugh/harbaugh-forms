import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "@/lib/signing/errors";
import { requireManageableDraftSigning } from "@/lib/signing/manage";
import {
  mapParticipantsToSlots,
  pickEffectiveTemplate,
  placementCountLabel,
  planTemplateApplication,
  slotKey,
  templateSourceLabel,
  unresolvedSlotNotice,
  type PlacementTemplateApplyPreview,
  type PlacementTemplateApplyResult,
  type PlacementTemplateScope,
} from "@/lib/signing/placement-template-model";
import {
  activeOrganizationIds,
  loadTemplateFields,
  type PlacementTemplateRow,
} from "@/lib/signing/placement-templates";
import type { SigningActor, SigningRow } from "@/lib/signing/types";
import { isUuid } from "@/lib/signing/types";

const TEMPLATE_SELECT =
  "id, form_id, scope_type, owner_user_id, organization_id, status, update_date, copied_from_template_id";

/**
 * The exact Form version of an included Draft document: its Packet form's
 * forms.id, which the selected Draft source snapshot must agree with.
 * Documents without a Form (ad hoc uploads) have none.
 */
async function documentFormId(
  admin: SupabaseClient,
  signing: SigningRow,
  signingDocumentId: string,
): Promise<number | null> {
  const { data: document, error } = await admin
    .from("signing_documents")
    .select("id, included_in_draft, source_packet_form_id, selected_draft_source_snapshot_id")
    .eq("signing_id", signing.id)
    .eq("id", signingDocumentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!document || document.included_in_draft !== true) {
    throw new SigningError("NOT_FOUND", "Signing document not found.");
  }
  if (document.source_packet_form_id == null) return null;

  const { data: packetForm, error: packetFormError } = await admin
    .from("packet_forms")
    .select("form_id")
    .eq("id", document.source_packet_form_id)
    .maybeSingle();
  if (packetFormError) throw new Error(packetFormError.message);
  const formId = (packetForm?.form_id as number | null | undefined) ?? null;
  if (formId == null) return null;

  if (document.selected_draft_source_snapshot_id) {
    const { data: snapshot, error: snapshotError } = await admin
      .from("signing_draft_source_snapshots")
      .select("form_id")
      .eq("signing_id", signing.id)
      .eq("id", document.selected_draft_source_snapshot_id)
      .maybeSingle();
    if (snapshotError) throw new Error(snapshotError.message);
    if ((snapshot?.form_id as number | null | undefined) !== formId) return null;
  }
  return formId;
}

type EffectiveTemplate = {
  scope: PlacementTemplateScope;
  template: PlacementTemplateRow;
  sourceLabel: string;
};

/**
 * Personal (the acting manager's own) fully wins over the Signing's
 * originating organization's template; nothing is merged.
 */
async function resolveEffectiveTemplate(
  admin: SupabaseClient,
  actor: SigningActor,
  signing: SigningRow,
  formId: number,
): Promise<EffectiveTemplate | null> {
  const { data: personalRow, error: personalError } = await admin
    .from("signing_placement_templates")
    .select(TEMPLATE_SELECT)
    .eq("form_id", formId)
    .eq("scope_type", "PERSONAL")
    .eq("owner_user_id", actor.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (personalError) throw new Error(personalError.message);

  let organizationRow: PlacementTemplateRow | null = null;
  const organizationId = signing.originating_organization_id;
  if (!personalRow && organizationId && activeOrganizationIds(actor).includes(organizationId)) {
    const { data, error } = await admin
      .from("signing_placement_templates")
      .select(TEMPLATE_SELECT)
      .eq("form_id", formId)
      .eq("scope_type", "ORGANIZATION")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw new Error(error.message);
    organizationRow = (data as PlacementTemplateRow | null) ?? null;
  }

  const effective = pickEffectiveTemplate({
    personal: (personalRow as PlacementTemplateRow | null) ?? null,
    organization: organizationRow,
  });
  if (!effective) return null;

  let organizationName: string | null = null;
  if (effective.scope === "ORGANIZATION") {
    const { data } = await admin
      .from("organizations")
      .select("name")
      .eq("id", effective.template.organization_id)
      .maybeSingle();
    organizationName = (data?.name as string | null | undefined) ?? null;
  }
  return {
    ...effective,
    sourceLabel: templateSourceLabel({
      scope: effective.scope,
      ownerFirstName: actor.profile.first_name,
      organizationName,
    }),
  };
}

async function countDocumentPlacements(
  admin: SupabaseClient,
  signingId: string,
  signingDocumentId: string,
): Promise<number> {
  const [fields, prepared] = await Promise.all([
    admin
      .from("signing_draft_fields")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", signingId)
      .eq("signing_document_id", signingDocumentId),
    admin
      .from("signing_draft_prepared_content")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", signingId)
      .eq("signing_document_id", signingDocumentId),
  ]);
  if (fields.error) throw new Error(fields.error.message);
  if (prepared.error) throw new Error(prepared.error.message);
  return (fields.count ?? 0) + (prepared.count ?? 0);
}

/** Read-only: what applying the document's effective template would add. */
export async function loadPlacementTemplateApplyPreviewWithActor(
  actor: SigningActor,
  input: { signingId: unknown; signingDocumentId: unknown },
  admin: SupabaseClient,
): Promise<PlacementTemplateApplyPreview> {
  const { signing } = await requireManageableDraftSigning(actor, input.signingId, admin);
  if (!isUuid(input.signingDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }
  const formId = await documentFormId(admin, signing, input.signingDocumentId);
  if (formId == null) return { available: false, reason: "NO_FORM" };
  const effective = await resolveEffectiveTemplate(admin, actor, signing, formId);
  if (!effective) return { available: false, reason: "NO_TEMPLATE" };

  const [fields, participantResult, existingPlacementCount] = await Promise.all([
    loadTemplateFields(admin, effective.template.id),
    admin
      .from("signing_participants")
      .select("id, full_name, role_code, display_order, create_date, participant_status")
      .eq("signing_id", signing.id),
    countDocumentPlacements(admin, signing.id, input.signingDocumentId),
  ]);
  if (participantResult.error) throw new Error(participantResult.error.message);
  const participantRows = participantResult.data ?? [];
  const slotParticipants = mapParticipantsToSlots(
    participantRows.map((row) => ({
      id: row.id as string,
      roleCode: (row.role_code as string | null) ?? null,
      displayOrder: row.display_order as number,
      createDate: row.create_date as string,
      participantStatus: row.participant_status as string,
    })),
  );
  const names = new Map(
    participantRows.map((row) => [row.id as string, row.full_name as string]),
  );
  const plan = planTemplateApplication(fields, slotParticipants);

  return {
    available: true,
    templateId: effective.template.id,
    scope: effective.scope,
    sourceLabel: effective.sourceLabel,
    placementCount: fields.length,
    placementCountLabel: placementCountLabel(fields.length),
    slots: plan.slots.map((row) => ({
      slotKey: slotKey(row.slot),
      label: row.label,
      participantName: row.participantId ? (names.get(row.participantId) ?? null) : null,
      placementCount: row.placementCount,
      notice: row.participantId ? null : unresolvedSlotNotice(row),
    })),
    applicableCount: plan.applicableCount,
    skippedCount: plan.skippedCount,
    existingPlacementCount,
  };
}

const APPLY_ERRORS: Record<string, [SigningError["code"], string]> = {
  PLACEMENT_TEMPLATE_NOT_DRAFT: [
    "CONFLICT",
    "Placement templates can only be applied while the Signing is a Draft.",
  ],
  PLACEMENT_TEMPLATE_DOCUMENT_INVALID: ["NOT_FOUND", "Signing document not found."],
  PLACEMENT_TEMPLATE_FORM_MISMATCH: [
    "CONFLICT",
    "This placement template is for a different form version.",
  ],
  PLACEMENT_TEMPLATE_NOT_AVAILABLE: [
    "CONFLICT",
    "This placement template is no longer available. Review the document again.",
  ],
  PLACEMENT_TEMPLATE_SUPERSEDED: [
    "CONFLICT",
    "Your Personal placement template now applies to this form version. Review the document again.",
  ],
  PLACEMENT_TEMPLATE_REQUEST_REUSED: [
    "IDEMPOTENCY_CONFLICT",
    "This request was already used for a different document.",
  ],
  PLACEMENT_TEMPLATE_REQUEST_INVALID: ["INVALID_INPUT", "Invalid request."],
  PLACEMENT_TEMPLATE_SIGNING_NOT_FOUND: ["NOT_FOUND", "Signing not found."],
};

/**
 * Apply the document's effective template. The browser names only the
 * template, document, and request id; participant mapping, precedence, and
 * the exact Form version are all resolved and revalidated server-side.
 */
export async function applyPlacementTemplateWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    signingDocumentId: unknown;
    templateId: unknown;
    requestId: unknown;
  },
  admin: SupabaseClient,
): Promise<PlacementTemplateApplyResult> {
  const { signing } = await requireManageableDraftSigning(actor, input.signingId, admin);
  if (!isUuid(input.signingDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }
  if (!isUuid(input.templateId)) {
    throw new SigningError("INVALID_INPUT", "Invalid placement template.");
  }
  if (!isUuid(input.requestId)) {
    throw new SigningError("INVALID_INPUT", "Invalid request.");
  }

  const { data: previous, error: previousError } = await admin
    .from("signing_placement_template_applications")
    .select("signing_document_id, template_id, created_count, skipped_count")
    .eq("signing_id", signing.id)
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  if (!previous) {
    const formId = await documentFormId(admin, signing, input.signingDocumentId);
    if (formId == null) {
      throw new SigningError("CONFLICT", "This document has no form version for a placement template.");
    }
    const effective = await resolveEffectiveTemplate(admin, actor, signing, formId);
    if (!effective || effective.template.id !== input.templateId) {
      throw new SigningError(
        "CONFLICT",
        "The placement template for this document changed. Review it again.",
      );
    }
  }

  const { data, error } = await admin.rpc("signing_apply_placement_template", {
    p_signing_id: signing.id,
    p_signing_document_id: input.signingDocumentId,
    p_template_id: input.templateId,
    p_request_id: input.requestId,
    p_actor_user_id: actor.userId,
  });
  if (error) {
    const known = Object.keys(APPLY_ERRORS).find((code) => error.message.includes(code));
    if (known) {
      const [code, message] = APPLY_ERRORS[known];
      throw new SigningError(code, message);
    }
    throw new Error(error.message);
  }
  const result = data as { created: number; skipped: number; replayed: boolean };
  return {
    created: result.created,
    skipped: result.skipped,
    replayed: Boolean(result.replayed),
  };
}
