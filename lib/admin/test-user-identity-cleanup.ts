type CleanupStepResult = {
  step: string;
  status: "deleted" | "retained" | "reassigned" | "skipped" | "failed" | "ok";
  count?: number;
  detail?: string;
};

export const IDENTITY_CLEANUP_DEPENDENCIES = [
  {
    operationKey: "memberships",
    cleanupStep: "organization_members",
    label: "Organization memberships",
  },
  {
    operationKey: "agentSettings",
    cleanupStep: "user_agent_settings",
    label: "Agent settings",
  },
  {
    operationKey: "preferences",
    cleanupStep: "user_preferences",
    label: "User preferences",
  },
  {
    operationKey: "profile",
    cleanupStep: "profile",
    label: "Profile",
  },
] as const;

type OperationKey =
  (typeof IDENTITY_CLEANUP_DEPENDENCIES)[number]["operationKey"];

type OperationResult = {
  count?: number;
  error?: unknown;
};

export type IdentityCleanupOperations = Record<
  OperationKey,
  () => Promise<OperationResult>
> & {
  authUser: () => Promise<OperationResult & { alreadyAbsent?: boolean }>;
};

export type IdentityCleanupResult =
  | {
      ok: true;
      steps: CleanupStepResult[];
      authDeletionAttempted: true;
      authDeleted: boolean;
    }
  | {
      ok: false;
      steps: CleanupStepResult[];
      failedOperation: OperationKey | "authUser";
      failedStep: string;
      failedLabel: string;
      error: unknown;
      authDeletionAttempted: boolean;
      authDeleted: false;
    };

/**
 * Runs private identity cleanup in a fixed order and does not call Auth until
 * every application operation succeeds. Zero-row results are successful,
 * making a retry after partial cleanup idempotent.
 */
export async function runRetrySafeIdentityCleanup(
  operations: IdentityCleanupOperations,
): Promise<IdentityCleanupResult> {
  const steps: CleanupStepResult[] = [];

  for (const dependency of IDENTITY_CLEANUP_DEPENDENCIES) {
    const result = await operations[dependency.operationKey]();
    if (result.error) {
      return {
        ok: false,
        steps,
        failedOperation: dependency.operationKey,
        failedStep: dependency.cleanupStep,
        failedLabel: dependency.label,
        error: result.error,
        authDeletionAttempted: false,
        authDeleted: false,
      };
    }
    steps.push({
      step: dependency.cleanupStep,
      status: "deleted",
      count: result.count ?? 0,
    });
  }

  const authResult = await operations.authUser();
  if (authResult.error) {
    return {
      ok: false,
      steps,
      failedOperation: "authUser",
      failedStep: "auth_user",
      failedLabel: "Authentication account",
      error: authResult.error,
      authDeletionAttempted: true,
      authDeleted: false,
    };
  }
  steps.push({
    step: "auth_user",
    status: authResult.alreadyAbsent ? "skipped" : "deleted",
    count: authResult.alreadyAbsent ? 0 : (authResult.count ?? 1),
    detail: authResult.alreadyAbsent ? "Auth user already absent" : undefined,
  });

  return {
    ok: true,
    steps,
    authDeletionAttempted: true,
    authDeleted: !authResult.alreadyAbsent,
  };
}
