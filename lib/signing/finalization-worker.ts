/**
 * Native Signing Stage 6 FINALIZE_SIGNING worker.
 *
 * Completes a Signing only after frozen-revision integrity, completed PDFs,
 * one audit certificate, and protected event-chain verification succeed.
 * Delivery is separate and never blocks or rolls back Complete.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  auditCertificateIdempotencyKey,
  buildAuditCertificateObjectKey,
  buildCompletedDocumentObjectKey,
  buildCombinedPackageObjectKey,
  combinedPackageIdempotencyKey,
  completedDocumentIdempotencyKey,
  ensureVerifiedArtifact,
  newOpaqueArtifactId,
  type SigningArtifactRow,
} from "./artifacts";
import {
  buildAuditCertificateModel,
  renderAuditCertificatePdf,
} from "./audit-certificate";
import { FINALIZE_SIGNING_WORK_TYPE } from "./ceremony-finish";
import { renderCompletedSigningDocumentPdf } from "./completed-pdf";
import {
  appendProtectedSigningEvent,
  ensureEventChainState,
  verifySigningEventChain,
} from "./event-chain";
import {
  assertTrustedIntegrity,
  verifyPreparedDocumentVersionIntegrity,
} from "./integrity";
import { sha256Hex } from "./prepare-pdf";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";
import {
  claimSigningWorkItem,
  completeWorkItem,
  failWorkItem,
  newWorkerId,
  renewWorkItemLease,
  workerHoldsLease,
  type SigningWorkItemRow,
} from "./work-items";
import { PDFDocument } from "pdf-lib";
import { enqueueInitialCompletedPackageFanOut } from "./completed-package-delivery";

export const GENERATE_COMBINED_PACKAGE_WORK_TYPE =
  "GENERATE_COMBINED_PACKAGE" as const;

export type FinalizationWorkerResult =
  | {
      status: "COMPLETED" | "FAILED" | "SKIPPED" | "NO_WORK";
      signingId?: string;
      workItemId?: string;
      detail?: string;
    };

type FrozenRevisionDocument = {
  id: string;
  signing_document_id: string;
  signing_document_version_id: string;
  display_order: number;
  frozen_display_name: string;
};

async function setFinalizationCondition(
  admin: SupabaseClient,
  signingId: string,
  condition: "IN_PROGRESS" | "FAILED" | "VERIFIED",
  errorSafe?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    finalization_condition: condition,
  };
  if (errorSafe !== undefined) {
    patch.finalization_last_error_safe = errorSafe;
  }
  const { error } = await admin
    .from("signings")
    .update(patch)
    .eq("id", signingId)
    .eq("lifecycle_state", "IN_PROGRESS");
  if (error) throw new Error(error.message);
}

async function loadSigningForFinalization(
  admin: SupabaseClient,
  signingId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("signings")
    .select(
      "id, lifecycle_state, finalization_condition, frozen_package_revision_id, current_package_revision_id, completed_at, sender_timezone, title, original_sender_display_name",
    )
    .eq("id", signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown> | null) ?? null;
}

async function assertParticipantsFinished(
  admin: SupabaseClient,
  signingId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("signing_participants")
    .select("id, participant_status")
    .eq("signing_id", signingId);
  if (error) throw new Error(error.message);

  const active = (data ?? []).filter(
    (row) => row.participant_status !== "REMOVED",
  );
  if (active.some((row) => row.participant_status === "DECLINED")) {
    throw new Error("SIGNING_DECLINED");
  }
  if (active.some((row) => row.participant_status !== "FINISHED")) {
    throw new Error("PARTICIPANTS_NOT_FINISHED");
  }
}

async function loadFrozenRevisionDocuments(
  admin: SupabaseClient,
  signingId: string,
  frozenRevisionId: string,
): Promise<FrozenRevisionDocument[]> {
  const { data, error } = await admin
    .from("signing_package_revision_documents")
    .select(
      "id, signing_document_id, signing_document_version_id, display_order, frozen_display_name",
    )
    .eq("signing_id", signingId)
    .eq("package_revision_id", frozenRevisionId)
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FrozenRevisionDocument[];
}

async function currentEventTipSequence(
  admin: SupabaseClient,
  signingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("signing_events")
    .select("sequence_number")
    .eq("signing_id", signingId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.sequence_number) : 0;
}

async function ensureCompletedDocuments(options: {
  admin: SupabaseClient;
  signingId: string;
  frozenRevisionId: string;
  documents: FrozenRevisionDocument[];
  workItem: SigningWorkItemRow;
  workerId: string;
}): Promise<SigningArtifactRow[]> {
  const artifacts: SigningArtifactRow[] = [];
  for (const document of options.documents) {
    if (!workerHoldsLease(options.workItem, options.workerId)) {
      const renewed = await renewWorkItemLease({
        admin: options.admin,
        workItemId: options.workItem.id,
        workerId: options.workerId,
      });
      if (!renewed) throw new Error("WORK_ITEM_LEASE_LOST");
      Object.assign(options.workItem, renewed);
    }

    const integrity = await verifyPreparedDocumentVersionIntegrity(
      options.admin,
      document.signing_document_version_id,
    );
    assertTrustedIntegrity(integrity);

    const rendered = await renderCompletedSigningDocumentPdf({
      admin: options.admin,
      signingId: options.signingId,
      packageRevisionId: options.frozenRevisionId,
      packageRevisionDocumentId: document.id,
      signingDocumentId: document.signing_document_id,
      signingDocumentVersionId: document.signing_document_version_id,
    });

    const artifactId = newOpaqueArtifactId();
    const { artifact } = await ensureVerifiedArtifact({
      admin: options.admin,
      signingId: options.signingId,
      packageRevisionId: options.frozenRevisionId,
      artifactCategory: "COMPLETED_DOCUMENT",
      idempotencyKey: completedDocumentIdempotencyKey({
        frozenRevisionId: options.frozenRevisionId,
        packageRevisionDocumentId: document.id,
      }),
      frozenFilename:
        `${document.frozen_display_name.replace(/[^\w.-]+/g, "_")}-completed.pdf`,
      bytes: rendered.bytes,
      pageCount: rendered.pageCount,
      signingDocumentVersionId: document.signing_document_version_id,
      signingDocumentId: document.signing_document_id,
      packageRevisionDocumentId: document.id,
      objectKey: buildCompletedDocumentObjectKey({
        signingId: options.signingId,
        artifactId,
      }),
    });
    artifacts.push(artifact);
  }
  return artifacts;
}

async function ensureAuditCertificate(options: {
  admin: SupabaseClient;
  signingId: string;
  frozenRevisionId: string;
  completedArtifacts: SigningArtifactRow[];
  sequenceBoundary: number;
}): Promise<SigningArtifactRow> {
  const model = await buildAuditCertificateModel({
    admin: options.admin,
    signingId: options.signingId,
    frozenRevisionId: options.frozenRevisionId,
    sequenceBoundary: options.sequenceBoundary,
    completedArtifacts: options.completedArtifacts,
  });
  const rendered = await renderAuditCertificatePdf(model);
  const artifactId = newOpaqueArtifactId();
  const { artifact } = await ensureVerifiedArtifact({
    admin: options.admin,
    signingId: options.signingId,
    packageRevisionId: options.frozenRevisionId,
    artifactCategory: "AUDIT_CERTIFICATE",
    idempotencyKey: auditCertificateIdempotencyKey(options.frozenRevisionId),
    frozenFilename: "signing-audit-certificate.pdf",
    bytes: rendered.bytes,
    pageCount: rendered.pageCount,
    auditHistorySequenceBoundary: options.sequenceBoundary,
    objectKey: buildAuditCertificateObjectKey({
      signingId: options.signingId,
      artifactId,
    }),
  });
  return artifact;
}

async function ensureSigningCompletedEvent(options: {
  admin: SupabaseClient;
  signingId: string;
  frozenRevisionId: string;
  certificate: SigningArtifactRow;
  completedCount: number;
  completedAt: string;
}): Promise<void> {
  await appendProtectedSigningEvent(options.admin, {
    signingId: options.signingId,
    eventType: "SIGNING_COMPLETED",
    actorType: "SYSTEM",
    actorDisplayName: "Native Signing Finalization",
    packageRevisionId: options.frozenRevisionId,
    summary: "Signing finalized and completed",
    detailsJson: {
      completedDocumentCount: options.completedCount,
      certificateArtifactId: options.certificate.id,
      auditHistorySequenceBoundary:
        options.certificate.audit_history_sequence_boundary,
      completedAt: options.completedAt,
    },
    idempotencyKey: `SIGNING_COMPLETED:${options.frozenRevisionId}`,
  });
}

async function commitSigningComplete(options: {
  admin: SupabaseClient;
  signingId: string;
  frozenRevisionId: string;
  certificate: SigningArtifactRow;
  completedCount: number;
}): Promise<{ completed: boolean; completedAt: string }> {
  const signing = await loadSigningForFinalization(
    options.admin,
    options.signingId,
  );
  if (!signing) throw new Error("Signing not found.");

  if (signing.lifecycle_state === "COMPLETE" && signing.completed_at) {
    // Repair path: Complete committed but SIGNING_COMPLETED append crashed.
    await ensureSigningCompletedEvent({
      admin: options.admin,
      signingId: options.signingId,
      frozenRevisionId: options.frozenRevisionId,
      certificate: options.certificate,
      completedCount: options.completedCount,
      completedAt: signing.completed_at as string,
    });
    return {
      completed: true,
      completedAt: signing.completed_at as string,
    };
  }
  if (signing.lifecycle_state !== "IN_PROGRESS") {
    throw new Error(`LIFECYCLE_${signing.lifecycle_state}`);
  }
  if (signing.frozen_package_revision_id !== options.frozenRevisionId) {
    throw new Error("FROZEN_REVISION_CHANGED");
  }

  await assertParticipantsFinished(options.admin, options.signingId);

  if (
    !options.certificate.verified_at ||
    options.certificate.audit_history_sequence_boundary == null
  ) {
    throw new Error("CERTIFICATE_NOT_VERIFIED");
  }

  const chain = await verifySigningEventChain(
    options.admin,
    options.signingId,
    {
      throughSequence: options.certificate.audit_history_sequence_boundary,
    },
  );
  if (!chain.ok) {
    throw new Error(`EVENT_CHAIN_${chain.reason}`);
  }

  // Complete CAS first so Cancel/Decline cannot race after the completion event.
  // Then append SIGNING_COMPLETED (idempotent). Retry repairs a missing event.
  const completedAt = new Date().toISOString();

  const { data: updated, error } = await options.admin
    .from("signings")
    .update({
      lifecycle_state: "COMPLETE",
      finalization_condition: "VERIFIED",
      completed_at: completedAt,
      finalization_last_error_safe: null,
    })
    .eq("id", options.signingId)
    .eq("lifecycle_state", "IN_PROGRESS")
    .eq("frozen_package_revision_id", options.frozenRevisionId)
    .is("completed_at", null)
    .select("id, completed_at")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!updated) {
    const again = await loadSigningForFinalization(
      options.admin,
      options.signingId,
    );
    if (again?.lifecycle_state === "COMPLETE" && again.completed_at) {
      await ensureSigningCompletedEvent({
        admin: options.admin,
        signingId: options.signingId,
        frozenRevisionId: options.frozenRevisionId,
        certificate: options.certificate,
        completedCount: options.completedCount,
        completedAt: again.completed_at as string,
      });
      return {
        completed: true,
        completedAt: again.completed_at as string,
      };
    }
    throw new Error("COMPLETE_CAS_FAILED");
  }

  const finalCompletedAt =
    (updated.completed_at as string | null) ?? completedAt;

  await ensureSigningCompletedEvent({
    admin: options.admin,
    signingId: options.signingId,
    frozenRevisionId: options.frozenRevisionId,
    certificate: options.certificate,
    completedCount: options.completedCount,
    completedAt: finalCompletedAt,
  });

  return {
    completed: true,
    completedAt: finalCompletedAt,
  };
}

async function enqueueCombinedPackageWork(
  admin: SupabaseClient,
  signingId: string,
  frozenRevisionId: string,
): Promise<void> {
  const { error } = await admin.from("signing_work_items").insert({
    signing_id: signingId,
    work_type: GENERATE_COMBINED_PACKAGE_WORK_TYPE,
    idempotency_key: `${GENERATE_COMBINED_PACKAGE_WORK_TYPE}:${frozenRevisionId}`,
    reference_json: {
      signingId,
      packageRevisionId: frozenRevisionId,
    },
    processing_state: "PENDING",
    next_attempt_at: new Date().toISOString(),
  });
  if (error && !/duplicate key/i.test(error.message)) {
    throw new Error(error.message);
  }
}

/**
 * Process one FINALIZE_SIGNING work item (or NO_WORK).
 */
