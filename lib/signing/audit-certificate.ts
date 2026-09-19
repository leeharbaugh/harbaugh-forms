/**
 * Native Signing Stage 6 Signing-wide audit certificate PDF generator.
 *
 * One canonical immutable certificate per Signing + frozen revision.
 * Chronology stops at audit_history_sequence_boundary (before Complete).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sha256Hex } from "./prepare-pdf";
import type { SigningArtifactRow } from "./artifacts";
import type { SigningEventRow } from "./event-chain";

export type AuditCertificateModel = {
  signingId: string;
  title: string;
  senderTimezone: string;
  responsibleSenderName: string;
  responsibleSenderEmail: string | null;
  brokerageName: string | null;
  frozenRevisionId: string;
  revisionNumber: number;
  sequenceBoundary: number;
  participants: Array<{
    fullName: string;
    email: string;
    optionalRole: string | null;
    status: string;
  }>;
  documents: Array<{
    label: string;
    preparedSha256: string;
    completedSha256: string;
  }>;
  chronology: Array<{
    sequenceNumber: number;
    eventType: string;
    summary: string;
    actorType: string;
    actorDisplayName: string | null;
    occurredAtUtc: string;
    occurredLocal: string;
    responsibleContext: string | null;
  }>;
};

function formatInTimezone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function wrapLines(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export async function buildAuditCertificateModel(options: {
  admin: SupabaseClient;
  signingId: string;
  frozenRevisionId: string;
  sequenceBoundary: number;
  completedArtifacts: SigningArtifactRow[];
}): Promise<AuditCertificateModel> {
  const { admin, signingId, frozenRevisionId, sequenceBoundary } = options;

  const { data: signing, error: signingError } = await admin
    .from("signings")
    .select(
      "id, title, sender_timezone, original_sender_display_name, original_sender_email, originating_organization_id",
    )
    .eq("id", signingId)
    .maybeSingle();
  if (signingError) throw new Error(signingError.message);
  if (!signing) throw new Error("Signing not found for certificate.");

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", signing.originating_organization_id as string)
    .maybeSingle();

  const { data: revision, error: revisionError } = await admin
    .from("signing_package_revisions")
    .select("id, revision_number")
    .eq("id", frozenRevisionId)
    .eq("signing_id", signingId)
    .maybeSingle();
  if (revisionError) throw new Error(revisionError.message);
  if (!revision) throw new Error("Frozen revision not found for certificate.");

  const { data: participants, error: participantsError } = await admin
    .from("signing_package_revision_participants")
    .select(
      "frozen_full_name, frozen_email, frozen_optional_role, signing_participant_id, display_order",
    )
    .eq("signing_id", signingId)
    .eq("package_revision_id", frozenRevisionId)
    .order("display_order", { ascending: true });
  if (participantsError) throw new Error(participantsError.message);

  const participantStatusById = new Map<string, string>();
  const { data: liveParticipants } = await admin
    .from("signing_participants")
    .select("id, participant_status")
    .eq("signing_id", signingId);
  for (const row of liveParticipants ?? []) {
    participantStatusById.set(row.id as string, row.participant_status as string);
  }

  const { data: revDocs, error: revDocsError } = await admin
    .from("signing_package_revision_documents")
    .select(
      "id, signing_document_id, signing_document_version_id, display_order, frozen_display_name",
    )
    .eq("signing_id", signingId)
    .eq("package_revision_id", frozenRevisionId)
    .order("display_order", { ascending: true });
  if (revDocsError) throw new Error(revDocsError.message);

  const versionIds = (revDocs ?? [])
    .map((d) => d.signing_document_version_id as string)
    .filter(Boolean);
  const preparedByVersion = new Map<string, string>();
  if (versionIds.length > 0) {
    const { data: versions, error: versionsError } = await admin
      .from("signing_document_versions")
      .select("id, content_sha256, source_document_name_snapshot")
      .eq("signing_id", signingId)
      .in("id", versionIds);
    if (versionsError) throw new Error(versionsError.message);
    for (const version of versions ?? []) {
      preparedByVersion.set(
        version.id as string,
        (version.content_sha256 as string) ?? "",
      );
    }
  }

  const completedByRevDoc = new Map<string, string>();
  for (const artifact of options.completedArtifacts) {
    if (
      artifact.artifact_category === "COMPLETED_DOCUMENT" &&
      artifact.package_revision_document_id &&
      artifact.content_sha256
    ) {
      completedByRevDoc.set(
        artifact.package_revision_document_id,
        artifact.content_sha256,
      );
    }
  }

  const documents = (revDocs ?? []).map((doc) => {
    const versionId = doc.signing_document_version_id as string;
    const prepared = preparedByVersion.get(versionId) ?? "";
    const completed =
      completedByRevDoc.get(doc.id as string) ?? "";
    if (!prepared || !completed) {
      throw new Error("Certificate requires prepared and completed hashes.");
    }
    return {
      label:
        (doc.frozen_display_name as string | null)?.trim() ||
        "Document",
      preparedSha256: prepared,
      completedSha256: completed,
    };
  });

  const { data: events, error: eventsError } = await admin
    .from("signing_events")
    .select("*")
    .eq("signing_id", signingId)
    .lte("sequence_number", sequenceBoundary)
    .order("sequence_number", { ascending: true });
  if (eventsError) throw new Error(eventsError.message);

  const senderTimezone =
    (signing.sender_timezone as string) || "America/Chicago";

  const chronology = ((events ?? []) as SigningEventRow[])
    .filter((event) => event.visibility !== "SYSTEM_ADMINISTRATOR")
    .map((event) => {
      const details =
        event.details_json && typeof event.details_json === "object"
          ? (event.details_json as Record<string, unknown>)
          : {};
      const responsibleName =
        typeof details.responsibleDisplayName === "string"
          ? details.responsibleDisplayName
          : null;
      const responsibleContext =
        event.actor_type === "TRANSACTION_COORDINATOR" && responsibleName
          ? `On behalf of ${responsibleName}`
          : null;
      return {
        sequenceNumber: event.sequence_number,
        eventType: event.event_type,
        summary: event.summary?.trim() || event.event_type,
        actorType: event.actor_type,
        actorDisplayName: event.actor_display_name,
        occurredAtUtc: event.create_date,
        occurredLocal: formatInTimezone(event.create_date, senderTimezone),
        responsibleContext,
      };
    });

  return {
    signingId,
    title: signing.title as string,
    senderTimezone,
    responsibleSenderName: signing.original_sender_display_name as string,
    responsibleSenderEmail:
      (signing.original_sender_email as string | null) ?? null,
    brokerageName: (org?.name as string | null) ?? null,
    frozenRevisionId,
    revisionNumber: Number(revision.revision_number),
    sequenceBoundary,
    participants: (participants ?? []).map((p) => ({
      fullName: p.frozen_full_name as string,
      email: p.frozen_email as string,
      optionalRole: (p.frozen_optional_role as string | null) ?? null,
      status:
        participantStatusById.get(p.signing_participant_id as string) ??
        "UNKNOWN",
    })),
    documents,
    chronology,
  };
}

export async function renderAuditCertificatePdf(
  model: AuditCertificateModel,
): Promise<{ bytes: Uint8Array; contentSha256: string; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("Signing Audit Certificate");
  pdfDoc.setProducer("Harbaugh Forms Native Signing");
  pdfDoc.setCreator("Harbaugh Forms");
  pdfDoc.setCreationDate(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)));
  pdfDoc.setModificationDate(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)));

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawHeading = (text: string, size = 14) => {
    ensureSpace(size + 16);
    page.drawText(text, {
      x: margin,
      y: y - size,
      size,
      font: bold,
      color: rgb(0.1, 0.1, 0.12),
    });
    y -= size + 10;
  };

  const drawParagraph = (text: string, size = 10) => {
    const lines = wrapLines(font, text, size, maxWidth);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, {
        x: margin,
        y: y - size,
        size,
        font,
        color: rgb(0.12, 0.12, 0.14),
      });
      y -= size + 4;
    }
  };

  drawHeading("Harbaugh Forms — Signing Audit Certificate", 16);
  drawParagraph(
    "This certificate is the immutable Signing-wide completion evidence boundary. Later delivery activity does not modify it.",
  );
  y -= 6;

  drawHeading("Signing");
  drawParagraph(`Reference: ${model.signingId}`);
  drawParagraph(`Title: ${model.title}`);
  drawParagraph(
    `Responsible sender: ${model.responsibleSenderName}${
      model.responsibleSenderEmail ? ` <${model.responsibleSenderEmail}>` : ""
    }`,
  );
  if (model.brokerageName) {
    drawParagraph(`Brokerage: ${model.brokerageName}`);
  }
  drawParagraph(
    `Package revision: ${model.revisionNumber} (${model.frozenRevisionId})`,
  );
  drawParagraph(
    `Human-readable timezone: ${model.senderTimezone} (authoritative timestamps are UTC)`,
  );
  drawParagraph(`Chronology sequence boundary: ${model.sequenceBoundary}`);

  drawHeading("Participants");
  for (const participant of model.participants) {
    drawParagraph(
      `${participant.fullName} <${participant.email}>` +
        (participant.optionalRole ? ` — ${participant.optionalRole}` : "") +
        ` [${participant.status}]`,
    );
  }

  drawHeading("Documents");
  for (const document of model.documents) {
    drawParagraph(document.label);
    drawParagraph(`Prepared PDF SHA-256: ${document.preparedSha256}`);
    drawParagraph(`Completed PDF SHA-256: ${document.completedSha256}`);
    y -= 4;
  }

  drawHeading("Chronology");
  for (const entry of model.chronology) {
    const actor =
      entry.actorDisplayName
        ? `${entry.actorDisplayName} (${entry.actorType})`
        : entry.actorType;
    drawParagraph(
      `#${entry.sequenceNumber} ${entry.occurredLocal} — ${entry.eventType}: ${entry.summary}`,
    );
    drawParagraph(`Actor: ${actor}`);
    if (entry.responsibleContext) {
      drawParagraph(entry.responsibleContext);
    }
    y -= 2;
  }

  drawHeading("Result");
  drawParagraph(
    "Required completed documents and this audit certificate were verified. Signing lifecycle Complete is recorded after this certificate boundary.",
  );

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return {
    bytes,
    contentSha256: sha256Hex(bytes),
    pageCount: pdfDoc.getPageCount(),
  };
}

// Silence unused PDFPage import if tree-shaken oddly in some TS configs.
export type { PDFPage };
