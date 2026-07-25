"use server";

import "server-only";

import { requireAppAdmin } from "@/lib/admin/require-app-admin";
import { activatePendingPacketFormsForPublishedForm } from "@/lib/forms/activate-pending-packet-forms";
import { loadFormPdfPageCount } from "@/lib/forms/form-pdf-page-count";
import { validateFormForPublish } from "@/lib/forms/publish-validation";
import {
  canPublishForm,
  canRestoreForm,
  canRetireForm,
  canUnpublishForm,
  type PublishConflict,
} from "@/lib/types/form-lifecycle";
import {
  canEditForm,
  isActiveAppAdmin,
  LIBRARY_PERMISSION_DENIED,
  type LibraryActor,
} from "@/lib/library-permissions";
import { createClient } from "@/lib/supabase/server";
import type { FormLibraryScope } from "@/lib/form-storage";

export type FormLifecycleActionResult =
  | {
      ok: true;
      message: string;
      activatedPendingCount?: number;
      conflict?: PublishConflict | null;
    }
  | { ok: false; error: string; conflict?: PublishConflict | null };

type FormLifecycleRow = {
  id: number;
  form_name: string;
  form_code: string;
  version_label: string | null;
  form_family_key: string;
  source_storage_path: string;
  status: string;
  publication_state: string;
  scope: string;
  owner_user_id: string | null;
  organization_id: string | null;
};

async function loadActor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<LibraryActor> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, app_role, onboarding_status")
    .eq("id", userId)
    .maybeSingle();

  return {
    userId,
    isActiveAdmin: isActiveAppAdmin(profile),
  };
}

async function requireMutator(formId: number): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  form: FormLifecycleRow;
  actor: LibraryActor;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const { data, error } = await supabase
    .from("forms")
    .select(
      "id, form_name, form_code, version_label, form_family_key, source_storage_path, status, publication_state, scope, owner_user_id, organization_id",
    )
    .eq("id", formId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Form not found.");
  }

  const form = data as FormLifecycleRow;
  const actor = await loadActor(supabase, user.id);
  if (!canEditForm(actor, form)) {
    throw new Error(LIBRARY_PERMISSION_DENIED);
  }

  return { supabase, userId: user.id, form, actor };
}

export async function findPublishedFamilyConflict(
  formId: number,
): Promise<FormLifecycleActionResult & { conflict?: PublishConflict | null }> {
  try {
    const { supabase, form } = await requireMutator(formId);

    let query = supabase
      .from("forms")
      .select("id, form_name, version_label, form_family_key")
      .eq("status", "ACTIVE")
      .eq("publication_state", "PUBLISHED")
      .eq("scope", form.scope)
      .ilike("form_family_key", form.form_family_key)
      .neq("id", form.id)
      .limit(1);

    if (form.scope === "PRIVATE") {
      query = query.eq("owner_user_id", form.owner_user_id!);
    } else if (form.scope === "ORGANIZATION") {
      query = query.eq("organization_id", form.organization_id!);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: true, message: "No published conflict.", conflict: null };
    }

    const conflict: PublishConflict = {
      publishedFormId: data.id as number,
      formName: data.form_name as string,
      versionLabel: (data.version_label as string | null) ?? null,
      formFamilyKey: data.form_family_key as string,
    };
    return {
      ok: true,
      message: "A published version already exists in this family.",
      conflict,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Conflict check failed.",
    };
  }
}

export async function previewPublishForm(
  formId: number,
  options?: { allowEmptyMappings?: boolean },
): Promise<
  | {
      ok: true;
      mappingCount: number;
      requiresEmptyMappingsConfirmation: boolean;
      conflict: PublishConflict | null;
      issues: Array<{ code: string; message: string; blocking: boolean }>;
      pdfPageCount: number | null;
    }
  | { ok: false; error: string }
