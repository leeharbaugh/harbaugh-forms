import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adoptCeremonyMark, prepareCeremonyMarks } from "./adopted-marks";
import type { CeremonyWriteContext } from "./ceremony-context";
import {
  acceptConsent,
  checkConsentSatisfied,
  consentDisclosureFingerprint,
  loadCurrentConsentDisclosure,
  requireConsentSatisfied,
} from "./consent-disclosure";
import { SigningError } from "./errors";
import {
  isDisclosureEligibleForRuntime,
  NativeSigningProductionDisclosureError,
} from "./feature-gate";
import { acceptFieldPlacement, replaceFieldPlacement } from "./placements";

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the PostgREST builder calls these paths make. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; kind: "insert" | "update"; values: Row }> = [];
  const reads: string[] = [];
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      update: (values: Row) => {
        patch = values;
        return builder;
      },
      insert: (values: Row) => {
        inserted = values;
        return builder;
      },
      maybeSingle: async () => {
        const rows = (tables[table] ??= []);
        if (inserted) {
          const row = { ...inserted };
          rows.push(row);
          writes.push({ table, kind: "insert", values: row });
          return { data: row, error: null };
        }
        const matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (patch) {
          for (const row of matches) Object.assign(row, patch);
          writes.push({ table, kind: "update", values: patch });
          return { data: matches[0] ?? null, error: null };
        }
        reads.push(table);
        if (matches.length > 1) {
          return { data: null, error: { message: `multiple ${table} rows` } };
        }
        return { data: matches[0] ?? null, error: null };
      },
    };
    return builder;
  }
  return { admin: { from } as unknown as SupabaseClient, tables, writes, reads };
}

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
const migrationBody = (relativePath: string) =>
  read(relativePath).match(/\$disclosure\$([\s\S]*?)\$disclosure\$/)?.[1] ?? "";

const PROD = { VERCEL_ENV: "production" } as NodeJS.ProcessEnv;
const DEV = {} as NodeJS.ProcessEnv;

const SIGNING_A = "11111111-1111-4111-8111-111111111111";
const SIGNING_B = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P_OTHER_SIGNING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function disclosureRow(options: {
  id: string;
  versionKey: string;
  bodyText: string;
  ready: boolean;
  superseded?: boolean;
}): Row {
  return {
    id: options.id,
    version_key: options.versionKey,
    title: "Electronic records and signatures",
    body_text: options.bodyText,
    content_sha256: consentDisclosureFingerprint(options.bodyText),
    is_production_ready: options.ready,
    published_at: "2026-10-19T12:00:00.000Z",
    superseded_at: options.superseded ? "2026-10-19T15:00:00.000Z" : null,
  };
}

const PREVIOUS_BODY = migrationBody(
  "supabase/migrations/20261019120000_native_signing_esign_disclosure_2026_10_19.sql",
);
const REVISED_BODY = migrationBody(
  "supabase/migrations/20261019150000_native_signing_esign_disclosure_revision.sql",
);

const OCT20_BODY = migrationBody(
  "supabase/migrations/20261020120000_native_signing_esign_disclosure_2026_10_20.sql",
);

const V_PREVIOUS = "d0000000-0000-4000-8000-000000000001";
const V_REVISED = "d0000000-0000-4000-8000-000000000002";
const V_OCT20 = "d0000000-0000-4000-8000-000000000005";
/** Synthetic, test-only stand-ins for a future counsel-approved version. */
const V_APPROVED = "d0000000-0000-4000-8000-000000000003";
const V_APPROVED_NEXT = "d0000000-0000-4000-8000-000000000004";

function participantRow(options: {
  id: string;
  signingId: string;
  acceptedVersion?: Row;
  recordedSha?: string;
}): Row {
  return {
    id: options.id,
    signing_id: options.signingId,
    participant_status: "IN_PROGRESS",
    consent_accepted_at: options.acceptedVersion ? "2026-10-19T13:00:00.000Z" : null,
    consent_disclosure_version_id: (options.acceptedVersion?.id as string | undefined) ?? null,
    consent_content_sha256:
      options.recordedSha ??
      ((options.acceptedVersion?.content_sha256 as string | undefined) ?? null),
  };
}

