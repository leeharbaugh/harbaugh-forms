import "server-only";

import {
  AGENT_SETTINGS_DEPENDENCY,
  canProceedWithTestUserDeletion,
  classifyOwnedLibraryRow,
  summarizeBlockingReasons,
  type CleanupStepResult,
  type DeletionDependencySummary,
  type DependencyBucket,
} from "@/lib/admin/test-user-deletion-policy";
import {
  TestUserDeletionOperationError,
  internalDeletionErrorMessage,
  type DeletionFailureStage,
  type PublicDeletionFailure,
} from "@/lib/admin/test-user-deletion-failure";
import { runRetrySafeIdentityCleanup } from "@/lib/admin/test-user-identity-cleanup";
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
  dependency?: { key: string; label: string },
): Promise<number> {
  // Select the ownership column itself. Not every dependency table has an
  // `id` column (user_agent_settings is keyed by user_id).
  let query = admin
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq(column, value);
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
    throw new TestUserDeletionOperationError({
      context: {
        dependencyKey: dependency?.key ?? table,
        dependencyLabel: dependency?.label ?? "Dependency summary",
        stage: "dependency_summary",
      },
      cause: error,
    });
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
    throw new TestUserDeletionOperationError({
      context: {
        dependencyKey: table,
        dependencyLabel:
          table === "forms"
            ? "Owned forms"
            : table === "collections"
              ? "Owned collections"
              : "Owned fields",
        stage: "dependency_summary",
      },
      cause: error,
    });
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
    throw new TestUserDeletionOperationError({
      context: {
        dependencyKey: "profile",
        dependencyLabel: "Profile",
        stage: "dependency_summary",
      },
      cause: profileError,
    });
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

  const packetIdList = (await selectIdsEq(
    admin,
    "packets",
    "owner_user_id",
    userId,
  )) as number[];
  let fieldInstanceCount = 0;
  if (packetIdList.length > 0) {
    const { count, error } = await admin
      .from("field_instances")
      .select("id", { count: "exact", head: true })
      .in("packet_id", packetIdList);
    if (error) {
      throw new TestUserDeletionOperationError({
        context: {
          dependencyKey: "field_instances",
          dependencyLabel: "Field instances",
          stage: "dependency_summary",
        },
        cause: error,
      });
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
    AGENT_SETTINGS_DEPENDENCY.summaryKey,
    AGENT_SETTINGS_DEPENDENCY.label,
    AGENT_SETTINGS_DEPENDENCY.classification,
    await countEq(
      admin,
      AGENT_SETTINGS_DEPENDENCY.tableName,
      AGENT_SETTINGS_DEPENDENCY.ownershipColumn,
      userId,
      undefined,
      {
        key: AGENT_SETTINGS_DEPENDENCY.summaryKey,
        label: AGENT_SETTINGS_DEPENDENCY.label,
      },
    ),
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
  const publishedCount = await countEq(
    admin,
    "forms",
    "published_by_user_id",
    userId,
  );
  pushBucket(
    buckets,
    "published_by",
    "Forms published-by references",
    "historical_retain",
    publishedCount,
  );

  const stateEventCount = await countEq(
    admin,
    "form_state_events",
    "performed_by_user_id",
    userId,
  );
  pushBucket(
    buckets,
    "form_state_events",
    "Form state events (actor retained via snapshot / null FK)",
    "historical_retain",
    stateEventCount,
  );

  const auditCount = await countEq(
    admin,
    "audit_events",
    "actor_user_id",
    userId,
  );
  pushBucket(
    buckets,
    "audit_events",
    "Audit events",
    "historical_retain",
    auditCount,
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
      throw error;
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
        throw removeError;
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
    throw error;
  }
  return count ?? ids.length;
}

async function selectIdsEq(
  admin: AdminClient,
  table: string,
  column: string,
  value: string,
): Promise<Array<number | string>> {
  const { data, error } = await admin
    .from(table)
    .select("id")
    .eq(column, value);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as number | string);
}

async function selectIdsIn(
  admin: AdminClient,
  table: string,
  column: string,
  values: Array<number | string>,
): Promise<Array<number | string>> {
  if (values.length === 0) return [];
  const { data, error } = await admin
    .from(table)
    .select("id")
    .in(column, values);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as number | string);
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
      failure?: PublicDeletionFailure;
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
  let authDeletionAttempted = false;
  let failureContext: {
    dependencyKey: string;
    dependencyLabel: string;
    stage: DeletionFailureStage;
    fallbackExplanation?: string;
  } = {
    dependencyKey: "application_data",
    dependencyLabel: "Application data",
    stage: "application_cleanup",
  };

  try {
    // Snapshot first (idempotent upsert)
    failureContext = {
      dependencyKey: "snapshot",
      dependencyLabel: "Deleted-user snapshot",
      stage: "snapshot",
    };
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
      throw snapError;
    }
    steps.push({ step: "snapshot", status: "ok", count: 1 });

    failureContext = {
      dependencyKey: "storage",
      dependencyLabel: "Private storage objects",
      stage: "storage",
    };
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

    failureContext = {
      dependencyKey: "private_application_data",
      dependencyLabel: "Private application data",
      stage: "application_cleanup",
    };
    const packetIds = (await selectIdsEq(
      admin,
      "packets",
      "owner_user_id",
      userId,
    )) as number[];

    if (packetIds.length > 0) {
      const instanceIds = (await selectIdsIn(
        admin,
        "field_instances",
        "packet_id",
        packetIds,
      )) as number[];

      if (instanceIds.length > 0) {
        const mappingIds = (await selectIdsIn(
          admin,
          "field_instance_mappings",
          "field_instance_id",
          instanceIds,
        )) as number[];
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

      const packetFormIds = await selectIdsIn(
        admin,
        "packet_forms",
        "packet_id",
        packetIds,
      );
      steps.push({
        step: "packet_forms",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "packet_forms",
          packetFormIds,
        ),
      });

      const packetContactIds = await selectIdsIn(
        admin,
        "packet_contacts",
        "packet_id",
        packetIds,
      );
      steps.push({
        step: "packet_contacts",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "packet_contacts",
          packetContactIds,
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

    const propertyIds = (await selectIdsEq(
      admin,
      "properties",
      "owner_user_id",
      userId,
    )) as number[];
    if (propertyIds.length > 0) {
      const hoaIds = await selectIdsIn(
        admin,
        "property_hoas",
        "property_id",
        propertyIds,
      );
      steps.push({
        step: "property_hoas",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "property_hoas",
          hoaIds,
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

    const contactIds = await selectIdsEq(
      admin,
      "contacts",
      "owner_user_id",
      userId,
    );
    steps.push({
      step: "contacts",
      status: "deleted",
      count: await deleteByIds(
        admin,
        "contacts",
        contactIds,
      ),
    });

    const representationAgreementIds = await selectIdsEq(
      admin,
      "representation_agreements",
      "owner_user_id",
      userId,
    );
    steps.push({
      step: "representation_agreements",
      status: "deleted",
      count: await deleteByIds(
        admin,
        "representation_agreements",
        representationAgreementIds,
      ),
    });

    const fieldDefaultIds = await selectIdsEq(
      admin,
      "field_defaults",
      "owner_user_id",
      userId,
    );
    steps.push({
      step: "field_defaults",
      status: "deleted",
      count: await deleteByIds(
        admin,
        "field_defaults",
        fieldDefaultIds,
      ),
    });

    const privateForms = (await listOwnedScoped(admin, "forms", userId)).filter(
      (f) => f.scope === "PRIVATE",
    );
    const privateFormIds = privateForms.map((f) => f.id);
    if (privateFormIds.length > 0) {
      const mappingIds = await selectIdsIn(
        admin,
        "form_field_mappings",
        "form_id",
        privateFormIds,
      );
      steps.push({
        step: "private_form_mappings",
        status: "deleted",
        count: await deleteByIds(
          admin,
          "form_field_mappings",
          mappingIds,
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
      const collectionFormIds = await selectIdsIn(
        admin,
        "collection_forms",
        "collection_id",
        privateCollectionIds,
      );
      await deleteByIds(
        admin,
        "collection_forms",
        collectionFormIds,
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
    failureContext = {
      dependencyKey: "historical_references",
      dependencyLabel: "Historical references",
      stage: "historical_references",
    };
    const historicalErrors: unknown[] = [];
    const { error: publishedByError } = await admin
      .from("forms")
      .update({ published_by_user_id: null })
      .eq("published_by_user_id", userId);
    historicalErrors.push(publishedByError);
    const { error: stateEventError } = await admin
      .from("form_state_events")
      .update({ performed_by_user_id: null })
      .eq("performed_by_user_id", userId);
    historicalErrors.push(stateEventError);
    const { error: fieldDefaultActorError } = await admin
      .from("field_defaults")
      .update({ created_by_user_id: null, updated_by_user_id: null })
      .or(`created_by_user_id.eq.${userId},updated_by_user_id.eq.${userId}`);
    historicalErrors.push(fieldDefaultActorError);
    const { error: copiedByError } = await admin
      .from("forms")
      .update({ copied_by_user_id: null })
      .eq("copied_by_user_id", userId);
    historicalErrors.push(copiedByError);
    const { error: copiedFromOwnerError } = await admin
      .from("forms")
      .update({ copied_from_owner_user_id: null })
      .eq("copied_from_owner_user_id", userId);
    historicalErrors.push(copiedFromOwnerError);
    const { error: invitedByError } = await admin
      .from("profiles")
      .update({ invited_by_user_id: null })
      .eq("invited_by_user_id", userId);
    historicalErrors.push(invitedByError);
    const { error: auditSettingsError } = await admin
      .from("audit_settings")
      .update({ last_changed_by_user_id: null })
      .eq("last_changed_by_user_id", userId);
    historicalErrors.push(auditSettingsError);
    const historicalError = historicalErrors.find(Boolean);
    if (historicalError) {
      throw historicalError;
    }

    steps.push({
      step: "null_historical_refs",
      status: "retained",
      detail: "Actor/publisher FKs nulled; audit_events retained",
    });

    const identityCleanup = await runRetrySafeIdentityCleanup({
      memberships: async () => {
        const { error, count } = await admin
          .from("organization_members")
          .delete({ count: "exact" })
          .eq("user_id", userId);
        return { error: error ?? undefined, count: count ?? 0 };
      },
      agentSettings: async () => {
        const { error, count } = await admin
          .from(AGENT_SETTINGS_DEPENDENCY.tableName)
          .delete({ count: "exact" })
          .eq(AGENT_SETTINGS_DEPENDENCY.ownershipColumn, userId);
        return { error: error ?? undefined, count: count ?? 0 };
      },
      preferences: async () => {
        const { error, count } = await admin
          .from("user_preferences")
          .delete({ count: "exact" })
          .eq("user_id", userId);
        return { error: error ?? undefined, count: count ?? 0 };
      },
      profile: async () => {
        const { error, count } = await admin
          .from("profiles")
          .delete({ count: "exact" })
          .eq("id", userId);
        return { error: error ?? undefined, count: count ?? 0 };
      },
      authUser: async () => {
        const { error } = await admin.auth.admin.deleteUser(userId, false);
        if (error && /not found|user not found/i.test(error.message)) {
          return { alreadyAbsent: true };
        }
        return { error: error ?? undefined, count: error ? 0 : 1 };
      },
    });
    authDeletionAttempted = identityCleanup.authDeletionAttempted;
    if (!identityCleanup.ok) {
      failureContext = {
        dependencyKey:
          identityCleanup.failedOperation === "agentSettings"
            ? AGENT_SETTINGS_DEPENDENCY.summaryKey
            : identityCleanup.failedStep,
        dependencyLabel: identityCleanup.failedLabel,
        stage:
          identityCleanup.failedOperation === "authUser"
            ? "auth_deletion"
            : "identity_cleanup",
      };
      steps.push(...identityCleanup.steps);
      throw identityCleanup.error;
    }
    steps.push(...identityCleanup.steps);
    authDeleted = identityCleanup.authDeleted;

    failureContext = {
      dependencyKey: "audit",
      dependencyLabel: "Deletion audit record",
      stage: "audit",
      fallbackExplanation:
        "The user cleanup completed, but the mandatory deletion audit could not be recorded. Auth deletion was attempted. Review the server log reference before retrying.",
    };
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
    const operationError =
      error instanceof TestUserDeletionOperationError
        ? error
        : new TestUserDeletionOperationError({
            context: failureContext,
            cause: error,
            steps,
            authDeletionAttempted,
          });
    const { failure } = operationError;
    steps.push({
      step: failure.dependencyKey,
      status: "failed",
      detail: `See server log reference ${failure.reference}.`,
    });

    console.error("Test-user deletion failed", {
      reference: failure.reference,
      dependencyKey: failure.dependencyKey,
      stage: failure.stage,
      databaseCode: failure.databaseCode ?? null,
      authDeletionAttempted,
      authDeleted,
      completedSteps: failure.completedSteps,
      internalMessage: internalDeletionErrorMessage(error),
    });

    try {
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
          errorReference: failure.reference,
          dependencyKey: failure.dependencyKey,
          failureStage: failure.stage,
          databaseCode: failure.databaseCode ?? null,
          partialCleanup: failure.partialCleanup,
          authDeletionAttempted,
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
    } catch (auditError) {
      console.error("Failed to record test-user deletion failure audit", {
        reference: failure.reference,
        internalMessage: internalDeletionErrorMessage(auditError),
      });
    }

    return {
      ok: false,
      error: failure.explanation,
      failure,
      userId,
      email: summary.email,
      steps,
      summary,
      authDeleted,
    };
  }
}
