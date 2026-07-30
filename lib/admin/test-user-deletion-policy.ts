/**
 * Pure classification helpers for test-user hard-deletion dependency policy.
 * Documented graph — see decisions.md / project_status.md.
 */

export type DependencyClass =
  | "safe_to_delete"
  | "must_reassign"
  | "historical_retain"
  | "blocking";

export type DependencyBucket = {
  key: string;
  label: string;
  classification: DependencyClass;
  count: number;
  details?: string[];
};

export type DeletionDependencySummary = {
  userId: string;
  email: string | null;
  displayName: string | null;
  isTestUser: boolean;
  isActiveAdmin: boolean;
  buckets: DependencyBucket[];
  blockingReasons: string[];
  canDelete: boolean;
};

/**
 * Keep the domain identifier, physical table, cleanup step, and display label
 * explicit. The table is keyed by user_id and has no generic id column.
 */
export const AGENT_SETTINGS_DEPENDENCY = {
  summaryKey: "agent_settings",
  tableName: "user_agent_settings",
  ownershipColumn: "user_id",
  countSelectColumn: "user_id",
  cleanupStep: "user_agent_settings",
  label: "Agent settings",
  classification: "safe_to_delete",
} as const;

export function classifyOwnedLibraryRow(scope: string | null | undefined): DependencyClass {
  if (scope === "PRIVATE") {
    return "safe_to_delete";
  }
  if (scope === "GLOBAL" || scope === "ORGANIZATION") {
    return "blocking";
  }
  return "must_reassign";
}

export function summarizeBlockingReasons(
  buckets: DependencyBucket[],
  guards: string[],
): string[] {
  const fromBuckets = buckets
    .filter((b) => b.classification === "blocking" && b.count > 0)
    .map(
      (b) =>
        `${b.label} (${b.count}) must be reassigned or removed before deletion.`,
    );
  return [...guards, ...fromBuckets];
}

export function canProceedWithTestUserDeletion(options: {
  isTestUser: boolean;
  isSelf: boolean;
  isFinalActiveAdmin: boolean;
  blockingReasons: string[];
}): { ok: true } | { ok: false; error: string } {
  if (options.isSelf) {
    return { ok: false, error: "You cannot permanently delete your own account." };
  }
  if (!options.isTestUser) {
    return {
      ok: false,
      error:
        "Streamlined permanent deletion is only available for accounts marked as test users.",
    };
  }
  if (options.isFinalActiveAdmin) {
    return {
      ok: false,
      error: "Cannot permanently delete the final active Global Admin.",
    };
  }
  if (options.blockingReasons.length > 0) {
    return {
      ok: false,
      error: options.blockingReasons[0]!,
    };
  }
  return { ok: true };
}

/** Ordered cleanup steps for idempotent application-side deletion. */
export const TEST_USER_CLEANUP_STEPS = [
  "snapshot",
  "storage",
  "field_instance_mappings",
  "field_instances",
  "packet_forms",
  "packet_contacts",
  "packets",
  "property_hoas",
  "properties",
  "contacts",
  "representation_agreements",
  "field_defaults",
  "private_form_mappings",
  "private_forms",
  "private_collections",
  "private_fields",
  "null_historical_refs",
  "organization_members",
  "user_agent_settings",
  "user_preferences",
  "profile",
  "auth_user",
] as const;

export type TestUserCleanupStep = (typeof TEST_USER_CLEANUP_STEPS)[number];

export type CleanupStepResult = {
  step: TestUserCleanupStep | string;
  status: "deleted" | "retained" | "reassigned" | "skipped" | "failed" | "ok";
  count?: number;
  detail?: string;
};
