/**
 * Pure helpers for Fill Form annotation placement (browser click path).
 * Kept free of Supabase so unit tests can exercise the same factory the UI uses.
 */
import {
  defaultDateSignedSize,
  PACKET_FORM_DATE_FONT_ID,
} from "@/lib/date-signed-annotation";
import {
  defaultTypedSignatureSize,
  isPacketFormAnnotationType,
  PACKET_FORM_SIGNATURE_FONT_ID,
  type PacketFormAnnotationInput,
  type PacketFormAnnotationType,
  validatePacketFormAnnotationInput,
} from "@/lib/types/packet-form-annotation";
import type { PageMetrics } from "@/lib/types/template-pdf-field";

export type PendingAnnotationPlace = {
  annotation_type: PacketFormAnnotationType;
  text_value: string;
};

export type AnnotationPlacementClick = {
  pageNumber: number;
  metrics: PageMetrics;
  /** Click X relative to the page overlay element. */
  overlayX: number;
  /** Click Y relative to the page overlay element. */
  overlayY: number;
};

/** Default box size for the pending annotation kind (never mixes fonts). */
export function defaultSizeForAnnotationType(
  annotationType: PacketFormAnnotationType,
  text: string,
): { width: number; height: number } {
  if (annotationType === "date_signed") {
    return defaultDateSignedSize(text);
  }
  if (annotationType === "typed_signature") {
    return defaultTypedSignatureSize(text);
  }
  // Exhaustiveness guard — keep allowlist explicit.
  const _never: never = annotationType;
  return _never;
}

export function defaultFontIdForAnnotationType(
  annotationType: PacketFormAnnotationType,
): string {
  if (annotationType === "date_signed") {
    return PACKET_FORM_DATE_FONT_ID;
  }
  if (annotationType === "typed_signature") {
    return PACKET_FORM_SIGNATURE_FONT_ID;
  }
  const _never: never = annotationType;
  return _never;
}

/**
 * Build the create payload for a PDF click while in annotation place mode.
 * This is the authoritative browser-placement factory.
 */
export function buildAnnotationInputFromPlacementClick(
  pending: PendingAnnotationPlace,
  click: AnnotationPlacementClick,
): PacketFormAnnotationInput {
  // Reject unknown types before size/font helpers run (same message as validator).
  if (!isPacketFormAnnotationType(pending.annotation_type)) {
    throw new Error("Unsupported annotation type.");
  }

  const text = pending.text_value.trim();
  const size = defaultSizeForAnnotationType(pending.annotation_type, text);
  const { metrics, pageNumber, overlayX, overlayY } = click;

  const scaleX = metrics.originalWidth / metrics.renderedWidth;
  const scaleY = metrics.originalHeight / metrics.renderedHeight;
  const pdfX = Math.min(
    Math.max(0, metrics.originalWidth - size.width),
    Math.max(0, overlayX * scaleX - size.width / 2),
  );
  const pdfY = Math.min(
    Math.max(0, metrics.originalHeight - size.height),
    Math.max(0, overlayY * scaleY - size.height / 2),
  );

  const input: PacketFormAnnotationInput = {
    page_number: pageNumber,
    annotation_type: pending.annotation_type,
    text_value: text,
    font_id: defaultFontIdForAnnotationType(pending.annotation_type),
    x: pdfX,
    y: pdfY,
    width: size.width,
    height: size.height,
    rotation: 0,
  };

  const validationError = validatePacketFormAnnotationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return input;
}
