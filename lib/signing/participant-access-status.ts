/**
 * Non-secret participant link / invitation status for the In Progress panel.
 * Derived from credential and delivery rows; never returns credential ids,
 * tokens, provider references, or recipient addresses.
 */

export type ParticipantLinkState = "ACTIVE" | "REVOKED" | "NONE";

export type ParticipantAccessStatus = {
  linkState: ParticipantLinkState;
  /** When the current link was issued (ACTIVE only). */
  linkIssuedAt: string | null;
  /** When a manager last replaced this participant's link. */
  lastReplacedAt: string | null;
  /** When a manager revoked the link (REVOKED only). */
  revokedAt: string | null;
  /** Latest invitation instruction for this participant. */
  lastInvitationQueuedAt: string | null;
  lastInvitationState: string | null;
  lastAttemptAt: string | null;
  lastAttemptOutcome: "ACCEPTED" | "FAILED" | null;
  /** The last accepted attempt was accepted by the development sandbox. */
  lastAttemptSandboxed: boolean;
};

export type CredentialStatusRow = {
  signing_participant_id: string;
  issued_at: string;
  is_current: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export type InvitationInstructionRow = {
  id: string;
  signing_participant_id: string;
  delivery_state: string;
  create_date: string;
};

export type InvitationAttemptRow = {
  delivery_instruction_id: string;
  attempt_number: number;
  attempted_at: string;
  outcome: string;
  provider_reference: string | null;
};

const latest = <T,>(rows: T[], key: (row: T) => string): T | null =>
  rows.reduce<T | null>(
    (best, row) => (best === null || key(row) > key(best) ? row : best),
    null,
  );

export function summarizeParticipantAccess(
  participantId: string,
  credentials: readonly CredentialStatusRow[],
  instructions: readonly InvitationInstructionRow[],
  attempts: readonly InvitationAttemptRow[],
): ParticipantAccessStatus {
  const own = credentials.filter((row) => row.signing_participant_id === participantId);
  const current = own.find((row) => row.is_current && !row.revoked_at) ?? null;
  const replaced = latest(
    own.filter((row) => row.revoked_reason === "REPLACED_BY_MANAGER" && row.revoked_at),
    (row) => row.revoked_at!,
  );
  const revoked = current
    ? null
    : latest(
        own.filter((row) => row.revoked_reason === "REVOKED_BY_MANAGER" && row.revoked_at),
        (row) => row.revoked_at!,
      );

  const instruction = latest(
    instructions.filter((row) => row.signing_participant_id === participantId),
    (row) => row.create_date,
  );
  const attempt = instruction
    ? latest(
        attempts.filter((row) => row.delivery_instruction_id === instruction.id),
        (row) => String(row.attempt_number).padStart(6, "0"),
      )
    : null;

  return {
    linkState: current ? "ACTIVE" : revoked ? "REVOKED" : "NONE",
    linkIssuedAt: current?.issued_at ?? null,
    lastReplacedAt: replaced?.revoked_at ?? null,
    revokedAt: revoked?.revoked_at ?? null,
    lastInvitationQueuedAt: instruction?.create_date ?? null,
    lastInvitationState: instruction?.delivery_state ?? null,
    lastAttemptAt: attempt?.attempted_at ?? null,
    lastAttemptOutcome:
      attempt?.outcome === "ACCEPTED" || attempt?.outcome === "FAILED"
        ? attempt.outcome
        : null,
    lastAttemptSandboxed:
      attempt?.outcome === "ACCEPTED" &&
      (attempt.provider_reference ?? "").startsWith("sandbox:"),
  };
}

/** Honest invitation label: provider acceptance is not proof of delivery. */
export function invitationStatusLabel(status: ParticipantAccessStatus): string {
  switch (status.lastInvitationState) {
    case null:
      return "No invitation yet";
    case "PENDING":
    case "QUEUED":
      return "Invitation queued";
    case "ACCEPTED":
      return status.lastAttemptSandboxed
        ? "Invitation accepted by the development email sandbox (not sent)"
        : "Invitation accepted by the email service";
    case "FAILED":
      return "Invitation delivery failed";
    default:
      return "Invitation status unknown";
  }
}
