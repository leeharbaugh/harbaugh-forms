import "server-only";

import {
  canProceedWithTestUserDeletion,
  classifyOwnedLibraryRow,
  summarizeBlockingReasons,
  type CleanupStepResult,
  type DeletionDependencySummary,
  type DependencyBucket,
} from "@/lib/admin/test-user-deletion-policy";
import { wouldRemoveFinalActiveAdmin } from "@/lib/admin/invite-validation";
import { recordAuditEvent } from "@/lib/audit/record";
import {
  FORM_TEMPLATES_BUCKET,
} from "@/lib/form-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatProfileDisplayName } from "@/lib/types/profile";

const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

type AdminClient = ReturnType<typeof createAdminClient>;

async function countEq(
  admin: AdminClient,
  table: string,
  column: string,
  value: string,
  extra?: { eq?: Record<string, string>; neq?: Record<string, string> },
): Promise<number> {
  let query = admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (extra?.eq) {
    for (const [k, v] of Object.entries(extra.eq)) {
      query = query.eq(k, v);
    }
  }
  if (extra?.neq) {
    for (const [k, v] of Object.entries(extra.neq)) {
      query = query.neq(k, v);
    }
  }
  const { count, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function listOwnedScoped(
  admin: AdminClient,
  table: "forms" | "collections" | "fields",
  userId: string,
): Promise<Array<{ id: number; scope: string | null; status: string | null }>> {
  const { data, error } = await admin
    .from(table)
    .select("id, scope, status")
    .eq("owner_user_id", userId);
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return (data ?? []) as Array<{
    id: number;
    scope: string | null;
    status: string | null;
  }>;
}

function pushBucket(
  buckets: DependencyBucket[],
  key: string,
  label: string,
  classification: DependencyBucket["classification"],
  count: number,
  details?: string[],
) {
  if (count <= 0 && classification !== "blocking") {
    // Still show zero for key categories in the UI summary.
  }
  buckets.push({ key, label, classification, count, details });
}

export async function buildTestUserDeletionSummary(
  userId: string,
): Promise<DeletionDependencySummary> {
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select(
      "id, email, first_name, middle_name, last_name, preferred_name, display_name, app_role, status, onboarding_status, is_test_user",
    )
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    throw new Error(profileError.message);
  }
  if (!profile) {
    throw new Error("Profile not found.");
  }

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const email =
    authData.user?.email ?? (profile.email as string | null) ?? null;
  const displayName = formatProfileDisplayName({
    first_name: profile.first_name as string | null,
    middle_name: profile.middle_name as string | null,
    last_name: profile.last_name as string | null,
    preferred_name: profile.preferred_name as string | null,
    display_name: profile.display_name as string | null,
    email,
  });

  const isActiveAdmin =
    profile.status === "ACTIVE" &&
    profile.app_role === "ADMIN" &&
    profile.onboarding_status === "ACTIVE";

  const buckets: DependencyBucket[] = [];

  pushBucket(buckets, "profile", "Profile", "safe_to_delete", 1);
  pushBucket(
    buckets,
    "memberships",
    "Organization memberships",
    "safe_to_delete",
    await countEq(admin, "organization_members", "user_id", userId, {
      neq: { status: "DELETED" },
    }),
  );
  pushBucket(
    buckets,
    "contacts",
    "Contacts",
    "safe_to_delete",
    await countEq(admin, "contacts", "owner_user_id", userId, {
      neq: { status: "DELETED" },
    }),
  );
  pushBucket(
    buckets,
    "properties",
    "Properties",
    "safe_to_delete",
    await countEq(admin, "properties", "owner_user_id", userId, {
      neq: { status: "DELETED" },
    }),
  );
  pushBucket(
    buckets,
    "packets",
    "Packets",
    "safe_to_delete",
    await countEq(admin, "packets", "owner_user_id", userId, {
      neq: { status: "DELETED" },
    }),
  );
  pushBucket(
    buckets,
    "packet_forms",
    "Packet forms / generated documents",
    "safe_to_delete",
    await countEq(admin, "packet_forms", "owner_user_id", userId),
  );

  const { data: packetIds } = await admin
    .from("packets")
    .select("id")
    .eq("owner_user_id", userId);
  const packetIdList = (packetIds ?? []).map((r) => r.id as number);
  let fieldInstanceCount = 0;
  if (packetIdList.length > 0) {
    const { count, error } = await admin
      .from("field_instances")
      .select("id", { count: "exact", head: true })
      .in("packet_id", packetIdList);
    if (error) {
      throw new Error(error.message);
    }
    fieldInstanceCount = count ?? 0;
  }
  pushBucket(
    buckets,
    "field_instances",
    "Field instances",
    "safe_to_delete",
    fieldInstanceCount,
  );

  pushBucket(
    buckets,
    "field_defaults",
    "Field defaults",
    "safe_to_delete",
    await countEq(admin, "field_defaults", "owner_user_id", userId, {
      neq: { status: "DELETED" },
    }),
  );
  pushBucket(
    buckets,
    "representation_agreements",
    "Representation agreements",
    "safe_to_delete",
    await countEq(admin, "representation_agreements", "owner_user_id", userId, {
      neq: { status: "DELETED" },
    }),
  );
  pushBucket(
    buckets,
    "user_agent_settings",
    "Agent settings",
    "safe_to_delete",
    await countEq(admin, "user_agent_settings", "user_id", userId),
  );
  pushBucket(
    buckets,
    "user_preferences",
    "User preferences",
    "safe_to_delete",
    await countEq(admin, "user_preferences", "user_id", userId),
  );

  const forms = await listOwnedScoped(admin, "forms", userId);
  const privateForms = forms.filter((f) => f.scope === "PRIVATE");
  const sharedForms = forms.filter(
    (f) => f.scope === "GLOBAL" || f.scope === "ORGANIZATION",
  );
  pushBucket(
    buckets,
    "private_forms",
    "Private forms",
    "safe_to_delete",
    privateForms.length,
  );
  pushBucket(
    buckets,
    "shared_forms",
    "Global/organization forms owned by user",
    "blocking",
    sharedForms.filter((f) => f.status !== "DELETED").length,
    sharedForms
      .filter((f) => f.status !== "DELETED")
      .slice(0, 10)
      .map((f) => `form #${f.id} (${f.scope})`),
  );

  const collections = await listOwnedScoped(admin, "collections", userId);
  const sharedCollections = collections.filter(
    (c) =>
      (c.scope === "GLOBAL" || c.scope === "ORGANIZATION") &&
      c.status !== "DELETED",
  );
  pushBucket(
    buckets,
    "private_collections",
    "Private collections",
    "safe_to_delete",
    collections.filter((c) => c.scope === "PRIVATE").length,
  );
  pushBucket(
    buckets,
    "shared_collections",
    "Global/organization collections owned by user",
    "blocking",
    sharedCollections.length,
  );

  const fields = await listOwnedScoped(admin, "fields", userId);
  const sharedFields = fields.filter(
    (f) =>
      (f.scope === "GLOBAL" || f.scope === "ORGANIZATION") &&
      f.status !== "DELETED",
  );
  pushBucket(
    buckets,
    "private_fields",
    "Private catalog fields",
    "safe_to_delete",
    fields.filter((f) => f.scope === "PRIVATE").length,
  );
  pushBucket(
    buckets,
    "shared_fields",
    "Global/organization fields owned by user",
    "blocking",
    sharedFields.length,
  );

  // Historical — retain rows, null actor refs
  const { count: publishedCount } = await admin
    .from("forms")
    .select("id", { count: "exact", head: true })
    .eq("published_by_user_id", userId);
  pushBucket(
    buckets,
    "published_by",
    "Forms published-by references",
    "historical_retain",
    publishedCount ?? 0,
  );

  const { count: stateEventCount } = await admin
    .from("form_state_events")
    .select("id", { count: "exact", head: true })
    .eq("performed_by_user_id", userId);
  pushBucket(
    buckets,
    "form_state_events",
    "Form state events (actor retained via snapshot / null FK)",
    "historical_retain",
    stateEventCount ?? 0,
  );

  const { count: auditCount } = await admin
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", userId);
  pushBucket(
    buckets,
    "audit_events",
    "Audit events",
    "historical_retain",
    auditCount ?? 0,
  );

  pushBucket(
    buckets,
    "storage",
    "Storage objects under users/{id}/",
    "safe_to_delete",
    1,
    ["form-templates + generated-documents path prefixes"],
  );

  const blockingReasons = summarizeBlockingReasons(buckets, []);
  const isTestUser = Boolean(profile.is_test_user);

  return {
    userId,
    email,
    displayName,
    isTestUser,
    isActiveAdmin,
    buckets,
    blockingReasons,
    canDelete:
      isTestUser &&
      blockingReasons.length === 0 &&
      classifyOwnedLibraryRow("PRIVATE") === "safe_to_delete",
  };
}

async function deleteStoragePrefix(
  admin: AdminClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  let deleted = 0;
  const queue = [prefix];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const { data, error } = await admin.storage.from(bucket).list(path, {
      limit: 100,
    });
    if (error) {
      // Missing prefix is fine (idempotent).
      if (/not found|does not exist/i.test(error.message)) {
        continue;
      }
      throw new Error(`${bucket}/${path}: ${error.message}`);
    }
    const files: string[] = [];
    for (const item of data ?? []) {
      const full = path ? `${path}/${item.name}` : item.name;
      if (item.id == null) {
        queue.push(full);
      } else {
        files.push(full);
      }
    }
    if (files.length > 0) {
      const { error: removeError } = await admin.storage
        .from(bucket)
        .remove(files);
      if (removeError) {
        throw new Error(removeError.message);
      }
      deleted += files.length;
    }
  }
  return deleted;
}