function writeContext(signingId: string, participantId: string): CeremonyWriteContext {
  return {
    session: {
      sessionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      signingId,
      signingParticipantId: participantId,
    },
    packageRevisionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    frozenPackageRevisionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    revisionParticipantId: "99999999-9999-4999-8999-999999999999",
    displayedName: "Pat Participant",
    capacityMode: "PERSONAL",
    expectedTypedSignatureText: "Pat Participant",
    representedPartyName: null,
    capacityWording: null,
  } as unknown as CeremonyWriteContext;
}

const isConsentRequired = (error: unknown) =>
  error instanceof SigningError && error.code === "CONSENT_REQUIRED";

describe("Consent eligibility: development acceptance and evidence", () => {
  it("records the development version and fingerprint, and replays without rewriting", async () => {
    const revised = disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revised],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A })],
    });

    const accepted = await acceptConsent({
      admin: db.admin,
      context: writeContext(SIGNING_A, P1),
      disclosureVersionId: V_REVISED,
      env: DEV,
    });
    assert.equal(accepted.replayed, false);
    assert.equal(accepted.disclosureVersionId, V_REVISED);
    assert.equal(accepted.contentSha256, consentDisclosureFingerprint(REVISED_BODY));

    const participant = db.tables.signing_participants[0];
    assert.equal(participant.consent_disclosure_version_id, V_REVISED);
    assert.equal(participant.consent_content_sha256, consentDisclosureFingerprint(REVISED_BODY));
    const event = db.tables.signing_events?.[0];
    assert.equal(event?.event_type, "CONSENT_ACCEPTED");
    const details = event?.details_json as Row;
    assert.equal(details.disclosureVersionId, V_REVISED);
    assert.equal(details.disclosureVersionKey, "esign-disclosure-2026-10-19-revised");
    assert.equal(details.contentSha256, consentDisclosureFingerprint(REVISED_BODY));

    const writesBefore = db.writes.length;
    const replay = await acceptConsent({
      admin: db.admin,
      context: writeContext(SIGNING_A, P1),
      disclosureVersionId: V_REVISED,
      env: DEV,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.acceptedAt, accepted.acceptedAt);
    assert.equal(db.writes.length, writesBefore, "a replay writes nothing");
  });

  it("keeps a historical acceptance on its own version after a newer one is published", async () => {
    const previous = disclosureRow({ id: V_PREVIOUS, versionKey: "esign-disclosure-2026-10-19", bodyText: PREVIOUS_BODY, ready: false, superseded: true });
    const revised = disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [previous, revised],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: previous })],
    });
    const before = { ...db.tables.signing_participants[0] };

    const state = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: DEV });
    assert.equal(state.satisfied, true);
    assert.equal(state.reason, "SATISFIED");
    assert.equal(state.currentDisclosure.id, V_REVISED);
    assert.equal(state.acceptedDisclosure?.id, V_PREVIOUS);
    assert.equal(state.acceptedDisclosure?.contentSha256, consentDisclosureFingerprint(PREVIOUS_BODY));

    const replay = await acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P1), disclosureVersionId: V_REVISED, env: DEV });
    assert.equal(replay.replayed, true);
    assert.equal(replay.disclosureVersionId, V_PREVIOUS, "never re-bound to the newer version");
    assert.deepEqual(db.tables.signing_participants[0], before);
    assert.equal(db.writes.length, 0);
  });
});

