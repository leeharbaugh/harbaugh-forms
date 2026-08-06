export const PACKET_FORM_ANNOTATION_TYPES = ["typed_signature"] as const;

export type PacketFormAnnotationType =
  (typeof PACKET_FORM_ANNOTATION_TYPES)[number];

export const PACKET_FORM_SIGNATURE_FONT_ID = "caveat";

export type PacketFormAnnotation = {
  id: string;
  packet_id: number;
  packet_form_id: number;
  page_number: number;
  annotation_type: PacketFormAnnotationType;
  text_value: string;
  font_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  created_by_user_id: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type PacketFormAnnotationInput = {
  page_number: number;
  annotation_type: PacketFormAnnotationType;
  text_value: string;
  font_id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export const PACKET_FORM_ANNOTATION_SELECT = "*";

export function validatePacketFormAnnotationInput(
  input: PacketFormAnnotationInput,
): string | null {
  if (!Number.isFinite(input.page_number) || input.page_number < 1) {
    return "Page number must be at least 1.";
  }
  if (input.annotation_type !== "typed_signature") {
    return "Unsupported annotation type.";
  }
  if (!input.text_value.trim()) {
    return "Signature text is required.";
  }
  if (!Number.isFinite(input.width) || input.width <= 0) {
    return "Width must be positive.";
  }
  if (!Number.isFinite(input.height) || input.height <= 0) {
    return "Height must be positive.";
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return "Coordinates must be finite numbers.";
  }
  return null;
}

export function defaultTypedSignatureSize(text: string): {
  width: number;
  height: number;
} {
  const length = Math.max(4, text.trim().length);
  return {
    width: Math.min(280, Math.max(90, length * 14)),
    height: 36,
  };
}