> {
  try {
    const { supabase, form } = await requireMutator(formId);

    const { data: mappings, error: mappingError } = await supabase
      .from("form_field_mappings")
      .select(
        "id, field_id, page_number, status, pdf_field_name, occurrence_index, mapping_name",
      )
      .eq("form_id", formId)
      .eq("status", "ACTIVE");

    if (mappingError) {
      return { ok: false, error: mappingError.message };
    }

    const fieldIds = [
      ...new Set(
        ((mappings ?? []) as { field_id: string | null }[])
          .map((row) => row.field_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const fieldsById = new Map<
      string,
      {
        id: string;
        status: string;
        source_type: string | null;
        resolver_key: string | null;
        field_key: string | null;
        field_label: string | null;
        field_name: string | null;
      }
    >();

    if (fieldIds.length > 0) {
      const { data: fields, error: fieldError } = await supabase
        .from("fields")
        .select(
          "id, status, source_type, resolver_key, field_key, field_label, field_name",
        )
        .in("id", fieldIds);
      if (fieldError) {
        return { ok: false, error: fieldError.message };
      }
      for (const field of fields ?? []) {
        fieldsById.set(field.id as string, field as {
          id: string;
          status: string;
          source_type: string | null;
          resolver_key: string | null;
          field_key: string | null;
          field_label: string | null;
          field_name: string | null;
        });
      }
    }

    const pdfResult = await loadFormPdfPageCount(supabase, {
      id: form.id,
      form_code: form.form_code,
      source_storage_path: form.source_storage_path,
      scope: form.scope as FormLibraryScope,
      owner_user_id: form.owner_user_id,
    });

    const validation = validateFormForPublish({
      form,
      mappings: (mappings ?? []) as Parameters<
        typeof validateFormForPublish
      >[0]["mappings"],
      fieldsById,
      pdfPageCount: pdfResult.ok ? pdfResult.pageCount : null,
      pdfLoadError: pdfResult.ok ? null : pdfResult.message,
      allowEmptyMappings: Boolean(options?.allowEmptyMappings),
    });

    const conflictResult = await findPublishedFamilyConflict(formId);
    const conflict =
      conflictResult.ok ? (conflictResult.conflict ?? null) : null;

    return {
      ok: true,
      mappingCount: validation.mappingCount,
      requiresEmptyMappingsConfirmation:
        validation.requiresEmptyMappingsConfirmation,
      conflict,
      issues: validation.issues,
      pdfPageCount: validation.pdfPageCount,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Preview failed.",
    };
  }
}

export async function publishFormTemplate(input: {
  formId: number;
  retirePreviousFormId?: number | null;
  allowEmptyMappings?: boolean;
  reason?: string | null;
}): Promise<FormLifecycleActionResult> {
  try {
    const { supabase, form } = await requireMutator(input.formId);

    if (!canPublishForm(form)) {
      return { ok: false, error: "Only ACTIVE Draft forms can be published." };
    }

    const preview = await previewPublishForm(input.formId, {
      allowEmptyMappings: input.allowEmptyMappings,
    });
    if (!preview.ok) {
      return preview;
    }

    const blocking = preview.issues.filter((issue) => issue.blocking);
    if (blocking.length > 0) {
      return { ok: false, error: blocking[0]!.message };
    }

    if (preview.conflict && !input.retirePreviousFormId) {
      return {
        ok: false,
        error:
          "A published version already exists in this form family. Choose to publish and retire the previous version, or cancel.",
        conflict: preview.conflict,
      };
    }

    if (
      preview.conflict &&
      input.retirePreviousFormId &&
      input.retirePreviousFormId !== preview.conflict.publishedFormId
    ) {
      return {
        ok: false,
        error: "The selected previous version does not match the current published form.",
        conflict: preview.conflict,
      };
    }

    const { error } = await supabase.rpc("publish_form_template", {
      p_form_id: input.formId,
      p_retire_form_id: input.retirePreviousFormId ?? null,
      p_reason: input.reason ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const activation = await activatePendingPacketFormsForPublishedForm(
      supabase,
      input.formId,
    );

    const retiredNote = input.retirePreviousFormId
      ? ` Previous version #${input.retirePreviousFormId} was retired.`
      : "";
    const activatedNote =
      activation.activatedCount > 0
        ? ` Activated ${activation.activatedCount} pending packet form(s).`
        : "";

    return {
      ok: true,
      message: `Published “${form.form_name}”.${retiredNote}${activatedNote}`,
      activatedPendingCount: activation.activatedCount,
      conflict: preview.conflict,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Publish failed.",
    };
  }
}

export async function unpublishFormTemplate(input: {
  formId: number;
  reason?: string | null;
}): Promise<FormLifecycleActionResult> {
  try {
    const { supabase, form } = await requireMutator(input.formId);

    if (!canUnpublishForm(form)) {
      return {
        ok: false,
        error: "Only ACTIVE Published forms can be unpublished.",
      };
    }

    const { error } = await supabase.rpc("unpublish_form_template", {
      p_form_id: input.formId,
      p_reason: input.reason ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      message: `Unpublished “${form.form_name}”. Existing packet forms remain available.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unpublish failed.",
    };
  }
}

export async function retireFormTemplate(input: {
  formId: number;
  reason?: string | null;
}): Promise<FormLifecycleActionResult> {
  try {
    const { supabase, form } = await requireMutator(input.formId);

    if (!canRetireForm(form)) {
      return { ok: false, error: "Only ACTIVE forms can be retired." };
    }

    const { error } = await supabase.rpc("retire_form_template", {
      p_form_id: input.formId,
      p_reason: input.reason ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      message: `Retired “${form.form_name}”. Retired form versions are read-only.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Retire failed.",
    };
  }
}

export async function restoreFormTemplate(input: {
  formId: number;
  reason: string;
  confirmNewerPublished?: boolean;
}): Promise<FormLifecycleActionResult> {
  try {
    await requireAppAdmin();
    const { supabase, form } = await requireMutator(input.formId);

    if (!canRestoreForm(form)) {
      return {
        ok: false,
        error: "Only retired (INACTIVE) Draft forms can be restored.",
      };
    }

    const reason = input.reason.trim();
    if (!reason) {
      return {
        ok: false,
        error: "A written reason is required to restore a retired form.",
      };
    }

    const conflictCheck = await findPublishedFamilyConflict(input.formId);
    const conflict =
      conflictCheck.ok ? (conflictCheck.conflict ?? null) : null;

    if (conflict && !input.confirmNewerPublished) {
      return {
        ok: false,
        error:
          "A newer PUBLISHED version exists in this form family. Confirm to restore this version as Draft anyway.",
        conflict,
      };
    }

    const { error } = await supabase.rpc("restore_form_template", {
      p_form_id: input.formId,
      p_reason: reason,
      p_confirm_newer_published: Boolean(input.confirmNewerPublished),
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      message: `Restored “${form.form_name}” as an ACTIVE Draft. It is not published.`,
      conflict,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Restore failed.",
    };
  }
}

export type FormStateEventListItem = {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_publication_state: string | null;
  to_publication_state: string | null;
  reason: string | null;
  create_date: string;
  actor_display_name: string | null;
};

export async function listFormStateEvents(
  formId: number,
): Promise<
  | { ok: true; events: FormStateEventListItem[] }
  | { ok: false; error: string }
> {
  try {
    const { supabase, actor } = await requireMutator(formId);
    if (!actor.isActiveAdmin) {
      return { ok: false, error: "Only application admins can view lifecycle history." };
    }

    const { data, error } = await supabase
      .from("form_state_events")
      .select(
        "id, event_type, from_status, to_status, from_publication_state, to_publication_state, reason, create_date, performed_by_user_id",
      )
      .eq("form_id", formId)
      .eq("status", "ACTIVE")
      .order("create_date", { ascending: false })
      .limit(50);

    if (error) {
      return { ok: false, error: error.message };
    }

    const rows = data ?? [];
    const actorIds = [
      ...new Set(
        rows
          .map((row) => row.performed_by_user_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const nameById = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, preferred_name, first_name, last_name, email")
        .in("id", actorIds);

      for (const profile of profiles ?? []) {
        const name =
          (profile.display_name as string | null)?.trim() ||
          (profile.preferred_name as string | null)?.trim() ||
          [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          (profile.email as string | null)?.trim() ||
          "User";
        nameById.set(profile.id as string, name);
      }
    }

    return {
      ok: true,
      events: rows.map((row) => ({
        id: row.id as number,
        event_type: row.event_type as string,
        from_status: (row.from_status as string | null) ?? null,
        to_status: (row.to_status as string | null) ?? null,
        from_publication_state:
          (row.from_publication_state as string | null) ?? null,
        to_publication_state:
          (row.to_publication_state as string | null) ?? null,
        reason: (row.reason as string | null) ?? null,
        create_date: row.create_date as string,
        actor_display_name: row.performed_by_user_id
          ? (nameById.get(row.performed_by_user_id as string) ?? "User")
          : null,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load history.",
    };
  }
}