describe("Consent eligibility: esign-disclosure-2026-10-20", () => {
  const revisedSuperseded = () =>
    disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false, superseded: true });
  const oct20 = () =>
    disclosureRow({ id: V_OCT20, versionKey: "esign-disclosure-2026-10-20", bodyText: OCT20_BODY, ready: false });

  it("binds new development consent to the 2026-10-20 version and leaves a revised acceptance where it was", async () => {
    const revised = revisedSuperseded();
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revised, oct20()],
      signing_participants: [
        participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: revised }),
        participantRow({ id: P2, signingId: SIGNING_A }),
      ],
    });
    const before = { ...db.tables.signing_participants[0] };

    const kept = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: DEV });
    assert.equal(kept.reason, "SATISFIED");
    assert.equal(kept.currentDisclosure.id, V_OCT20);
    assert.equal(kept.acceptedDisclosure?.id, V_REVISED);
    const replay = await acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P1), disclosureVersionId: V_OCT20, env: DEV });
    assert.equal(replay.replayed, true);
    assert.equal(replay.disclosureVersionId, V_REVISED, "never re-bound to the newer version");
    assert.deepEqual(db.tables.signing_participants[0], before);

    const accepted = await acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P2), disclosureVersionId: V_OCT20, env: DEV });
    assert.equal(accepted.replayed, false);
    assert.equal(accepted.contentSha256, "ac7de88cd2e003ed4c12d7887966288f273ea3a97db631e42193810ae99e9d9b");
    const details = db.tables.signing_events?.[0]?.details_json as Row;
    assert.equal(details.disclosureVersionKey, "esign-disclosure-2026-10-20");
    assert.equal(details.contentSha256, accepted.contentSha256);
  });

  it("is refused in production because it is not production-ready", async () => {
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revisedSuperseded(), oct20()],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A })],
    });
    await assert.rejects(
      () => loadCurrentConsentDisclosure(db.admin, PROD),
      (error: unknown) => error instanceof NativeSigningProductionDisclosureError,
    );
    await assert.rejects(
      () => acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P1), disclosureVersionId: V_OCT20, env: PROD }),
      (error: unknown) => error instanceof NativeSigningProductionDisclosureError,
    );
    assert.equal(db.writes.length, 0);
  });
});

