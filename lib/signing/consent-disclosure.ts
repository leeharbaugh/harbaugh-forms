/**
 * Native Signing Stage 5 electronic-records consent.
 *
 * Consent evidence has to prove *which* disclosure a participant accepted, so
 * acceptance records the disclosure version id and the SHA-256 content
 * fingerprint alongside `consent_accepted_at`. Disclosure text is never
 * rewritten in place: publishing new copy inserts a new version row and
 * supersedes the old one. An acceptance stays bound to the exact version the
 * participant accepted: a newer version applies only to participants who have
 * not yet consented, and never silently re-binds or re-prompts someone who
 * already accepted. An acceptance whose version row cannot reproduce the
 * recorded fingerprint fails closed.
 *
 * A browser-session timeout does not re-require consent; identity affirmation
 * repeats instead.
 *
 * The seeded development disclosure is explicitly marked non-production:
 * production enablement still requires Texas legal review of final language.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CeremonyWriteContext } from "./ceremony-context";
import { appendCeremonyEvent } from "./ceremony-events";
import { SigningError } from "./errors";
import {
  assertProductionDisclosureReady,
  isDisclosureEligibleForRuntime,
  isSigningProductionRuntime,
} from "./feature-gate";

export type ConsentDisclosure = {
  id: string;
  versionKey: string;
  title: string;
  bodyText: string;
  contentSha256: string;
  isProductionReady: boolean;
  publishedAt: string;
};

export function consentDisclosureFingerprint(bodyText: string): string {
  return createHash("sha256").update(bodyText, "utf8").digest("hex");
}

/**
 * The one current (not superseded) disclosure version.
 *
 * The recorded fingerprint is verified against the stored body on every load:
 * consent evidence that cites a fingerprint which cannot reproduce the accepted
 * text would be worthless, so a mismatch fails closed instead of being
 * accepted or silently repaired.
 */
const DISCLOSURE_SELECT =
  "id, version_key, title, body_text, content_sha256, is_production_ready, published_at";

/** A stored version whose body still reproduces its recorded fingerprint. */
function verifiedDisclosure(row: Record<string, unknown>): ConsentDisclosure | null {
  const bodyText = row.body_text as string;
  const contentSha256 = row.content_sha256 as string;
  if (consentDisclosureFingerprint(bodyText) !== contentSha256) return null;
  return {
    id: row.id as string,
    versionKey: row.version_key as string,
    title: row.title as string,
    bodyText,
    contentSha256,
    isProductionReady: row.is_production_ready === true,
    publishedAt: row.published_at as string,
  };
}

export async function loadCurrentConsentDisclosure(
  admin: SupabaseClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ConsentDisclosure> {
  const { data, error } = await admin
    .from("signing_consent_disclosure_versions")
    .select(DISCLOSURE_SELECT)
    .is("superseded_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new SigningError(
      "NOT_READY",
      "No electronic-signing disclosure is published.",
    );
  }

  const disclosure = verifiedDisclosure(data);
  if (!disclosure) {
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "The electronic-signing disclosure failed its integrity check.",
    );
  }

  assertProductionDisclosureReady(disclosure, env);
  return disclosure;
}

/** One stored version by id, only when its body reproduces its fingerprint. */
async function loadVerifiedDisclosureVersion(
  admin: SupabaseClient,
  versionId: string,
): Promise<ConsentDisclosure | null> {
  const { data, error } = await admin
    .from("signing_consent_disclosure_versions")
    .select(DISCLOSURE_SELECT)
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? verifiedDisclosure(data) : null;
}

export { isSigningProductionRuntime };

export type ConsentState = {
  satisfied: boolean;
  reason:
    | "SATISFIED"
    | "NEVER_ACCEPTED"
    | "ACCEPTANCE_UNVERIFIABLE"
    | "ACCEPTANCE_NOT_ELIGIBLE";
  currentDisclosure: ConsentDisclosure;
  /** The exact version this participant accepted, when it verifies and is eligible here. */
  acceptedDisclosure: ConsentDisclosure | null;
  acceptedAt: string | null;
  acceptedDisclosureVersionId: string | null;
  acceptedContentSha256: string | null;
};

/**
 * Consent is satisfied when this participant accepted a disclosure version
 * (current or since superseded) whose stored body still reproduces both the
 * version's fingerprint and the fingerprint recorded at acceptance, and that
 * version is eligible in this runtime. A verified fingerprint proves which
 * text was accepted; in production only a production-ready version may
 * authorize signing. An ineligible acceptance is left untouched as evidence.
 */
