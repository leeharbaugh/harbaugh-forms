/**
 * Native Signing Stage 6 completed-PDF renderer.
 *
 * Starts from exact prepared `signing_document_version` bytes after integrity
 * verification. Overlays only final effective (ACCEPTED) Signing evidence.
 * Does not use the Fill Form / live packet renderer as ceremony evidence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkitModule from "@pdf-lib/fontkit";
import {
  fitTypedSignatureFontSize,
  typedSignatureFontSize,
} from "@/lib/pdf-text-layout";
import { loadCaveatSignatureFontBytesServer } from "@/lib/signature-font-server";
import {
  assertTrustedIntegrity,
  verifyPreparedDocumentVersionIntegrity,
} from "./integrity";
import { sha256Hex } from "./prepare-pdf";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";

// pdf-lib fontkit interop (same pattern as fill-packet-form-pdf).
const fontkit = (fontkitModule as { default?: unknown }).default ?? fontkitModule;

export type DrawnPathPoint = { x: number; y: number };

export type CompletedPdfRenderResult = {
  bytes: Uint8Array;
  contentSha256: string;
  byteSize: number;
  pageCount: number;
};

/**
 * Validate persisted drawn_path_json for deterministic vector rendering.
 * Residual: stroke width/pressure/multi-stroke segments are not evidenced;
 * Stage 6 uses a fixed stroke and field-local {x,y} points only.
 */
export function parseDrawnPathForRendering(value: unknown): DrawnPathPoint[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(
      "Drawn mark evidence lacks a reproducible point path (need ≥2 {x,y} points).",
    );
  }
  const points: DrawnPathPoint[] = [];
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as { x?: unknown }).x !== "number" ||
      typeof (entry as { y?: unknown }).y !== "number" ||
      !Number.isFinite((entry as { x: number }).x) ||
      !Number.isFinite((entry as { y: number }).y)
    ) {
      throw new Error(
        "Drawn mark evidence schema gap: points must be finite {x,y} numbers.",
      );
    }
    points.push({
      x: (entry as { x: number }).x,
      y: (entry as { y: number }).y,
    });
  }
  return points;
}

function drawTypedMark(options: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  yFromTop: number;
  width: number;
  height: number;
  pageHeight: number;
}) {
  const text = options.text.trim();
  if (!text) return;
  const baseSize = typedSignatureFontSize(options.height);
  const drawSize = fitTypedSignatureFontSize({
    text,
    boxWidth: options.width,
    boxHeight: options.height,
    measureWidth: (value) => options.font.widthOfTextAtSize(value, baseSize),
  });
  const baseline = options.pageHeight - options.yFromTop - drawSize - 1;
  options.page.drawText(text, {
    x: options.x,
    y: Math.max(0, baseline),
    size: drawSize,
    font: options.font,
    color: rgb(0.05, 0.05, 0.08),
  });
}

function drawDateSigned(options: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  yFromTop: number;
  width: number;
  height: number;
  pageHeight: number;
}) {
  const text = options.text.trim();
  if (!text) return;
  const size = Math.min(11, Math.max(7, options.height * 0.55));
  const width = options.font.widthOfTextAtSize(text, size);
  const x = options.x + Math.max(0, (options.width - width) / 2);
  const baseline = options.pageHeight - options.yFromTop - size - 1;
  options.page.drawText(text, {
    x,
    y: Math.max(0, baseline),
    size,
    font: options.font,
    color: rgb(0.05, 0.05, 0.08),
  });
}

function drawDrawnPath(options: {
  page: PDFPage;
  points: DrawnPathPoint[];
  x: number;
  yFromTop: number;
  width: number;
  height: number;
  pageHeight: number;
}) {
  const xs = options.points.map((p) => p.x);
  const ys = options.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);

  const svgParts: string[] = [];
  options.points.forEach((point, index) => {
    const nx = (point.x - minX) / spanX;
    const ny = (point.y - minY) / spanY;
    const px = options.x + nx * options.width;
    // Field-local y grows downward in persisted evidence; PDF y grows up.
    const py =
      options.pageHeight -
      (options.yFromTop + ny * options.height);
    svgParts.push(`${index === 0 ? "M" : "L"} ${px.toFixed(3)} ${py.toFixed(3)}`);
  });

  options.page.drawSvgPath(svgParts.join(" "), {
    borderColor: rgb(0.05, 0.05, 0.08),
    borderWidth: Math.max(0.75, Math.min(options.width, options.height) * 0.03),
  });
}

async function loadPreparedBytes(
  admin: SupabaseClient,
  versionId: string,
): Promise<{ bytes: Uint8Array; expectedSha256: string }> {
  const integrity = await verifyPreparedDocumentVersionIntegrity(admin, versionId);
  assertTrustedIntegrity(integrity);
  if (!integrity.expectedSha256) {
    throw new Error("Prepared version missing expected SHA-256.");
  }

  const { data: version, error } = await admin
    .from("signing_document_versions")
    .select("storage_bucket, storage_object_key, content_sha256")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!version?.storage_object_key) {
    throw new Error("Prepared version storage key missing.");
  }

  const { data, error: downloadError } = await admin.storage
    .from((version.storage_bucket as string) || SIGNING_ARTIFACTS_BUCKET)
    .download(version.storage_object_key as string);
  if (downloadError || !data) {
    throw new Error(downloadError?.message ?? "Prepared PDF download failed.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (sha256Hex(bytes) !== integrity.expectedSha256) {
    throw new Error("Prepared PDF bytes diverged after integrity check.");
  }
  return { bytes, expectedSha256: integrity.expectedSha256 };
}

