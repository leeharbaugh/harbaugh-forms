/**
 * Native Signing Stage 5 electronic-records consent.
 *
 * Consent evidence has to prove *which* disclosure a participant accepted, so
 * acceptance records the disclosure version id and the SHA-256 content
 * fingerprint alongside `consent_accepted_at`. Disclosure text is never
 * rewritten in place: publishing new copy inserts a new version row and
 * supersedes the old one, and an acceptance that no longer matches the current
 * version means fresh consent is required rather than silently binding the
 * participant to changed text.
 *
 * A browser-session timeout does not re-require consent while the accepted
 * disclosure is unchanged; identity affirmation repeats instead.
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
export async function loadCurrentConsentDisclosure(
  admin: SupabaseClient,
): Promise<ConsentDisclosure> {
  const { data, error } = await admin
    .from("signing_consent_disclosure_versions")
    .select(
      "id, version_key, title, body_text, content_sha256, is_production_ready, published_at",
    )
    .is("superseded_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new SigningError(
      "NOT_READY",
      "No electronic-signing disclosure is published.",
    );
  }

  const bodyText = data.body_text as string;
  const contentSha256 = data.content_sha256 as string;
  if (consentDisclosureFingerprint(bodyText) !== contentSha256) {
    throw new SigningError(
      "INTEGRITY_MISMATCH",
      "The electronic-signing disclosure failed its integrity check.",
    );
  }

  const disclosure: ConsentDisclosure = {
    id: data.id as string,
    versionKey: data.version_key as string,
    title: data.title as string,
    bodyText,
    contentSha256,
    isProductionReady: data.is_production_ready === true,
    publishedAt: data.published_at as string,
  };

  assertProductionDisclosureReady(disclosure);
  return disclosure;
}

export { isSigningProductionRuntime };

export type ConsentState = {
  satisfied: boolean;
  reason: "SATISFIED" | "NEVER_ACCEPTED" | "DISCLOSURE_CHANGED";
  currentDisclosure: ConsentDisclosure;
  acceptedAt: string | null;
  acceptedDisclosureVersionId: string | null;
  acceptedContentSha256: string | null;
};

/**
 * Consent is satisfied only when the stored acceptance matches both the current
 * disclosure version and its content fingerprint.
 */
export async function checkConsentSatisfied(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  currentDisclosure?: ConsentDisclosure;
}): Promise<ConsentState> {
  const currentDisclosure =
    options.currentDisclosure ??
    (await loadCurrentConsentDisclosure(options.admin));

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
      acceptedAt,
      acceptedDisclosureVersionId,
      acceptedContentSha256,
    };
  }

  const matches =
    acceptedDisclosureVersionId === currentDisclosure.id &&
    acceptedContentSha256 === currentDisclosure.contentSha256;

  return {
    satisfied: matches,
    reason: matches ? "SATISFIED" : "DISCLOSURE_CHANGED",
    currentDisclosure,
    acceptedAt,
    acceptedDisclosureVersionId,
    acceptedContentSha256,
  };
}

export async function requireConsentSatisfied(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
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
}): Promise<AcceptConsentResult> {
  const { admin, context } = options;
  const state = await checkConsentSatisfied({
    admin,
    signingId: context.session.signingId,
    signingParticipantId: context.session.signingParticipantId,
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

  if (state.satisfied && state.acceptedAt) {
    return {
      disclosureVersionId: current.id,
      contentSha256: current.contentSha256,
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