export async function checkConsentSatisfied(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  currentDisclosure?: ConsentDisclosure;
  env?: NodeJS.ProcessEnv;
}): Promise<ConsentState> {
  const env = options.env ?? process.env;
  const currentDisclosure =
    options.currentDisclosure ??
    (await loadCurrentConsentDisclosure(options.admin, env));

  const { data, error } = await options.admin
    .from("signing_participants")
    .select(
      "consent_accepted_at, consent_disclosure_version_id, consent_content_sha256",
    )
    .eq("id", options.signingParticipantId)
    .eq("signing_id", options.signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const acceptedAt = (data?.consent_accepted_at as string | null) ?? null;
  const acceptedDisclosureVersionId =
    (data?.consent_disclosure_version_id as string | null) ?? null;
  const acceptedContentSha256 =
    (data?.consent_content_sha256 as string | null) ?? null;

  if (!acceptedAt || !acceptedDisclosureVersionId || !acceptedContentSha256) {
    return {
      satisfied: false,
      reason: "NEVER_ACCEPTED",
      currentDisclosure,
      acceptedDisclosure: null,
      acceptedAt,
      acceptedDisclosureVersionId,
      acceptedContentSha256,
    };
  }

  const acceptedDisclosure =
    acceptedDisclosureVersionId === currentDisclosure.id
      ? currentDisclosure
      : await loadVerifiedDisclosureVersion(options.admin, acceptedDisclosureVersionId);
  const verified =
    acceptedDisclosure !== null && acceptedDisclosure.contentSha256 === acceptedContentSha256;
  const eligible =
    verified &&
    acceptedDisclosure !== null &&
    isDisclosureEligibleForRuntime(acceptedDisclosure, env);

  return {
    satisfied: eligible,
    reason: !verified
      ? "ACCEPTANCE_UNVERIFIABLE"
      : eligible
        ? "SATISFIED"
        : "ACCEPTANCE_NOT_ELIGIBLE",
    currentDisclosure,
    acceptedDisclosure: eligible ? acceptedDisclosure : null,
    acceptedAt,
    acceptedDisclosureVersionId,
    acceptedContentSha256,
  };
}

export async function requireConsentSatisfied(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ConsentState> {
  const state = await checkConsentSatisfied(options);
  if (!state.satisfied) {
    throw new SigningError(
      "CONSENT_REQUIRED",
      "Please review and accept the electronic records and signatures disclosure first.",
    );
  }
  return state;
}

export type AcceptConsentResult = {
  disclosureVersionId: string;
  contentSha256: string;
  acceptedAt: string;
  /** True when this participant had already accepted this exact disclosure. */
  replayed: boolean;
};

/**
 * Record affirmative consent for this Signing.
 *
 * Idempotent: re-accepting the same disclosure returns the original
 * acceptance, so a double-submit cannot rewrite the recorded timestamp.
 */
export async function acceptConsent(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  /** Echoed back from the rendered disclosure to catch a stale form. */
  disclosureVersionId: unknown;
  env?: NodeJS.ProcessEnv;
}): Promise<AcceptConsentResult> {
  const { admin, context } = options;
  const state = await checkConsentSatisfied({
    admin,
    signingId: context.session.signingId,
    signingParticipantId: context.session.signingParticipantId,
    env: options.env,
  });
  const current = state.currentDisclosure;

  if (
    typeof options.disclosureVersionId !== "string" ||
    options.disclosureVersionId !== current.id
  ) {
    throw new SigningError(
      "CONFLICT",
      "The disclosure was updated. Reload this page and review it again.",
    );
  }

  if (state.satisfied && state.acceptedAt && state.acceptedDisclosure) {
    return {
      disclosureVersionId: state.acceptedDisclosure.id,
      contentSha256: state.acceptedDisclosure.contentSha256,
      acceptedAt: state.acceptedAt,
      replayed: true,
    };
  }

  const acceptedAt = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("signing_participants")
    .update({
      consent_accepted_at: acceptedAt,
      consent_disclosure_version_id: current.id,
      consent_content_sha256: current.contentSha256,
    })
    .eq("id", context.session.signingParticipantId)
    .eq("signing_id", context.session.signingId)
    .neq("participant_status", "REMOVED")
    .select("consent_accepted_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "This participant can no longer act on this Signing.",
    );
  }

  await appendCeremonyEvent({
    admin,
    signingId: context.session.signingId,
    eventType: "CONSENT_ACCEPTED",
    signingParticipantId: context.session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    summary: "Participant accepted the electronic records and signatures disclosure",
    detailsJson: {
      disclosureVersionId: current.id,
      disclosureVersionKey: current.versionKey,
      contentSha256: current.contentSha256,
      browserSessionId: context.session.sessionId,
    },
  });

  return {
    disclosureVersionId: current.id,
    contentSha256: current.contentSha256,
    acceptedAt: (updated.consent_accepted_at as string | null) ?? acceptedAt,
    replayed: false,
  };
}
