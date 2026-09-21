/**
 * Native Signing Stage 5 adopted marks.
 *
 * Signature and Initials are adopted independently: a participant may adopt a
 * Signature, use it, and only later adopt Initials. Adopted-mark locking is per
 * participant *and* per mark type, and is distinct from package freeze — using
 * a Signature freezes the package revision globally but does not lock that
 * participant's unused Initials, and never touches another participant's marks.
 *
 * Typed personal Signatures are exact-match to the displayed name only.
 * Typed Initials are suggested from the display name but may be edited until
 * first use; there is no OCR or PDF-name matching. The agent remains
 * responsible for preparing the document with the intended signer name before
 * signing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CeremonyWriteContext } from "./ceremony-context";
import { appendCeremonyEvent } from "./ceremony-events";
import { SigningError } from "./errors";

export type AdoptedMarkKind = "SIGNATURE" | "INITIALS";
export type MarkRepresentationType = "TYPED" | "DRAWN";

export type AdoptedMarkView = {
  markId: string;
  markKind: AdoptedMarkKind;
  representationType: MarkRepresentationType;
  typedText: string | null;
  hasDrawnPath: boolean;
  adoptedAt: string;
  lockedAt: string | null;
};

const MAX_TYPED_TEXT_LENGTH = 200;
const MAX_TYPED_INITIALS_LENGTH = 40;
const MAX_DRAWN_POINTS = 20_000;

const NAME_PREFIX_TOKENS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "prof",
  "sir",
  "dame",
]);

const NAME_SUFFIX_TOKENS = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "esq",
  "phd",
  "md",
  "jd",
]);

function normalizeNameToken(token: string): string {
  return token.replace(/\.$/, "").toLowerCase();
}

function firstUnicodeLetter(segment: string): string | null {
  const match = segment.match(/\p{L}/u);
  return match ? match[0]!.toUpperCase() : null;
}

/**
 * Suggested typed initials from the displayed Signing name (editable by the
 * participant; not validated for equality on adoption).
 */
export function suggestTypedInitialsFromDisplayName(displayName: string): string {
  try {
    const collapsed = displayName.trim().replace(/\s+/g, " ");
    if (!collapsed) return "";

    const initials: string[] = [];
    for (const token of collapsed.split(" ")) {
      const trimmed = token.trim();
      if (!trimmed) continue;

      const normalized = normalizeNameToken(trimmed);
      if (NAME_PREFIX_TOKENS.has(normalized)) continue;
      if (NAME_SUFFIX_TOKENS.has(normalized)) continue;

      const segments = trimmed.split("-");
      for (const segment of segments) {
        const letter = firstUnicodeLetter(segment);
        if (letter) initials.push(letter);
      }
    }
    return initials.join("");
  } catch {
    return "";
  }
}

/** @deprecated Use suggestTypedInitialsFromDisplayName */
export function deriveTypedInitialsFromDisplayName(displayName: string): string {
  return suggestTypedInitialsFromDisplayName(displayName);
}

function toMarkView(row: Record<string, unknown>): AdoptedMarkView {
  return {
    markId: row.id as string,
    markKind: row.mark_kind as AdoptedMarkKind,
    representationType: row.representation_type as MarkRepresentationType,
    typedText: (row.typed_text as string | null) ?? null,
    hasDrawnPath: row.drawn_path_json != null,
    adoptedAt: row.adopted_at as string,
    lockedAt: (row.locked_at as string | null) ?? null,
  };
}

export async function loadAdoptedMarksForParticipant(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
}): Promise<{
  signature: AdoptedMarkView | null;
  initials: AdoptedMarkView | null;
}> {
  const { data, error } = await options.admin
    .from("signing_adopted_marks")
    .select("*")
    .eq("signing_id", options.signingId)
    .eq("signing_participant_id", options.signingParticipantId);
  if (error) throw new Error(error.message);

  let signature: AdoptedMarkView | null = null;
  let initials: AdoptedMarkView | null = null;
  for (const row of data ?? []) {
    const view = toMarkView(row as Record<string, unknown>);
    if (view.markKind === "SIGNATURE") signature = view;
    if (view.markKind === "INITIALS") initials = view;
  }
  return { signature, initials };
}

export async function getAdoptedMarkForKind(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  markKind: AdoptedMarkKind;
}): Promise<AdoptedMarkView | null> {
  const { data, error } = await options.admin
    .from("signing_adopted_marks")
    .select("*")
    .eq("signing_id", options.signingId)
    .eq("signing_participant_id", options.signingParticipantId)
    .eq("mark_kind", options.markKind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toMarkView(data as Record<string, unknown>) : null;
}

function parseMarkKind(value: unknown): AdoptedMarkKind {
  if (value === "SIGNATURE" || value === "INITIALS") return value;
  throw new SigningError("INVALID_INPUT", "Invalid mark type.");
}

function parseRepresentationType(value: unknown): MarkRepresentationType {
  if (value === "TYPED" || value === "DRAWN") return value;
  throw new SigningError("INVALID_INPUT", "Invalid mark representation.");
}

function parseTypedSignatureText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SigningError("INVALID_INPUT", "Enter your name to adopt a typed mark.");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_TYPED_TEXT_LENGTH) {
    throw new SigningError("INVALID_INPUT", "That text is too long.");
  }
  return trimmed;
}

