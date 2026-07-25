"use server";

import "server-only";

import {
  assertFormAllowsStructuralEdit,
  structuralFieldPatchHasChanges,
  type StructuralFieldPatch,
} from "@/lib/types/form-lifecycle";
import {
  canEditForm,
  isActiveAppAdmin,
  LIBRARY_PERMISSION_DENIED,
  type LibraryActor,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import {
  FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE,
  isFormPublished,
} from "@/lib/types/form-lifecycle";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function loadFormForMutation(formId: number): Promise<
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      actor: LibraryActor;
      form: {
        id: number;
        status: string;
        publication_state: string;
        scope: string;
        owner_user_id: string | null;
      };
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { data: form, error } = await supabase
    .from("forms")
    .select("id, status, publication_state, scope, owner_user_id")
    .eq("id", formId)
    .single();

  if (error || !form) {
    return { ok: false, error: error?.message ?? "Form not found." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, app_role, onboarding_status")
    .eq("id", user.id)
    .maybeSingle();

  const actor: LibraryActor = {
    userId: user.id,
    isActiveAdmin: isActiveAppAdmin(profile),
  };

  if (!canEditForm(actor, form)) {
    return { ok: false, error: LIBRARY_PERMISSION_DENIED };
  }

  return {
    ok: true,
    supabase,
    actor,
    form: form as {
      id: number;
      status: string;
      publication_state: string;
      scope: string;
      owner_user_id: string | null;
    },
  };
}

/**
 * Update shared catalog field metadata/source through a form's Map Fields
 * workflow. Rejects when the initiating form is Published or Retired.
 */
export async function updateFieldThroughFormEditor(input: {
  formId: number;
  fieldId: string;
  patch: StructuralFieldPatch;
}): Promise<ActionResult> {
  try {
    if (!structuralFieldPatchHasChanges(input.patch)) {
      return { ok: true };
    }

    const loaded = await loadFormForMutation(input.formId);
    if (!loaded.ok) {
      return loaded;
    }

    const structural = assertFormAllowsStructuralEdit(loaded.form);
    if (!structural.ok) {
      return structural;
    }

    const { data: mapping, error: mappingError } = await loaded.supabase
      .from("form_field_mappings")
      .select("id")
      .eq("form_id", input.formId)
      .eq("field_id", input.fieldId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();

    if (mappingError) {
      return { ok: false, error: mappingError.message };
    }
    if (!mapping) {
      return {
        ok: false,
        error: "That field is not mapped on this form.",
      };
    }

    // Shared Global field used on other PUBLISHED forms: admin confirmation
    // is enforced in the UI; non-admins are already blocked from Global fields
    // by RLS. Re-check published usage for non-admins as defense in depth.
    if (!loaded.actor.isActiveAdmin) {
      const { data: otherMappings } = await loaded.supabase
        .from("form_field_mappings")
        .select("form_id")
        .eq("field_id", input.fieldId)
        .eq("status", "ACTIVE")
        .neq("form_id", input.formId);

      const otherFormIds = [
        ...new Set(
          ((otherMappings ?? []) as { form_id: number }[]).map((row) => row.form_id),
        ),
      ];
      if (otherFormIds.length > 0) {
        const { data: publishedPeers } = await loaded.supabase
          .from("forms")
          .select("id")
          .in("id", otherFormIds)
          .eq("status", "ACTIVE")
          .eq("publication_state", "PUBLISHED")
          .limit(1);
        if ((publishedPeers ?? []).length > 0) {
          return {
            ok: false,
            error:
              "This Global field is used on published forms. Only an application admin can change its metadata.",
          };
        }
      }
    }

    const { error: updateError } = await loaded.supabase
      .from("fields")
      .update(input.patch)
      .eq("id", input.fieldId)
      .eq("status", "ACTIVE");

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE,
    };
  }
}

export async function assertFormStructureEditableAction(
  formId: number,
): Promise<ActionResult> {
  const loaded = await loadFormForMutation(formId);
  if (!loaded.ok) {
    return loaded;
  }
  if (isFormPublished(loaded.form)) {
    return { ok: false, error: FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE };
  }
  return assertFormAllowsStructuralEdit(loaded.form);
}
