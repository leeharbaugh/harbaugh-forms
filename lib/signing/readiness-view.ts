/**
 * Client-safe view of server readiness. Blockers are always computed on the
 * server; this only combines two server results. A placement or participant
 * change cannot affect live document-source drift, so after one the manager
 * sees the server's fresh preparation blockers plus the document-source
 * blockers from the last full evaluation. Activation re-evaluates everything.
 */
export const DOCUMENT_SOURCE_BLOCKER_CODES: readonly string[] = [
  "DOCUMENT_MISSING_DRAFT_SNAPSHOT",
  "DOCUMENT_SOURCE_CHANGED",
  "DOCUMENT_SOURCE_UNAVAILABLE",
];

export const PARTICIPANT_MISSING_SIGNER_FIELD_CODE =
  "PARTICIPANT_MISSING_SIGNATURE_OR_INITIALS";

type Blocker = { code: string; participantId?: string };

export function isDocumentSourceBlocker(blocker: Blocker): boolean {
  return DOCUMENT_SOURCE_BLOCKER_CODES.includes(blocker.code);
}

export function applyPreparationReadiness<B extends Blocker>(
  current: readonly B[],
  preparationBlockers: readonly B[],
): { ready: boolean; blockers: B[] } {
  const blockers = [
    ...preparationBlockers.filter((blocker) => !isDocumentSourceBlocker(blocker)),
    ...current.filter(isDocumentSourceBlocker),
  ];
  return { ready: blockers.length === 0, blockers };
}

/** Whether the server reported this participant as lacking a Signature or Initials. */
export function participantMissingSignerField(
  blockers: readonly Blocker[],
  participantId: string,
): boolean {
  return blockers.some(
    (blocker) =>
      blocker.code === PARTICIPANT_MISSING_SIGNER_FIELD_CODE &&
      blocker.participantId === participantId,
  );
}
