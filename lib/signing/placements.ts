/**
 * Native Signing Stage 5 field placements.
 *
 * A placement is the participant's act of applying an adopted mark to one
 * frozen revision field. Authority comes only from a ceremony browser session:
 * a Stage 4 entry session can never reach this module, because every entry
 * point takes an already-validated `CeremonyWriteContext`.
 *
 * Rules enforced here:
 * - The field must belong to the actionable package revision and to this
 *   participant's revision participant snapshot, and must be SIGNATURE or
 *   INITIALS. DATE_SIGNED is never placed directly.
 * - The first accepted Signature or Initials anywhere in the Signing freezes
 *   the package revision globally; that participant's mark of that type locks.
 * - A linked automatic Date Signed follows its Signature through acceptance,
 *   removal, and replacement, and a replacement gets a fresh server date rather
 *   than reusing the old one.
 * - Every write is idempotent on `signing_field_placements.idempotency_key`, so
 *   a double-submit or retry converges instead of creating a second placement.
 *
 * PostgREST gives no multi-statement transaction, so the freeze/insert/lock
 * sequence is ordered to fail safe: the package is frozen *before* the first
 * placement is inserted (a freeze without a mark only blocks amendments), and
 * every step is a guarded conditional write that a retry re-converges on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lockAdoptedMarkOnFirstUse,
  requireAdoptedMarkForKind,
  type AdoptedMarkKind,
} from "./adopted-marks";
import type { CeremonyWriteContext } from "./ceremony-context";
import { appendCeremonyEvent } from "./ceremony-events";
import { SigningError } from "./errors";
import { isUuid } from "./types";

export type PlacementDisposition = "ACCEPTED" | "REMOVED" | "REPLACED";

export type PlacementView = {
  placementId: string;
  signingFieldId: string;
  signingDocumentVersionId: string;
  adoptedMarkId: string;
  acceptedAt: string;
  renderedSenderLocalDate: string | null;
  disposition: PlacementDisposition;
};

export type PlacementResult = {
  placement: PlacementView;
  linkedDatePlacementIds: string[];
  packageFrozen: boolean;
  /** True when a prior identical request already produced this state. */
  replayed: boolean;
};

const MAX_CLIENT_REQUEST_ID_LENGTH = 200;

function parseClientRequestId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SigningError("INVALID_INPUT", "A client request id is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
    throw new SigningError("INVALID_INPUT", "Client request id is too long.");
  }
  return trimmed;
}

function placementIdempotencyKey(
  operation: "ACCEPT" | "REMOVE" | "REPLACE" | "DATE",
  signingFieldId: string,
  clientRequestId: string,
): string {
  return `${operation}:${signingFieldId}:${clientRequestId}`;
}

function toPlacementView(row: Record<string, unknown>): PlacementView {
  return {
    placementId: row.id as string,
    signingFieldId: row.signing_field_id as string,
    signingDocumentVersionId: row.signing_document_version_id as string,
    adoptedMarkId: row.adopted_mark_id as string,
    acceptedAt: row.accepted_at as string,
    renderedSenderLocalDate:
      (row.rendered_sender_local_date as string | null) ?? null,
    disposition: row.disposition as PlacementDisposition,
  };
}

/**
 * Date Signed is rendered in the sending agent's timezone, so a signature made
 * late in the participant's evening still carries the sender's business date.
 */
export function senderLocalDate(
  senderTimezone: string,
  at: Date = new Date(),
): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is also the Postgres `date` literal.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: senderTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  }
}

type PlaceableField = {
  fieldId: string;
  fieldType: Extract<AdoptedMarkKind, "SIGNATURE" | "INITIALS">;
  revisionDocumentId: string;
  signingDocumentVersionId: string;
  linkedDateFieldIds: string[];
};

/**
 * Resolve a field this participant may place a mark in.
 *
 * Failure is CEREMONY_FORBIDDEN rather than NOT_FOUND: a field id from another
 * revision, another participant, or another Signing must not be distinguishable
 * from one that does not exist.
 */
