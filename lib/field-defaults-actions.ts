"use server";

import {
  FieldDefaultsEditorError,
  loadFormDefaultsEditor,
  softRemoveFieldLevelDefault,
  upsertFieldLevelDefault,
  type FormDefaultsEditorDto,
} from "@/lib/field-defaults-editor";
import type {
  DefaultsEditorScopeTab,
  ScopedDefaultDraft,
} from "@/lib/types/field-defaults-manage";
import type { FieldDefault, FieldDefaultScope } from "@/lib/types/field-default";
import { createClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new FieldDefaultsEditorError(
      "unauthorized",
      "You must be signed in to manage defaults.",
    );
  }
  return { supabase, userId: user.id };
}

function toActionError(error: unknown): { ok: false; error: string } {
  if (error instanceof FieldDefaultsEditorError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Something went wrong." };
}

export async function loadFormDefaultsEditorAction(input: {
  formId: number;
  selectedScope: DefaultsEditorScopeTab;
}): Promise<{ ok: true; data: FormDefaultsEditorDto } | { ok: false; error: string }> {
  try {
    const { supabase, userId } = await requireUserId();
    const data = await loadFormDefaultsEditor(supabase, {
      formId: input.formId,
      userId,
      selectedScope: input.selectedScope,
    });
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

export async function upsertFieldLevelDefaultAction(input: {
  formId: number;
  fieldId: string;
  scope: FieldDefaultScope;
  draft: ScopedDefaultDraft;
}): Promise<{ ok: true; data: FieldDefault } | { ok: false; error: string }> {
  try {
    const { supabase, userId } = await requireUserId();
    // Private owner is always the authenticated user — never from the client.
    const data = await upsertFieldLevelDefault(supabase, {
      userId,
      formId: input.formId,
      fieldId: input.fieldId,
      scope: input.scope,
      draft: input.draft,
    });
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

export async function softRemoveFieldLevelDefaultAction(input: {
  formId: number;
  fieldId: string;
  scope: FieldDefaultScope;
  defaultId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId } = await requireUserId();
    await softRemoveFieldLevelDefault(supabase, {
      userId,
      formId: input.formId,
      fieldId: input.fieldId,
      scope: input.scope,
      defaultId: input.defaultId,
    });
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
