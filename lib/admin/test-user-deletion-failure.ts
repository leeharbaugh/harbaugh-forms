import { randomUUID } from "node:crypto";

type CleanupStepResult = {
  step: string;
  status: string;
};

export type DeletionFailureStage =
  | "dependency_summary"
  | "snapshot"
  | "storage"
  | "application_cleanup"
  | "historical_references"
  | "identity_cleanup"
  | "auth_deletion"
  | "audit";

export type PublicDeletionFailure = {
  reference: string;
  dependencyKey: string;
  dependencyLabel: string;
  stage: DeletionFailureStage;
  explanation: string;
  databaseCode?: string;
  retryGuidance: string;
  completedSteps: string[];
  partialCleanup: boolean;
  authDeletionAttempted: boolean;
};

type FailureContext = {
  dependencyKey: string;
  dependencyLabel: string;
  stage: DeletionFailureStage;
  fallbackExplanation?: string;
};

function usefulDatabaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = (error as { code?: unknown }).code;
  if (typeof candidate !== "string") return undefined;
  const code = candidate.trim();
  return /^[A-Z0-9_-]{2,32}$/i.test(code) ? code : undefined;
}

export function internalDeletionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "Database operation returned an empty error message.";
}

export function buildPublicDeletionFailure(options: {
  context: FailureContext;
  error: unknown;
  steps?: CleanupStepResult[];
  authDeletionAttempted?: boolean;
  reference?: string;
}): PublicDeletionFailure {
  const completedSteps = (options.steps ?? [])
    .filter((step) => step.status !== "failed")
    .map((step) => step.step);
  const partialCleanup = completedSteps.some((step) => step !== "snapshot");
  const authDeletionAttempted = Boolean(options.authDeletionAttempted);
  const reference =
    options.reference ?? `DEL-${randomUUID().slice(0, 8).toUpperCase()}`;
  const noAuthSentence = authDeletionAttempted
    ? "Auth deletion may have been attempted."
    : "No Auth deletion was attempted.";

  return {
    reference,
    dependencyKey: options.context.dependencyKey,
    dependencyLabel: options.context.dependencyLabel,
    stage: options.context.stage,
    explanation:
      options.context.fallbackExplanation ??
      `${options.context.dependencyLabel} could not be removed. ${noAuthSentence} Review server log reference ${reference} and retry after the dependency is resolved.`,
    databaseCode: usefulDatabaseCode(options.error),
    retryGuidance: partialCleanup
      ? "Some application cleanup steps completed. The cleanup is retry-safe; resolve the reported dependency and retry."
      : "No application cleanup completed. Resolve the reported dependency and retry.",
    completedSteps,
    partialCleanup,
    authDeletionAttempted,
  };
}

export class TestUserDeletionOperationError extends Error {
  readonly failure: PublicDeletionFailure;
  readonly internalMessage: string;

  constructor(options: {
    context: FailureContext;
    cause: unknown;
    steps?: CleanupStepResult[];
    authDeletionAttempted?: boolean;
  }) {
    const failure = buildPublicDeletionFailure({
      context: options.context,
      error: options.cause,
      steps: options.steps,
      authDeletionAttempted: options.authDeletionAttempted,
    });
    super(failure.explanation, { cause: options.cause });
    this.name = "TestUserDeletionOperationError";
    this.failure = failure;
    this.internalMessage = internalDeletionErrorMessage(options.cause);
  }
}

export function toPublicDeletionFailureResult(error: unknown):
  | { error: string; failure: PublicDeletionFailure }
  | null {
  if (!(error instanceof TestUserDeletionOperationError)) return null;
  return { error: error.failure.explanation, failure: error.failure };
}