async function deleteByIds(
  admin: AdminClient,
  table: string,
  ids: Array<number | string>,
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }
  const { error, count } = await admin
    .from(table)
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) {
    throw new Error(`${table} delete: ${error.message}`);
  }
  return count ?? ids.length;
}

export type PermanentDeleteTestUserResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
      steps: CleanupStepResult[];
      summary: DeletionDependencySummary;
    }
  | {
      ok: false;
      error: string;
      userId?: string;
      email?: string | null;
      steps?: CleanupStepResult[];
      summary?: DeletionDependencySummary;
      authDeleted?: boolean;
    };

export async function permanentlyDeleteTestUser(options: {
  actorUserId: string;
  actorDisplayName?: string | null;
  targetUserId: string;
  confirmationEmail: string;
}): Promise<PermanentDeleteTestUserResult> {
  const admin = createAdminClient();
  const steps: CleanupStepResult[] = [];
  const summary = await buildTestUserDeletionSummary(options.targetUserId);

  const confirmation = options.confirmationEmail.trim().toLowerCase();
  const expected = (summary.email ?? "").trim().toLowerCase();
  if (!expected || confirmation !== expected) {
    return {
      ok: false,
      error: "Type the user’s exact login email to confirm permanent deletion.",
      userId: options.targetUserId,
      email: summary.email,
      summary,
      steps,
    };
  }

  const { count: adminCount, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "ACTIVE")
    .eq("app_role", "ADMIN")
    .eq("onboarding_status", "ACTIVE");
  if (countError) {
    return { ok: false, error: countError.message, summary, steps };
  }

  const isFinalActiveAdmin = wouldRemoveFinalActiveAdmin({
    activeAdminCount: adminCount ?? 0,
    currentlyActiveAdmin: summary.isActiveAdmin,
    nextIsActiveAdmin: false,
  });

  const guard = canProceedWithTestUserDeletion({
    isTestUser: summary.isTestUser,
    isSelf: options.actorUserId === options.targetUserId,
    isFinalActiveAdmin,
    blockingReasons: summary.blockingReasons,
  });
  if (!guard.ok) {
    return {
      ok: false,
      error: guard.error,
      userId: options.targetUserId,
      email: summary.email,
      summary,
      steps,
    };
  }

  const userId = options.targetUserId;
  let authDeleted = false;

  try {
    // Snapshot first (idempotent upsert)
    const { error: snapError } = await admin.from("deleted_user_snapshots").upsert(
      {
        auth_user_id: userId,
        email: summary.email,
        display_name: summary.displayName,
        app_role: summary.isActiveAdmin ? "ADMIN" : "USER",
        is_test_user: true,
        deleted_by_user_id: options.actorUserId,
        deletion_summary: {
          buckets: summary.buckets.map((b) => ({
            key: b.key,
            classification: b.classification,
            count: b.count,
          })),
        },
      },
      { onConflict: "auth_user_id" },
    );
    if (snapError) {
      throw new Error(`snapshot: ${snapError.message}`);
    }
    steps.push({ step: "snapshot", status: "ok", count: 1 });

    const storagePrefix = `users/${userId}`;
    const templatesDeleted = await deleteStoragePrefix(
      admin,
      FORM_TEMPLATES_BUCKET,
      storagePrefix,
    );
    const docsDeleted = await deleteStoragePrefix(
      admin,
      GENERATED_DOCUMENTS_BUCKET,
      storagePrefix,
    );
    steps.push({
      step: "storage",
      status: "deleted",
      count: templatesDeleted + docsDeleted,
    });

    const { data: packets } = await admin
      .from("packets")
      .select("id")
      .eq("owner_user_id", userId);
    const packetIds = (packets ?? []).map((p) => p.id as number);

    if (packetIds.length > 0) {
      const { data: instances } = await admin
        .from("field_instances")
        .select("id")
        .in("packet_id", packetIds);
      const instanceIds = (instances ?? []).map((r) => r.id as number);

      if (instanceIds.length > 0) {
        const { data: mappings } = await admin
          .from("field_instance_mappings")
          .select("id")
          .in("field_instance_id", instanceIds);
        const mappingIds = (mappings ?? []).map((r) => r.id as number);
        steps.push({
          step: "field_instance_mappings",
          status: "deleted",
          count: await deleteByIds(admin, "field_instance_mappings", mappingIds),
        });
        steps.push({
          step: "field_instances",
          status: "deleted",
          count: await deleteByIds(admin, "field_instances", instanceIds),
        });
      } else {
        steps.push({ step: "field_instance_mappings", status: "skipped", count: 0 });
        steps.push({ step: "field_instances", status: "skipped", count: 0 });
      }

      const { data: packetForms } = await admin
        .from("packet_forms")
        .select("id")
        .in("packet_id", packetIds);
      steps.push({
        step: "packet_forms",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "packet_forms",
          (packetForms ?? []).map((r) => r.id as number),
        ),
      });

      const { data: packetContacts } = await admin
        .from("packet_contacts")
        .select("id")
        .in("packet_id", packetIds);
      steps.push({
        step: "packet_contacts",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "packet_contacts",
          (packetContacts ?? []).map((r) => r.id as number),
        ),
      });

      steps.push({
        step: "packets",
        status: "deleted",
        count: await deleteByIds(admin, "packets", packetIds),
      });
    } else {
      for (const step of [
        "field_instance_mappings",
        "field_instances",
        "packet_forms",
        "packet_contacts",
        "packets",
      ] as const) {
        steps.push({ step, status: "skipped", count: 0 });
      }
    }

    const { data: properties } = await admin
      .from("properties")
      .select("id")
      .eq("owner_user_id", userId);
    const propertyIds = (properties ?? []).map((p) => p.id as number);
    if (propertyIds.length > 0) {
      const { data: hoas } = await admin
        .from("property_hoas")
        .select("id")
        .in("property_id", propertyIds);
      steps.push({
        step: "property_hoas",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "property_hoas",
          (hoas ?? []).map((r) => r.id as number),
        ),
      });
      steps.push({
        step: "properties",
        status: "deleted",
        count: await deleteByIds(admin, "properties", propertyIds),
      });
    } else {
      steps.push({ step: "property_hoas", status: "skipped", count: 0 });
      steps.push({ step: "properties", status: "skipped", count: 0 });
    }

    const { data: contacts } = await admin
      .from("contacts")
      .select("id")
      .eq("owner_user_id", userId);
    steps.push({
      step: "contacts",
      status: "deleted",
      count: await deleteByIds(
        admin,
        "contacts",
        (contacts ?? []).map((r) => r.id as number),
      ),
    });

    const { data: reps } = await admin
      .from("representation_agreements")
      .select("id")
      .eq("owner_user_id", userId);
    steps.push({
      step: "representation_agreements",
      status: "deleted",
      count: await deleteByIds(
        admin,
        "representation_agreements",
        (reps ?? []).map((r) => r.id as number),
      ),
    });

    const { data: defaults } = await admin
      .from("field_defaults")
      .select("id")
      .eq("owner_user_id", userId);
    steps.push({
      step: "field_defaults",
      status: "deleted",
      count: await deleteByIds(
        admin,
        "field_defaults",
        (defaults ?? []).map((r) => r.id as number),
      ),
    });

    const privateForms = (await listOwnedScoped(admin, "forms", userId)).filter(
      (f) => f.scope === "PRIVATE",
    );
    const privateFormIds = privateForms.map((f) => f.id);
    if (privateFormIds.length > 0) {
      const { data: mappings } = await admin
        .from("form_field_mappings")
        .select("id")
        .in("form_id", privateFormIds);
      steps.push({
        step: "private_form_mappings",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "form_field_mappings",
          (mappings ?? []).map((r) => r.id as number),
        ),
      });
      steps.push({
        step: "private_forms",
        status: "deleted",
        count: await deleteByIds(admin, "forms", privateFormIds),
      });
    } else {
      steps.push({ step: "private_form_mappings", status: "skipped", count: 0 });
      steps.push({ step: "private_forms", status: "skipped", count: 0 });
    }

    const privateCollections = (
      await listOwnedScoped(admin, "collections", userId)
    ).filter((c) => c.scope === "PRIVATE");
    const privateCollectionIds = privateCollections.map((c) => c.id);
    if (privateCollectionIds.length > 0) {
      const { data: cf } = await admin
        .from("collection_forms")
        .select("id")
        .in("collection_id", privateCollectionIds);
      await deleteByIds(
        admin,
        "collection_forms",
        (cf ?? []).map((r) => r.id as number),
      );
    }
    steps.push({
      step: "private_collections",
      status: "deleted",
      count: await deleteByIds(admin, "collections", privateCollectionIds),
    });

    const privateFields = (
      await listOwnedScoped(admin, "fields", userId)
    ).filter((f) => f.scope === "PRIVATE");
    steps.push({
      step: "private_fields",
      status: "deleted",
      count: await deleteByIds(
        admin,
        "fields",
        privateFields.map((f) => f.id),
      ),
    });

    // Null historical refs (also covered by ON DELETE SET NULL, but explicit for clarity)
    await admin
      .from("forms")
      .update({ published_by_user_id: null })
      .eq("published_by_user_id", userId);
    await admin
      .from("form_state_events")
      .update({ performed_by_user_id: null })
      .eq("performed_by_user_id", userId);
    await admin
      .from("field_defaults")
      .update({ created_by_user_id: null, updated_by_user_id: null })
      .or(`created_by_user_id.eq.${userId},updated_by_user_id.eq.${userId}`);
    await admin
      .from("forms")
      .update({ copied_by_user_id: null })
      .eq("copied_by_user_id", userId);
    await admin
      .from("forms")
      .update({ copied_from_owner_user_id: null })
      .eq("copied_from_owner_user_id", userId);
    await admin
      .from("profiles")
      .update({ invited_by_user_id: null })
      .eq("invited_by_user_id", userId);
    await admin
      .from("audit_settings")
      .update({ last_changed_by_user_id: null })
      .eq("last_changed_by_user_id", userId);

    steps.push({
      step: "null_historical_refs",
      status: "retained",
      detail: "Actor/publisher FKs nulled; audit_events retained",
    });

    // CASCADE tables — delete explicitly for clearer step reporting / idempotency
    await admin.from("organization_members").delete().eq("user_id", userId);
    steps.push({ step: "organization_members", status: "deleted" });

    await admin.from("user_agent_settings").delete().eq("user_id", userId);
    steps.push({ step: "user_agent_settings", status: "deleted" });

    await admin.from("user_preferences").delete().eq("user_id", userId);
    steps.push({ step: "user_preferences", status: "deleted" });

    const { error: profileDeleteError } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (profileDeleteError) {
      // Profile may already be gone on retry after Auth delete failed previously.
      if (!/no rows|not found|0 rows/i.test(profileDeleteError.message)) {
        const { data: stillThere } = await admin
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        if (stillThere) {
          throw new Error(`profile: ${profileDeleteError.message}`);
        }
      }
    }
    steps.push({ step: "profile", status: "deleted", count: 1 });

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(
      userId,
      false,
    );
    if (authDeleteError) {
      // Idempotent: Auth user already gone
      if (!/not found|user not found/i.test(authDeleteError.message)) {
        throw new Error(`auth delete: ${authDeleteError.message}`);
      }
      steps.push({
        step: "auth_user",
        status: "skipped",
        detail: "Auth user already absent",
      });
    } else {
      authDeleted = true;
      steps.push({ step: "auth_user", status: "deleted", count: 1 });
    }

    await recordAuditEvent({
      actorUserId: options.actorUserId,
      actorDisplayName: options.actorDisplayName ?? null,
      actorRoleSnapshot: "ADMIN",
      eventCategory: "security",
      action: "test_user_permanently_deleted",
      targetEntityType: "profile",
      targetEntityId: userId,
      summary: `Permanently deleted test user ${summary.displayName ?? ""} (${summary.email ?? "unknown"}).`,
      metadata: {
        deletedUserId: userId,
        deletedEmail: summary.email,
        stepStatuses: steps.map((s) => ({
          step: s.step,
          status: s.status,
          count: s.count ?? null,
        })),
      },
      mandatory: true,
    });

    return {
      ok: true,
      userId,
      email: summary.email,
      steps,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deletion failed.";
    steps.push({ step: "failed", status: "failed", detail: message });

    await recordAuditEvent({
      actorUserId: options.actorUserId,
      actorDisplayName: options.actorDisplayName ?? null,
      actorRoleSnapshot: "ADMIN",
      eventCategory: "security",
      action: "test_user_deletion_failed",
      targetEntityType: "profile",
      targetEntityId: userId,
      summary: `Test user deletion failed for ${summary.email ?? userId}.`,
      metadata: {
        deletedUserId: userId,
        failure: message,
        authDeleted,
        stepStatuses: steps.map((s) => ({
          step: s.step,
          status: s.status,
        })),
      },
      mandatory: true,
      success: false,
      failureClassification: "partial_or_failed_cleanup",
    });

    return {
      ok: false,
      error: message,
      userId,
      email: summary.email,
      steps,
      summary,
      authDeleted,
    };
  }
}
