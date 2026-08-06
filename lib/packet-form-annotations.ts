import { assertPacketFormAllowsValueMutation } from "@/lib/packet-form-lifecycle";
import {
  PACKET_FORM_ANNOTATION_SELECT,
  PACKET_FORM_DATE_FONT_ID,
  PACKET_FORM_SIGNATURE_FONT_ID,
  type PacketFormAnnotation,
  type PacketFormAnnotationInput,
  validatePacketFormAnnotationInput,
} from "@/lib/types/packet-form-annotation";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadActivePacketFormAnnotations(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<PacketFormAnnotation[]> {
  const { data, error } = await supabase
    .from("packet_form_annotations")
    .select(PACKET_FORM_ANNOTATION_SELECT)
    .eq("packet_form_id", packetFormId)
    .eq("status", "ACTIVE")
    .order("create_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PacketFormAnnotation[];
}

function defaultFontIdForType(
  input: PacketFormAnnotationInput,
): string {
  if (input.font_id?.trim()) {
    return input.font_id.trim();
  }
  return input.annotation_type === "date_signed"
    ? PACKET_FORM_DATE_FONT_ID
    : PACKET_FORM_SIGNATURE_FONT_ID;
}

/** Create any supported Fill Form annotation (signature or date signed). */
export async function createPacketFormAnnotation(
  supabase: SupabaseClient,
  params: {
    packetId: number;
    packetFormId: number;
    /** Authenticated user; DB trigger overwrites created_by_user_id with auth.uid(). */
    userId: string;
    input: PacketFormAnnotationInput;
  },
): Promise<PacketFormAnnotation> {
  await assertPacketFormAllowsValueMutation(supabase, params.packetFormId);

  const validationError = validatePacketFormAnnotationInput(params.input);
  if (validationError) {
    throw new Error(validationError);
  }

  // created_by_user_id is set for clarity; the BEFORE INSERT trigger replaces it
  // with auth.uid() for authenticated sessions (client UUID is not trusted).
  const { data, error } = await supabase
    .from("packet_form_annotations")
    .insert({
      packet_id: params.packetId,
      packet_form_id: params.packetFormId,
      page_number: params.input.page_number,
      annotation_type: params.input.annotation_type,
      text_value: params.input.text_value.trim(),
      font_id: defaultFontIdForType(params.input),
      x: params.input.x,
      y: params.input.y,
      width: params.input.width,
      height: params.input.height,
      rotation: params.input.rotation ?? 0,
      created_by_user_id: params.userId,
      status: "ACTIVE",
    })
    .select(PACKET_FORM_ANNOTATION_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PacketFormAnnotation;
}

/** @deprecated Prefer createPacketFormAnnotation — kept for call-site clarity. */
export async function createTypedSignatureAnnotation(
  supabase: SupabaseClient,
  params: {
    packetId: number;
    packetFormId: number;
    userId: string;
    input: PacketFormAnnotationInput;
  },
): Promise<PacketFormAnnotation> {
  return createPacketFormAnnotation(supabase, {
    ...params,
    input: {
      ...params.input,
      annotation_type: "typed_signature",
      font_id: params.input.font_id ?? PACKET_FORM_SIGNATURE_FONT_ID,
    },
  });
}

export async function createDateSignedAnnotation(
  supabase: SupabaseClient,
  params: {
    packetId: number;
    packetFormId: number;
    userId: string;
    input: Omit<PacketFormAnnotationInput, "annotation_type" | "font_id"> & {
      font_id?: string;
    };
  },
): Promise<PacketFormAnnotation> {
  return createPacketFormAnnotation(supabase, {
    ...params,
    input: {
      ...params.input,
      annotation_type: "date_signed",
      font_id: params.input.font_id ?? PACKET_FORM_DATE_FONT_ID,
    },
  });
}

export async function updatePacketFormAnnotationPlacement(
  supabase: SupabaseClient,
  params: {
    annotationId: string;
    packetFormId: number;
    x: number;
    y: number;
    width: number;
    height: number;
    page_number?: number;
    text_value?: string;
  },
): Promise<PacketFormAnnotation> {
  await assertPacketFormAllowsValueMutation(supabase, params.packetFormId);

  const updates: Record<string, number | string> = {
    x: params.x,
    y: params.y,
    width: params.width,
    height: params.height,
  };
  if (params.page_number != null) {
    updates.page_number = params.page_number;
  }
  if (params.text_value != null) {
    updates.text_value = params.text_value.trim();
  }
  // Never include created_by_user_id — DB trigger also rejects changes.

  const { data, error } = await supabase
    .from("packet_form_annotations")
    .update(updates)
    .eq("id", params.annotationId)
    .eq("packet_form_id", params.packetFormId)
    .eq("status", "ACTIVE")
    .select(PACKET_FORM_ANNOTATION_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PacketFormAnnotation;
}

export async function softDeletePacketFormAnnotation(
  supabase: SupabaseClient,
  params: { annotationId: string; packetFormId: number },
): Promise<void> {
  await assertPacketFormAllowsValueMutation(supabase, params.packetFormId);

  const { error } = await supabase
    .from("packet_form_annotations")
    .update({ status: "DELETED" })
    .eq("id", params.annotationId)
    .eq("packet_form_id", params.packetFormId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }
}