describe("Consent eligibility: production", () => {
  it("refuses to present an unapproved current disclosure", async () => {
    const revised = disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revised],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A })],
    });
    await assert.rejects(
      () => loadCurrentConsentDisclosure(db.admin, PROD),
      (error: unknown) => error instanceof NativeSigningProductionDisclosureError,
    );
    await assert.rejects(
      () => checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: PROD }),
      (error: unknown) => error instanceof NativeSigningProductionDisclosureError,
    );
    assert.equal((await loadCurrentConsentDisclosure(db.admin, DEV)).id, V_REVISED);
  });

  it("refuses new consent to an unapproved disclosure and records nothing", async () => {
    const revised = disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revised],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A })],
    });
    await assert.rejects(
      () => acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P1), disclosureVersionId: V_REVISED, env: PROD }),
      (error: unknown) => error instanceof NativeSigningProductionDisclosureError,
    );
    assert.equal(db.writes.length, 0);
    assert.equal(db.tables.signing_participants[0].consent_accepted_at, null);
  });

  it("does not let an unapproved acceptance authorize signing once an approved version is current", async () => {
    const revised = disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false, superseded: true });
    const approved = disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: `${REVISED_BODY}\n\nTest-only approved copy.`, ready: true });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revised, approved],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: revised })],
    });
    const before = { ...db.tables.signing_participants[0] };

    const state = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: PROD });
    assert.equal(state.satisfied, false);
    assert.equal(state.reason, "ACCEPTANCE_NOT_ELIGIBLE");
    assert.equal(state.acceptedDisclosure, null, "an ineligible version is never presented as accepted");
    assert.equal(state.acceptedDisclosureVersionId, V_REVISED, "the recorded evidence is reported as-is");
    await assert.rejects(
      () => requireConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: PROD }),
      isConsentRequired,
    );
    assert.deepEqual(db.tables.signing_participants[0], before, "evidence is not rewritten");
    assert.equal(db.writes.length, 0);

    const devState = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: DEV });
    assert.equal(devState.satisfied, true, "development keeps honouring development versions");
  });

  it("requires a fresh affirmative acceptance of the approved version, appended as new evidence", async () => {
    const revised = disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false, superseded: true });
    const approved = disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: `${REVISED_BODY}\n\nTest-only approved copy.`, ready: true });
    const priorEvent: Row = {
      event_type: "CONSENT_ACCEPTED",
      details_json: { disclosureVersionId: V_REVISED, contentSha256: revised.content_sha256 },
    };
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revised, approved],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: revised })],
      signing_events: [priorEvent],
    });

    await assert.rejects(
      () => acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P1), disclosureVersionId: V_REVISED, env: PROD }),
      (error: unknown) => error instanceof SigningError && error.code === "CONFLICT",
      "an acceptance can only name the version being shown",
    );
    const accepted = await acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P1), disclosureVersionId: V_APPROVED, env: PROD });
    assert.equal(accepted.replayed, false);
    assert.equal(accepted.disclosureVersionId, V_APPROVED);
    assert.equal(db.tables.signing_events.length, 2);
    assert.deepEqual(db.tables.signing_events[0], priorEvent, "the earlier event is untouched");
    assert.equal((db.tables.signing_events[1].details_json as Row).disclosureVersionId, V_APPROVED);
    const state = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: PROD });
    assert.equal(state.reason, "SATISFIED");
  });

  it("allows an approved, verified acceptance, including after a newer approved version", async () => {
    const approved = disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: `${REVISED_BODY}\n\nTest-only approved copy.`, ready: true, superseded: true });
    const next = disclosureRow({ id: V_APPROVED_NEXT, versionKey: "test-approved-next", bodyText: `${REVISED_BODY}\n\nTest-only approved copy, next.`, ready: true });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [approved, next],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: approved })],
    });
    const state = await requireConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env: PROD });
    assert.equal(state.reason, "SATISFIED");
    assert.equal(state.acceptedDisclosure?.id, V_APPROVED);
    const replay = await acceptConsent({ admin: db.admin, context: writeContext(SIGNING_A, P1), disclosureVersionId: V_APPROVED_NEXT, env: PROD });
    assert.equal(replay.replayed, true, "no forced re-consent for an eligible acceptance");
    assert.equal(db.writes.length, 0);
  });

  it("refuses Start signing, marks and placements on an unapproved acceptance", async () => {
    const revised = disclosureRow({ id: V_REVISED, versionKey: "esign-disclosure-2026-10-19-revised", bodyText: REVISED_BODY, ready: false, superseded: true });
    const approved = disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: `${REVISED_BODY}\n\nTest-only approved copy.`, ready: true });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [revised, approved],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: revised })],
    });
    const context = writeContext(SIGNING_A, P1);
    const originalVercelEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      await assert.rejects(() => prepareCeremonyMarks({ admin: db.admin, context }), isConsentRequired);
      await assert.rejects(
        () => adoptCeremonyMark({ admin: db.admin, context, markKind: "SIGNATURE", representationType: "TYPED", typedText: "Pat Participant" }),
        isConsentRequired,
      );
      await assert.rejects(
        () => acceptFieldPlacement({ admin: db.admin, context, signingFieldId: "12121212-1212-4212-8212-121212121212", clientRequestId: "req-1" }),
        isConsentRequired,
      );
      await assert.rejects(
        () => replaceFieldPlacement({ admin: db.admin, context, signingFieldId: "12121212-1212-4212-8212-121212121212", clientRequestId: "req-2" }),
        isConsentRequired,
      );
    } finally {
      if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = originalVercelEnv;
    }
    assert.equal(db.writes.length, 0);
    assert.ok(!db.reads.includes("signing_fields"), "consent is checked before any field is read");
  });

  it("uses one eligibility rule for presented and accepted versions", () => {
    assert.equal(isDisclosureEligibleForRuntime({ isProductionReady: false }, PROD), false);
    assert.equal(isDisclosureEligibleForRuntime({ isProductionReady: true }, PROD), true);
    assert.equal(isDisclosureEligibleForRuntime({ isProductionReady: false }, { VERCEL_ENV: "preview" } as NodeJS.ProcessEnv), true);
    assert.equal(isDisclosureEligibleForRuntime({ isProductionReady: false }, DEV), true);
  });
});