async function requirePlaceableField(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  signingFieldId: unknown;
}): Promise<PlaceableField> {
  const { admin, context } = options;
  if (!isUuid(options.signingFieldId)) {
    throw new SigningError("INVALID_INPUT", "Invalid field id.");
  }

  const { data: field, error } = await admin
    .from("signing_fields")
    .select(
      "id, field_type, package_revision_document_id, package_revision_participant_id, package_revision_id",
    )
    .eq("id", options.signingFieldId)
    .eq("signing_id", context.session.signingId)
    .eq("package_revision_id", context.packageRevisionId)
    .eq("package_revision_participant_id", context.revisionParticipantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!field) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "That field is not assigned to you in the current version of this Signing.",
    );
  }

  const fieldType = field.field_type as string;
  if (fieldType !== "SIGNATURE" && fieldType !== "INITIALS") {
    throw new SigningError(
      "INVALID_INPUT",
      "Date Signed is applied automatically with its signature.",
    );
  }

  const [
    { data: revisionDocument, error: revisionDocumentError },
    { data: linkedDateFields, error: linkedDateFieldError },
  ] = await Promise.all([
    admin
      .from("signing_package_revision_documents")
      .select("id, signing_document_version_id")
      .eq("id", field.package_revision_document_id as string)
      .eq("signing_id", context.session.signingId)
      .eq("package_revision_id", context.packageRevisionId)
      .maybeSingle(),
    fieldType === "SIGNATURE"
      ? admin
          .from("signing_fields")
          .select("id")
          .eq("signing_id", context.session.signingId)
          .eq("package_revision_id", context.packageRevisionId)
          .eq("package_revision_participant_id", context.revisionParticipantId)
          .eq("field_type", "DATE_SIGNED")
          .eq("linked_signature_field_id", field.id as string)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (revisionDocumentError) throw new Error(revisionDocumentError.message);
  if (linkedDateFieldError) throw new Error(linkedDateFieldError.message);
  if (!revisionDocument) {
    throw new SigningError(
      "CONFLICT",
      "This Signing package changed. Reload this page to continue.",
    );
  }

  return {
    fieldId: field.id as string,
    fieldType,
    revisionDocumentId: revisionDocument.id as string,
    signingDocumentVersionId:
      revisionDocument.signing_document_version_id as string,
    linkedDateFieldIds: (linkedDateFields ?? []).map((row) => row.id as string),
  };
}

async function findPlacementByIdempotencyKey(options: {
  admin: SupabaseClient;
  signingId: string;
  idempotencyKey: string;
}): Promise<PlacementView | null> {
  const { data, error } = await options.admin
    .from("signing_field_placements")
    .select("*")
    .eq("signing_id", options.signingId)
    .eq("idempotency_key", options.idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toPlacementView(data as Record<string, unknown>) : null;
}

async function findAcceptedPlacement(options: {
  admin: SupabaseClient;
  signingId: string;
  signingFieldId: string;
}): Promise<PlacementView | null> {
  const { data, error } = await options.admin
    .from("signing_field_placements")
    .select("*")
    .eq("signing_id", options.signingId)
    .eq("signing_field_id", options.signingFieldId)
    .eq("disposition", "ACCEPTED")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toPlacementView(data as Record<string, unknown>) : null;
}

/**
 * Freeze the package on the first accepted mark anywhere in the Signing.
 *
 * Guarded so it can only ever point the frozen pointer at the revision the
 * participant is acting on, and only while that is still the current revision.
 */
async function freezePackageRevisionOnFirstMark(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
}): Promise<boolean> {
  const { admin, context } = options;
  const { data: frozen, error } = await admin
    .from("signings")
    .update({ frozen_package_revision_id: context.packageRevisionId })
    .eq("id", context.session.signingId)
    .eq("lifecycle_state", "IN_PROGRESS")
    .eq("current_package_revision_id", context.packageRevisionId)
    .is("frozen_package_revision_id", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!frozen) {
    // Either already frozen (normal) or the package moved underneath us.
    const { data: signing, error: readError } = await admin
      .from("signings")
      .select("frozen_package_revision_id, current_package_revision_id")
      .eq("id", context.session.signingId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (
      signing?.frozen_package_revision_id !== context.packageRevisionId ||
      signing?.current_package_revision_id !== context.packageRevisionId
    ) {
      throw new SigningError(
        "CONFLICT",
        "This Signing package changed. Reload this page to review the current documents.",
      );
    }
    return false;
  }

  await appendCeremonyEvent({
    admin,
    signingId: context.session.signingId,
    eventType: "PACKAGE_FROZEN",
    signingParticipantId: context.session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    summary: "Package revision frozen by the first accepted mark",
    detailsJson: { packageRevisionId: context.packageRevisionId },
  });
  return true;
}

/** Accept (or replace) the automatic Date Signed linked to a Signature. */
async function applyLinkedDatePlacements(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  field: PlaceableField;
  adoptedMarkId: string;
  clientRequestId: string;
}): Promise<string[]> {
  const { admin, context, field } = options;
  const placementIds: string[] = [];
  const renderedDate = senderLocalDate(context.session.senderTimezone);

  for (const dateFieldId of field.linkedDateFieldIds) {
    const idempotencyKey = placementIdempotencyKey(
      "DATE",
      dateFieldId,
      options.clientRequestId,
    );
    const replayed = await findPlacementByIdempotencyKey({
      admin,
      signingId: context.session.signingId,
      idempotencyKey,
    });
    if (replayed) {
      placementIds.push(replayed.placementId);
      continue;
    }

    const existing = await findAcceptedPlacement({
      admin,
      signingId: context.session.signingId,
      signingFieldId: dateFieldId,
    });
    if (existing) {
      placementIds.push(existing.placementId);
      continue;
    }

    const { data, error } = await admin
      .from("signing_field_placements")
      .insert({
        signing_id: context.session.signingId,
        signing_field_id: dateFieldId,
        signing_participant_id: context.session.signingParticipantId,
        // A Date Signed is evidence of its Signature act, so it cites the same
        // adopted mark rather than inventing a mark of its own.
        adopted_mark_id: options.adoptedMarkId,
        signing_document_version_id: field.signingDocumentVersionId,
        rendered_sender_local_date: renderedDate,
        disposition: "ACCEPTED",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) placementIds.push(data.id as string);
  }
  return placementIds;
}

/** Mark the Date Signed placements linked to a Signature as no longer effective. */
async function retireLinkedDatePlacements(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  linkedDateFieldIds: string[];
  disposition: "REMOVED" | "REPLACED";
}): Promise<string[]> {
  const retired: string[] = [];
  for (const dateFieldId of options.linkedDateFieldIds) {
    const { data, error } = await options.admin
      .from("signing_field_placements")
      .update({ disposition: options.disposition })
      .eq("signing_id", options.context.session.signingId)
      .eq("signing_field_id", dateFieldId)
      .eq("disposition", "ACCEPTED")
      .select("id");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) retired.push(row.id as string);
  }
  return retired;
}