export async function processNextFinalizationWorkItem(options: {
  admin: SupabaseClient;
  workerId?: string;
  signingId?: string;
}): Promise<FinalizationWorkerResult> {
  const workerId = options.workerId ?? newWorkerId("finalize");
  const claimed = await claimSigningWorkItem({
    admin: options.admin,
    workType: FINALIZE_SIGNING_WORK_TYPE,
    workerId,
    signingId: options.signingId,
  });
  if (!claimed) return { status: "NO_WORK" };

  const signingId = claimed.signing_id;
  try {
    await ensureEventChainState(options.admin, signingId);

    const signing = await loadSigningForFinalization(options.admin, signingId);
    if (!signing) throw new Error("Signing not found.");

    if (
      signing.lifecycle_state === "DECLINED" ||
      signing.lifecycle_state === "CANCELLED"
    ) {
      await completeWorkItem({
        admin: options.admin,
        workItemId: claimed.id,
        workerId,
      });
      return {
        status: "SKIPPED",
        signingId,
        workItemId: claimed.id,
        detail: `lifecycle ${signing.lifecycle_state}`,
      };
    }

    if (signing.lifecycle_state === "COMPLETE") {
      await completeWorkItem({
        admin: options.admin,
        workItemId: claimed.id,
        workerId,
      });
      return {
        status: "COMPLETED",
        signingId,
        workItemId: claimed.id,
        detail: "already complete",
      };
    }

    if (signing.lifecycle_state !== "IN_PROGRESS") {
      throw new Error(`Unexpected lifecycle ${signing.lifecycle_state}`);
    }

    const frozenRevisionId = signing.frozen_package_revision_id as
      | string
      | null;
    if (!frozenRevisionId) {
      throw new Error("MISSING_FROZEN_REVISION");
    }

    const refRevision = claimed.reference_json?.packageRevisionId;
    if (typeof refRevision === "string" && refRevision !== frozenRevisionId) {
      throw new Error("WORK_ITEM_REVISION_MISMATCH");
    }

    await assertParticipantsFinished(options.admin, signingId);

    const condition = signing.finalization_condition as string;
    if (!["READY", "IN_PROGRESS", "FAILED"].includes(condition)) {
      throw new Error(`FINALIZATION_NOT_ELIGIBLE:${condition}`);
    }

    await setFinalizationCondition(options.admin, signingId, "IN_PROGRESS", null);

    await appendProtectedSigningEvent(options.admin, {
      signingId,
      eventType: "FINALIZATION_STARTED",
      actorType: "SYSTEM",
      actorDisplayName: "Native Signing Finalization",
      packageRevisionId: frozenRevisionId,
      summary: "Finalization worker started",
      detailsJson: { workItemId: claimed.id, attempt: claimed.attempt_count },
      idempotencyKey: `FINALIZATION_STARTED:${frozenRevisionId}:${claimed.attempt_count}`,
    });

    const documents = await loadFrozenRevisionDocuments(
      options.admin,
      signingId,
      frozenRevisionId,
    );
    if (documents.length === 0) {
      throw new Error("NO_FROZEN_DOCUMENTS");
    }

    const completedArtifacts = await ensureCompletedDocuments({
      admin: options.admin,
      signingId,
      frozenRevisionId,
      documents,
      workItem: claimed,
      workerId,
    });

    // Certificate chronology is fixed before certificate generation and does
    // not include SIGNING_COMPLETED.
    const sequenceBoundary = await currentEventTipSequence(
      options.admin,
      signingId,
    );

    const certificate = await ensureAuditCertificate({
      admin: options.admin,
      signingId,
      frozenRevisionId,
      completedArtifacts,
      sequenceBoundary,
    });

    const chain = await verifySigningEventChain(options.admin, signingId, {
      throughSequence: sequenceBoundary,
    });
    if (!chain.ok) {
      throw new Error(`EVENT_CHAIN_${chain.reason}`);
    }

    if (!workerHoldsLease(claimed, workerId)) {
      const renewed = await renewWorkItemLease({
        admin: options.admin,
        workItemId: claimed.id,
        workerId,
      });
      if (!renewed) throw new Error("WORK_ITEM_LEASE_LOST");
    }

    await commitSigningComplete({
      admin: options.admin,
      signingId,
      frozenRevisionId,
      certificate,
      completedCount: completedArtifacts.length,
    });

    const marked = await completeWorkItem({
      admin: options.admin,
      workItemId: claimed.id,
      workerId,
    });
    if (!marked) {
      // Complete already committed; stale lease must not undo it.
      const again = await loadSigningForFinalization(options.admin, signingId);
      if (again?.lifecycle_state !== "COMPLETE") {
        throw new Error("WORK_ITEM_COMPLETE_WITHOUT_LEASE");
      }
    }

    await enqueueCombinedPackageWork(
      options.admin,
      signingId,
      frozenRevisionId,
    );

    try {
      await enqueueInitialCompletedPackageFanOut(options.admin, signingId);
    } catch (fanOutError) {
      // Delivery must never fail or roll back Complete.
      console.error(
        "[native-signing-completion-delivery] initial fan-out failed:",
        fanOutError instanceof Error ? fanOutError.message : "unknown error",
      );
    }

    return {
      status: "COMPLETED",
      signingId,
      workItemId: claimed.id,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Finalization failed.";

    if (
      message === "SIGNING_DECLINED" ||
      message.startsWith("LIFECYCLE_DECLINED") ||
      message.startsWith("LIFECYCLE_CANCELLED")
    ) {
      await failWorkItem({
        admin: options.admin,
        workItemId: claimed.id,
        workerId,
        errorSafe: message.slice(0, 200),
        retryDelaySeconds: 3600,
      });
      return {
        status: "SKIPPED",
        signingId,
        workItemId: claimed.id,
        detail: message,
      };
    }

    try {
      await setFinalizationCondition(
        options.admin,
        signingId,
        "FAILED",
        message.slice(0, 500),
      );
      await appendProtectedSigningEvent(options.admin, {
        signingId,
        eventType: "FINALIZATION_FAILED",
        actorType: "SYSTEM",
        actorDisplayName: "Native Signing Finalization",
        summary: "Finalization failed",
        detailsJson: { reason: message.slice(0, 200) },
        idempotencyKey: `FINALIZATION_FAILED:${claimed.id}:${claimed.attempt_count}`,
      });
    } catch {
      // Best-effort diagnostics; primary failure already captured.
    }

    await failWorkItem({
      admin: options.admin,
      workItemId: claimed.id,
      workerId,
      errorSafe: message.slice(0, 500),
    });

    return {
      status: "FAILED",
      signingId,
      workItemId: claimed.id,
      detail: message,
    };
  }
}

/**
 * Optional combined package. Failure never affects Complete.
 */
export async function processNextCombinedPackageWorkItem(options: {
  admin: SupabaseClient;
  workerId?: string;
  signingId?: string;
}): Promise<FinalizationWorkerResult> {
  const workerId = options.workerId ?? newWorkerId("combined");
  const claimed = await claimSigningWorkItem({
    admin: options.admin,
    workType: GENERATE_COMBINED_PACKAGE_WORK_TYPE,
    workerId,
    signingId: options.signingId,
  });
  if (!claimed) return { status: "NO_WORK" };

  const signingId = claimed.signing_id;
  try {
    const signing = await loadSigningForFinalization(options.admin, signingId);
    if (!signing || signing.lifecycle_state !== "COMPLETE") {
      throw new Error("COMBINED_REQUIRES_COMPLETE");
    }
    const frozenRevisionId = signing.frozen_package_revision_id as string;
    if (!frozenRevisionId) throw new Error("MISSING_FROZEN_REVISION");

    const { data: artifacts, error } = await options.admin
      .from("signing_artifacts")
      .select("*")
      .eq("signing_id", signingId)
      .eq("package_revision_id", frozenRevisionId)
      .not("verified_at", "is", null);
    if (error) throw new Error(error.message);

    const completed = (artifacts ?? [])
      .filter((row) => row.artifact_category === "COMPLETED_DOCUMENT")
      .sort((a, b) =>
        String(a.package_revision_document_id).localeCompare(
          String(b.package_revision_document_id),
        ),
      );
    const certificate = (artifacts ?? []).find(
      (row) => row.artifact_category === "AUDIT_CERTIFICATE",
    );
    if (!certificate || completed.length === 0) {
      throw new Error("REQUIRED_ARTIFACTS_MISSING");
    }

    // Preserve frozen package document order.
    const docs = await loadFrozenRevisionDocuments(
      options.admin,
      signingId,
      frozenRevisionId,
    );
    const byRevDoc = new Map(
      completed.map((row) => [row.package_revision_document_id as string, row]),
    );
    const orderedCompleted = docs
      .map((doc) => byRevDoc.get(doc.id))
      .filter(Boolean);

    const merged = await PDFDocument.create();
    merged.setTitle("Combined Signing Package");
    merged.setProducer("Harbaugh Forms Native Signing");
    merged.setCreator("Harbaugh Forms");
    merged.setCreationDate(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)));
    merged.setModificationDate(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)));

    for (const artifact of [...orderedCompleted, certificate]) {
      const { data, error: downloadError } = await options.admin.storage
        .from((artifact!.storage_bucket as string) || SIGNING_ARTIFACTS_BUCKET)
        .download(artifact!.storage_object_key as string);
      if (downloadError || !data) {
        throw new Error(downloadError?.message ?? "Combined source missing.");
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (sha256Hex(bytes) !== artifact!.content_sha256) {
        throw new Error("Combined source fingerprint mismatch.");
      }
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }

    const bytes = await merged.save({ useObjectStreams: false });
    const artifactId = newOpaqueArtifactId();
    await ensureVerifiedArtifact({
      admin: options.admin,
      signingId,
      packageRevisionId: frozenRevisionId,
      artifactCategory: "COMBINED_PACKAGE",
      idempotencyKey: combinedPackageIdempotencyKey(frozenRevisionId),
      frozenFilename: "combined-signing-package.pdf",
      bytes,
      pageCount: merged.getPageCount(),
      objectKey: buildCombinedPackageObjectKey({
        signingId,
        artifactId,
      }),
    });

    await completeWorkItem({
      admin: options.admin,
      workItemId: claimed.id,
      workerId,
    });
    return { status: "COMPLETED", signingId, workItemId: claimed.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Combined package failed.";
    await failWorkItem({
      admin: options.admin,
      workItemId: claimed.id,
      workerId,
      errorSafe: message.slice(0, 500),
    });
    return {
      status: "FAILED",
      signingId,
      workItemId: claimed.id,
      detail: message,
    };
  }
}