const TYPED_INITIALS_RE = /^[\p{L}\p{M}\s.'-]+$/u;

function parseTypedInitialsText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SigningError("INVALID_INPUT", "Enter your initials before adopting them.");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_TYPED_INITIALS_LENGTH) {
    throw new SigningError("INVALID_INPUT", "Those initials are too long.");
  }
  if (!TYPED_INITIALS_RE.test(trimmed)) {
    throw new SigningError(
      "INVALID_INPUT",
      "Initials may use letters, spaces, periods, hyphens, and apostrophes only.",
    );
  }
  if (!/\p{L}/u.test(trimmed)) {
    throw new SigningError("INVALID_INPUT", "Enter at least one letter for your initials.");
  }
  return trimmed;
}

function parseDrawnPath(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SigningError("INVALID_INPUT", "Draw your mark before adopting it.");
  }
  if (value.length > MAX_DRAWN_POINTS) {
    throw new SigningError("INVALID_INPUT", "That drawing is too large.");
  }
  return value;
}

export type AdoptMarkResult = {
  mark: AdoptedMarkView;
  /** True when an existing unlocked mark was replaced rather than created. */
  updated: boolean;
};

/**
 * Adopt or update one mark type.
 *
 * Fails closed with MARK_LOCKED once that mark type has been used successfully,
 * while leaving the participant's other mark type freely adoptable.
 */
export async function adoptCeremonyMark(options: {
  admin: SupabaseClient;
  context: CeremonyWriteContext;
  markKind: unknown;
  representationType: unknown;
  typedText?: unknown;
  drawnPath?: unknown;
}): Promise<AdoptMarkResult> {
  const { admin, context } = options;
  const markKind = parseMarkKind(options.markKind);
  const representationType = parseRepresentationType(options.representationType);

  let typedText: string | null = null;

  if (representationType === "TYPED") {
    if (markKind === "SIGNATURE") {
      typedText = parseTypedSignatureText(options.typedText);
      const expected = context.displayedName.trim();
      if (typedText !== expected) {
        throw new SigningError(
          "VALIDATION_FAILED",
          `A typed signature must match your name on this Signing exactly: ${expected}`,
        );
      }
    } else {
      typedText = parseTypedInitialsText(options.typedText);
    }
  } else {
    // Validate payload shape first so malformed DRAWN requests stay INVALID_INPUT,
    // then fail closed because drawn evidence v2 is not shipping.
    parseDrawnPath(options.drawnPath);
    throw new SigningError(
      "DRAWN_MARK_UNSUPPORTED",
      "Drawn signatures and initials are not available yet. Use a typed mark.",
    );
  }

  const existing = await getAdoptedMarkForKind({
    admin,
    signingId: context.session.signingId,
    signingParticipantId: context.session.signingParticipantId,
    markKind,
  });

  if (existing?.lockedAt) {
    throw new SigningError(
      "MARK_LOCKED",
      markKind === "SIGNATURE"
        ? "Your signature is locked because you already used it in this Signing."
        : "Your initials are locked because you already used them in this Signing.",
    );
  }

  const adoptedAt = new Date().toISOString();
  let row: Record<string, unknown> | null = null;

  if (existing) {
    const { data, error } = await admin
      .from("signing_adopted_marks")
      .update({
        representation_type: representationType,
        typed_text: typedText,
        drawn_path_json: null,
        adopted_at: adoptedAt,
      })
      .eq("id", existing.markId)
      .eq("signing_id", context.session.signingId)
      .is("locked_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new SigningError(
        "MARK_LOCKED",
        "That mark was locked by a placement you just made. Reload to continue.",
      );
    }
    row = data as Record<string, unknown>;
  } else {
    const { data, error } = await admin
      .from("signing_adopted_marks")
      .insert({
        signing_id: context.session.signingId,
        signing_participant_id: context.session.signingParticipantId,
        mark_kind: markKind,
        representation_type: representationType,
        typed_text: typedText,
        drawn_path_json: null,
        adopted_at: adoptedAt,
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to adopt mark.");
    }
    row = data as Record<string, unknown>;
  }

  await appendCeremonyEvent({
    admin,
    signingId: context.session.signingId,
    eventType: markKind === "SIGNATURE" ? "SIGNATURE_ADOPTED" : "INITIALS_ADOPTED",
    signingParticipantId: context.session.signingParticipantId,
    actorDisplayName: context.displayedName,
    packageRevisionId: context.packageRevisionId,
    summary:
      markKind === "SIGNATURE"
        ? `Participant adopted a ${representationType.toLowerCase()} signature`
        : `Participant adopted ${representationType.toLowerCase()} initials`,
    detailsJson: {
      markKind,
      representationType,
      replacedExistingMark: Boolean(existing),
      browserSessionId: context.session.sessionId,
    },
  });

  return { mark: toMarkView(row), updated: Boolean(existing) };
}

/**
 * Lock one mark type on its first successful use by this participant.
 *
 * Idempotent, and scoped to the single `signing_adopted_marks` row: the
 * participant's other mark type and every other participant stay unlocked.
 */
export async function lockAdoptedMarkOnFirstUse(options: {
  admin: SupabaseClient;
  signingId: string;
  markId: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_adopted_marks")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", options.markId)
    .eq("signing_id", options.signingId)
    .is("locked_at", null);
  if (error) throw new Error(error.message);
}

/** The mark a placement of this field type must use. */
export async function requireAdoptedMarkForKind(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  markKind: AdoptedMarkKind;
}): Promise<AdoptedMarkView> {
  const mark = await getAdoptedMarkForKind(options);
  if (!mark) {
    throw new SigningError(
      "VALIDATION_FAILED",
      options.markKind === "SIGNATURE"
        ? "Adopt your signature before placing it."
        : "Adopt your initials before placing them.",
    );
  }
  return mark;
}