export async function acceptFieldPlacement(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  signingFieldId: unknown;
  clientRequestId: unknown;
}): Promise<PlacementResult> {
  const { admin, context } = options;
  const clientRequestId = parseClientRequestId(options.clientRequestId);
  const field = await requirePlaceableField({
    admin,
    context,
    signingFieldId: options.signingFieldId,
  });

  const idempotencyKey = placementIdempotencyKey(
    "ACCEPT",
    field.fieldId,
    clientRequestId,
  );
  const replayed = await findPlacementByIdempotencyKey({
    admin,
    signingId: context.session.signingId,
    idempotencyKey,
  });
  if (replayed) {
    return {
      placement: replayed,
      linkedDatePlacementIds: [],
      packageFrozen: false,
      replayed: true,
    };
  }

  const mark = await requireAdoptedMarkForKind({
    admin,
    signingId: context.session.signingId,
    signingParticipantId: context.session.signingParticipantId,
    markKind: field.fieldType,
  });

  // Already accepted by an earlier request: converge instead of failing on the
  // one-ACCEPTED-per-field unique index.
  const alreadyAccepted = await findAcceptedPlacement({
    admin,
    signingId: context.session.signingId,
    signingFieldId: field.fieldId,
  });
  if (alreadyAccepted) {
    return {
      placement: alreadyAccepted,
      linkedDatePlacementIds: [],
      packageFrozen: false,
      replayed: true,
    };
  }

  const packageFrozen = await freezePackageRevisionOnFirstMark({
    admin,
    context,
  });

  const { data: inserted, error: insertError } = await admin
    .from("signing_field_placements")
    .insert({
      signing_id: context.session.signingId,
      signing_field_id: field.fieldId,
      signing_participant_id: context.session.signingParticipantId,
      adopted_mark_id: mark.markId,
      signing_document_version_id: field.signingDocumentVersionId,
      disposition: "ACCEPTED",
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .maybeSingle();
  if (insertError) {
    if (/duplicate key/i.test(insertError.message)) {
      throw new SigningError(
        "CONFLICT",
        "That field was just completed. Reload this page to continue.",
      );
    }
    throw new Error(insertError.message);
  }
  if (!inserted) {
    throw new Error("Failed to record field placement.");
  }
  const placement = toPlacementView(inserted as Record<string, unknown>);

  // Only now is the mark locked: locking before a successful placement would
  // freeze a representation the participant never actually used.
  await lockAdoptedMarkOnFirstUse({
    admin,
    signingId: context.session.signingId,
    markId: mark.markId,
  });

  const linkedDatePlacementIds = await applyLinkedDatePlacements({
    admin,
    context,
    field,
    adoptedMarkId: mark.markId,
    clientRequestId,
  });

  await appendCeremonyEvent({
    admin,
    signingId: context.session.signingId,
    eventType: "FIELD_PLACEMENT_ACCEPTED",
    signingParticipantId: context.session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    signingDocumentVersionId: field.signingDocumentVersionId,
    signingFieldId: field.fieldId,
    signingFieldPlacementId: placement.placementId,
    summary:
      field.fieldType === "SIGNATURE"
        ? "Participant signature accepted"
        : "Participant initials accepted",
    detailsJson: {
      fieldType: field.fieldType,
      linkedDatePlacementIds,
      browserSessionId: context.session.sessionId,
    },
    idempotencyKey: `FIELD_PLACEMENT_ACCEPTED:${placement.placementId}`,
  });

  return {
    placement,
    linkedDatePlacementIds,
    packageFrozen,
    replayed: false,
  };
}

export type RemovePlacementResult = {
  removedPlacementId: string | null;
  removedLinkedDatePlacementIds: string[];
  replayed: boolean;
};

/**
 * Remove an accepted mark before Finish.
 *
 * The linked Date Signed ceases to be effective with it; prior Signature/Date
 * activity stays in `signing_events` as history.
 */
export async function removeFieldPlacement(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  signingFieldId: unknown;
  clientRequestId: unknown;
}): Promise<RemovePlacementResult> {
  const { admin, context } = options;
  parseClientRequestId(options.clientRequestId);
  const field = await requirePlaceableField({
    admin,
    context,
    signingFieldId: options.signingFieldId,
  });

  const accepted = await findAcceptedPlacement({
    admin,
    signingId: context.session.signingId,
    signingFieldId: field.fieldId,
  });
  if (!accepted) {
    // Nothing to remove: a retry of an already-applied removal.
    return {
      removedPlacementId: null,
      removedLinkedDatePlacementIds: [],
      replayed: true,
    };
  }

  const { data: removed, error } = await admin
    .from("signing_field_placements")
    .update({ disposition: "REMOVED" })
    .eq("id", accepted.placementId)
    .eq("signing_id", context.session.signingId)
    .eq("disposition", "ACCEPTED")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!removed) {
    return {
      removedPlacementId: null,
      removedLinkedDatePlacementIds: [],
      replayed: true,
    };
  }

  const removedLinkedDatePlacementIds = await retireLinkedDatePlacements({
    admin,
    context,
    linkedDateFieldIds: field.linkedDateFieldIds,
    disposition: "REMOVED",
  });

  await appendCeremonyEvent({
    admin,
    signingId: context.session.signingId,
    eventType: "FIELD_PLACEMENT_REMOVED",
    signingParticipantId: context.session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    signingDocumentVersionId: field.signingDocumentVersionId,
    signingFieldId: field.fieldId,
    signingFieldPlacementId: accepted.placementId,
    summary:
      field.fieldType === "SIGNATURE"
        ? "Participant removed a signature"
        : "Participant removed initials",
    detailsJson: {
      fieldType: field.fieldType,
      removedLinkedDatePlacementIds,
      browserSessionId: context.session.sessionId,
    },
    idempotencyKey: `FIELD_PLACEMENT_REMOVED:${accepted.placementId}`,
  });

  return {
    removedPlacementId: accepted.placementId,
    removedLinkedDatePlacementIds,
    replayed: false,
  };
}