describe("Consent eligibility: integrity and isolation", () => {
  const approvedBody = `${REVISED_BODY}\n\nTest-only approved copy.`;

  it("fails closed on a mismatched, malformed or tampered fingerprint", async () => {
    for (const env of [DEV, PROD]) {
      const previous = disclosureRow({ id: V_PREVIOUS, versionKey: "older", bodyText: approvedBody, ready: true, superseded: true });
      const current = disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: `${approvedBody} Current.`, ready: true });
      const tampered = { ...previous, body_text: `${approvedBody} Edited after acceptance.` };
      const cases: Array<[string, Row[], Row]> = [
        ["recorded fingerprint differs", [previous, current], participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: previous, recordedSha: "0".repeat(64) })],
        ["recorded fingerprint malformed", [previous, current], participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: previous, recordedSha: "not-a-sha" })],
        ["stored text no longer matches", [tampered, current], participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: previous })],
        ["accepted version missing", [current], participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: previous })],
      ];
      for (const [label, versions, participant] of cases) {
        const db = fakeAdmin({ signing_consent_disclosure_versions: versions, signing_participants: [participant] });
        const state = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P1, env });
        assert.equal(state.satisfied, false, label);
        assert.equal(state.reason, "ACCEPTANCE_UNVERIFIABLE", label);
        assert.equal(state.acceptedDisclosure, null, label);
      }
    }

    const tamperedCurrent = { ...disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: approvedBody, ready: true }), body_text: "edited" };
    const db = fakeAdmin({ signing_consent_disclosure_versions: [tamperedCurrent], signing_participants: [] });
    await assert.rejects(
      () => loadCurrentConsentDisclosure(db.admin, PROD),
      (error: unknown) => error instanceof SigningError && error.code === "INTEGRITY_MISMATCH",
    );
  });

  it("never lets one participant or Signing reuse another's consent", async () => {
    const approved = disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: approvedBody, ready: true });
    for (const env of [DEV, PROD]) {
      const db = fakeAdmin({
        signing_consent_disclosure_versions: [approved],
        signing_participants: [
          participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: approved }),
          participantRow({ id: P2, signingId: SIGNING_A }),
          participantRow({ id: P_OTHER_SIGNING, signingId: SIGNING_B }),
        ],
      });
      const sameSigning = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_A, signingParticipantId: P2, env });
      assert.equal(sameSigning.reason, "NEVER_ACCEPTED");
      const otherSigning = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_B, signingParticipantId: P_OTHER_SIGNING, env });
      assert.equal(otherSigning.reason, "NEVER_ACCEPTED");
      const crossBound = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING_B, signingParticipantId: P1, env });
      assert.equal(crossBound.reason, "NEVER_ACCEPTED", "P1's consent does not exist under Signing B");
      await assert.rejects(
        () => acceptConsent({ admin: db.admin, context: writeContext(SIGNING_B, P1), disclosureVersionId: V_APPROVED, env }),
        (error: unknown) => error instanceof SigningError && error.code === "CEREMONY_FORBIDDEN",
      );
    }
  });

  it("keeps consent across a returning session without asking again", async () => {
    const approved = disclosureRow({ id: V_APPROVED, versionKey: "test-approved", bodyText: approvedBody, ready: true });
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [approved],
      signing_participants: [participantRow({ id: P1, signingId: SIGNING_A, acceptedVersion: approved })],
    });
    const returning = {
      ...writeContext(SIGNING_A, P1),
      session: { sessionId: "77777777-7777-4777-8777-777777777777", signingId: SIGNING_A, signingParticipantId: P1 },
    } as unknown as CeremonyWriteContext;
    const replay = await acceptConsent({ admin: db.admin, context: returning, disclosureVersionId: V_APPROVED, env: PROD });
    assert.equal(replay.replayed, true);
    assert.equal(db.writes.length, 0);
  });
});

describe("Consent eligibility: browser clients cannot write consent", () => {
  it("revokes browser roles and denies them on participant and disclosure tables", () => {
    const stage1 = read("supabase/migrations/20260914200000_native_signing_stage1_foundation.sql");
    const ceremony = read("supabase/migrations/20260917120000_native_signing_ceremony_foundation.sql");
    for (const source of [stage1, ceremony]) {
      assert.match(source, /revoke all on table public\.%I from anon/);
      assert.match(source, /revoke all on table public\.%I from authenticated/);
      assert.match(source, /as restrictive for all to authenticated using \(false\) with check \(false\)/);
    }
    assert.match(stage1, /'signing_participants'/);
    assert.match(ceremony, /'signing_consent_disclosure_versions'/);
  });
});

let savedChainKeyId: string | undefined;
beforeEach(() => {
  savedChainKeyId = process.env.SIGNING_EVENT_CHAIN_KEY_ID;
  delete process.env.SIGNING_EVENT_CHAIN_KEY_ID;
});
afterEach(() => {
  if (savedChainKeyId !== undefined) process.env.SIGNING_EVENT_CHAIN_KEY_ID = savedChainKeyId;
});