/**
 * Render one completed document PDF for a frozen revision document.
 */
export async function renderCompletedSigningDocumentPdf(options: {
  admin: SupabaseClient;
  signingId: string;
  packageRevisionId: string;
  packageRevisionDocumentId: string;
  signingDocumentId: string;
  signingDocumentVersionId: string;
}): Promise<CompletedPdfRenderResult> {
  const { bytes: preparedBytes } = await loadPreparedBytes(
    options.admin,
    options.signingDocumentVersionId,
  );

  const { data: fields, error: fieldsError } = await options.admin
    .from("signing_fields")
    .select("id, field_type, page_number, x, y, width, height")
    .eq("signing_id", options.signingId)
    .eq("package_revision_id", options.packageRevisionId)
    .eq("package_revision_document_id", options.packageRevisionDocumentId);
  if (fieldsError) throw new Error(fieldsError.message);

  const fieldIds = (fields ?? []).map((f) => f.id as string);
  const placementsByField = new Map<string, Record<string, unknown>>();

  if (fieldIds.length > 0) {
    const { data: placements, error: placementsError } = await options.admin
      .from("signing_field_placements")
      .select(
        "id, signing_field_id, adopted_mark_id, disposition, rendered_sender_local_date, signing_document_version_id",
      )
      .eq("signing_id", options.signingId)
      .eq("disposition", "ACCEPTED")
      .in("signing_field_id", fieldIds);
    if (placementsError) throw new Error(placementsError.message);

    for (const placement of placements ?? []) {
      if (
        placement.signing_document_version_id !==
        options.signingDocumentVersionId
      ) {
        continue;
      }
      placementsByField.set(
        placement.signing_field_id as string,
        placement as Record<string, unknown>,
      );
    }
  }

  const markIds = [
    ...new Set(
      [...placementsByField.values()]
        .map((p) => p.adopted_mark_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const marksById = new Map<string, Record<string, unknown>>();
  if (markIds.length > 0) {
    const { data: marks, error: marksError } = await options.admin
      .from("signing_adopted_marks")
      .select(
        "id, mark_kind, representation_type, typed_text, drawn_path_json",
      )
      .eq("signing_id", options.signingId)
      .in("id", markIds);
    if (marksError) throw new Error(marksError.message);
    for (const mark of marks ?? []) {
      marksById.set(mark.id as string, mark as Record<string, unknown>);
    }
  }

  const pdfDoc = await PDFDocument.load(preparedBytes);
  pdfDoc.registerFontkit(
    fontkit as Parameters<PDFDocument["registerFontkit"]>[0],
  );

  // Avoid clock/random metadata where pdf-lib allows.
  pdfDoc.setTitle("Completed Signing Document");
  pdfDoc.setProducer("Harbaugh Forms Native Signing");
  pdfDoc.setCreator("Harbaugh Forms");
  pdfDoc.setCreationDate(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)));
  pdfDoc.setModificationDate(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)));

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let signatureFont: PDFFont = helvetica;
  const caveatBytes = await loadCaveatSignatureFontBytesServer();
  if (caveatBytes && caveatBytes.length > 0) {
    signatureFont = await pdfDoc.embedFont(caveatBytes, {
      subset: true,
      customName: "HarbaughCaveat",
    });
  }

  const pages = pdfDoc.getPages();

  for (const field of fields ?? []) {
    const placement = placementsByField.get(field.id as string);
    if (!placement) continue;

    const pageIndex = Number(field.page_number) - 1;
    const page = pages[pageIndex];
    if (!page) {
      throw new Error(`Completed PDF missing page ${field.page_number}.`);
    }

    const pageHeight = page.getHeight();
    const x = Number(field.x);
    const yFromTop = Number(field.y);
    const width = Number(field.width);
    const height = Number(field.height);
    const fieldType = field.field_type as string;

    if (fieldType === "DATE_SIGNED") {
      const dateText = placement.rendered_sender_local_date as string | null;
      if (!dateText) {
        throw new Error("Effective Date Signed placement missing preserved date.");
      }
      drawDateSigned({
        page,
        font: helvetica,
        text: dateText,
        x,
        yFromTop,
        width,
        height,
        pageHeight,
      });
      continue;
    }

    const mark = marksById.get(placement.adopted_mark_id as string);
    if (!mark) {
      throw new Error("Effective placement is missing its adopted mark.");
    }

    const representation = mark.representation_type as string;
    if (representation === "TYPED") {
      const typed = (mark.typed_text as string | null)?.trim() ?? "";
      if (!typed) {
        throw new Error("Typed mark is missing locked typed_text evidence.");
      }
      drawTypedMark({
        page,
        font: signatureFont,
        text: typed,
        x,
        yFromTop,
        width,
        height,
        pageHeight,
      });
      continue;
    }

    if (representation === "DRAWN") {
      const points = parseDrawnPathForRendering(mark.drawn_path_json);
      drawDrawnPath({
        page,
        points,
        x,
        yFromTop,
        width,
        height,
        pageHeight,
      });
      continue;
    }

    throw new Error(`Unsupported mark representation: ${representation}`);
  }

  // Keep object ids stabler across re-saves when possible; pdf-lib may still
  // vary. Callers must reuse a verified artifact rather than re-render.
  const bytes = await pdfDoc.save({ useObjectStreams: false });
  const contentSha256 = sha256Hex(bytes);
  return {
    bytes,
    contentSha256,
    byteSize: bytes.byteLength,
    pageCount: pdfDoc.getPageCount(),
  };
}