/**
 * Replace an accepted mark before Finish.
 *
 * The replaced placement keeps its history and points at its successor; a
 * replaced Signature receives a new automatic Date Signed from the new server
 * acceptance time rather than reusing the old value. The adopted mark itself is
 * already locked, so replacement re-uses the same locked representation.
 */
export async function replaceFieldPlacement(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  signingFieldId: unknown;
  clientRequestId: unknown;
}): Promise<PlacementResult> {
  const { admin, context } = options;
  const clientRequestId = parseClientRequestId(options.clientRequestId);
  const field = await requirePlaceableField({
    admin,
    context,
    signingFieldId: options.signingFieldId,
  });

  const idempotencyKey = placementIdempotencyKey(
    "REPLACE",
    field.fieldId,
    clientRequestId,
  );
  const replayed = await findPlacementByIdempotencyKey({
    admin,
    signingId: context.session.signingId,
    idempotencyKey,
  });
  if (replayed) {
    return {
      placement: replayed,
      linkedDatePlacementIds: [],
      packageFrozen: false,
      replayed: true,
    };
  }

  const previous = await findAcceptedPlacement({
    admin,
    signingId: context.session.signingId,
    signingFieldId: field.fieldId,
  });
  if (!previous) {
    throw new SigningError(
      "CONFLICT",
      "There is nothing to replace in that field. Reload this page to continue.",
    );
  }

  const mark = await requireAdoptedMarkForKind({
    admin,
    signingId: context.session.signingId,
    signingParticipantId: context.session.signingParticipantId,
    markKind: field.fieldType,
  });

  // The accepted row is retired first so the one-ACCEPTED-per-field unique
  // index is never violated by the replacement insert.
  const { data: retired, error: retireError } = await admin
    .from("signing_field_placements")
    .update({ disposition: "REPLACED" })
    .eq("id", previous.placementId)
    .eq("signing_id", context.session.signingId)
    .eq("disposition", "ACCEPTED")
    .select("id")
    .maybeSingle();
  if (retireError) throw new Error(retireError.message);
  if (!retired) {
    throw new SigningError(
      "CONFLICT",
      "That field changed while you were replacing it. Reload this page to continue.",
    );
  }

  const retiredDatePlacementIds = await retireLinkedDatePlacements({
    admin,
    context,
    linkedDateFieldIds: field.linkedDateFieldIds,
    disposition: "REPLACED",
  });

  const { data: inserted, error: insertError } = await admin
    .from("signing_field_placements")
    .insert({
      signing_id: context.session.signingId,
      signing_field_id: field.fieldId,
      signing_participant_id: context.session.signingParticipantId,
      adopted_mark_id: mark.markId,
      signing_document_version_id: field.signingDocumentVersionId,
      disposition: "ACCEPTED",
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Failed to replace field placement.");
  }
  const placement = toPlacementView(inserted as Record<string, unknown>);

  await admin
    .from("signing_field_placements")
    .update({ replaced_by_placement_id: placement.placementId })
    .eq("id", previous.placementId)
    .eq("signing_id", context.session.signingId)
    .is("replaced_by_placement_id", null);

  const linkedDatePlacementIds = await applyLinkedDatePlacements({
    admin,
    context,
    field,
    adoptedMarkId: mark.markId,
    clientRequestId,
  });

  for (const retiredDateId of retiredDatePlacementIds) {
    const successor = linkedDatePlacementIds[0] ?? null;
    if (!successor) break;
    await admin
      .from("signing_field_placements")
      .update({ replaced_by_placement_id: successor })
      .eq("id", retiredDateId)
      .eq("signing_id", context.session.signingId)
      .is("replaced_by_placement_id", null);
  }

  await appendCeremonyEvent({
    admin,
    signingId: context.session.signingId,
    eventType: "FIELD_PLACEMENT_REPLACED",
    signingParticipantId: context.session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    signingDocumentVersionId: field.signingDocumentVersionId,
    signingFieldId: field.fieldId,
    signingFieldPlacementId: placement.placementId,
    summary:
      field.fieldType === "SIGNATURE"
        ? "Participant replaced a signature"
        : "Participant replaced initials",
    detailsJson: {
      fieldType: field.fieldType,
      replacedPlacementId: previous.placementId,
      retiredDatePlacementIds,
      linkedDatePlacementIds,
      browserSessionId: context.session.sessionId,
    },
    idempotencyKey: `FIELD_PLACEMENT_REPLACED:${placement.placementId}`,
  });

  return {
    placement,
    linkedDatePlacementIds,
    packageFrozen: false,
    replayed: false,
  };
}

/** Required Signature/Initials fields this participant has not yet completed. */
export async function countOutstandingRequiredFields(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
}): Promise<number> {
  const { admin, context } = options;
  const { data: fields, error } = await admin
    .from("signing_fields")
    .select("id, field_type, is_required")
    .eq("signing_id", context.session.signingId)
    .eq("package_revision_id", context.packageRevisionId)
    .eq("package_revision_participant_id", context.revisionParticipantId)
    .in("field_type", ["SIGNATURE", "INITIALS"])
    .eq("is_required", true);
  if (error) throw new Error(error.message);

  const requiredFieldIds = (fields ?? []).map((row) => row.id as string);
  if (requiredFieldIds.length === 0) return 0;

  const { data: accepted, error: acceptedError } = await admin
    .from("signing_field_placements")
    .select("signing_field_id")
    .eq("signing_id", context.session.signingId)
    .eq("disposition", "ACCEPTED")
    .in("signing_field_id", requiredFieldIds);
  if (acceptedError) throw new Error(acceptedError.message);

  const acceptedIds = new Set(
    (accepted ?? []).map((row) => row.signing_field_id as string),
  );
  return requiredFieldIds.filter((id) => !acceptedIds.has(id)).length;
}
