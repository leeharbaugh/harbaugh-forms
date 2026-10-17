import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SigningCompletedDocuments } from "@/components/signings/signing-completed-documents";
import { shouldWatchSigningState } from "@/components/signings/use-signing-state-watcher";
import {
  COMBINED_PACKAGE_ENQUEUE_GRACE_MS,
  COMBINED_PACKAGE_MAX_PREPARING_ATTEMPTS,
  COMBINED_PACKAGE_WORK_TYPE,
  completedArtifactsSettled,
  deriveCombinedPackageState,
  FINALIZE_WORK_TYPE,
  type ManagerCompletedArtifact,
} from "./completed-documents";
import { FINALIZE_SIGNING_WORK_TYPE } from "./ceremony-finish";
import { GENERATE_COMBINED_PACKAGE_WORK_TYPE } from "./finalization-worker";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const NOW = Date.parse("2026-10-12T18:00:00Z");
const derive = (overrides: Partial<Parameters<typeof deriveCombinedPackageState>[0]>) =>
  deriveCombinedPackageState({
    combinedArtifactListed: false,
    combinedWork: null,
    finalizeCompletedAt: null,
    now: NOW,
    ...overrides,
  });

describe("Combined package state (authoritative rows, no elapsed-time guessing beyond the enqueue gap)", () => {
  it("uses the worker's own work types", () => {
    assert.equal(COMBINED_PACKAGE_WORK_TYPE, GENERATE_COMBINED_PACKAGE_WORK_TYPE);
    assert.equal(FINALIZE_WORK_TYPE, FINALIZE_SIGNING_WORK_TYPE);
  });

  it("READY whenever the verified artifact is listed, whatever the work row says", () => {
    for (const processingState of ["PENDING", "PROCESSING", "FAILED", "SUCCEEDED"]) {
      assert.equal(derive({ combinedArtifactListed: true, combinedWork: { processingState, attemptCount: 9 } }), "READY");
    }
  });

  it("PREPARING while the work is pending, running or still retrying", () => {
    assert.equal(derive({ combinedWork: { processingState: "PENDING", attemptCount: 0 } }), "PREPARING");
    assert.equal(derive({ combinedWork: { processingState: "PROCESSING", attemptCount: 1 } }), "PREPARING");
    assert.equal(
      derive({ combinedWork: { processingState: "FAILED", attemptCount: COMBINED_PACKAGE_MAX_PREPARING_ATTEMPTS - 1 } }),
      "PREPARING",
    );
  });

  it("UNAVAILABLE once retries are exhausted or the work ended without an artifact", () => {
    assert.equal(
      derive({ combinedWork: { processingState: "FAILED", attemptCount: COMBINED_PACKAGE_MAX_PREPARING_ATTEMPTS } }),
      "UNAVAILABLE",
    );
    assert.equal(derive({ combinedWork: { processingState: "SUCCEEDED", attemptCount: 1 } }), "UNAVAILABLE");
  });

  it("PREPARING in the moment between Complete and the enqueue; NOT_EXPECTED without any combined work", () => {
    assert.equal(derive({ finalizeCompletedAt: new Date(NOW - 5_000).toISOString() }), "PREPARING");
    assert.equal(derive({ finalizeCompletedAt: new Date(NOW - COMBINED_PACKAGE_ENQUEUE_GRACE_MS - 1).toISOString() }), "NOT_EXPECTED");
    assert.equal(derive({}), "NOT_EXPECTED");
  });

  it("settled unless PREPARING", () => {
    assert.equal(completedArtifactsSettled("PREPARING"), false);
    for (const state of ["READY", "UNAVAILABLE", "NOT_EXPECTED", null] as const) {
      assert.equal(completedArtifactsSettled(state), true, String(state));
    }
  });
});

describe("Manager watcher activity", () => {
  it("watches In Progress, and Complete only until completed artifacts settle", () => {
    assert.equal(shouldWatchSigningState("IN_PROGRESS", true), true);
    assert.equal(shouldWatchSigningState("COMPLETE", false), true);
    assert.equal(shouldWatchSigningState("COMPLETE", true), false);
  });

  it("stops for Draft, Declined and Cancelled regardless of artifacts", () => {
    for (const state of ["DRAFT", "DECLINED", "CANCELLED"]) {
      assert.equal(shouldWatchSigningState(state, false), false, state);
      assert.equal(shouldWatchSigningState(state, true), false, state);
    }
  });

  it("keeps the 20 s cadence, hidden-tab skip, reveal/focus refresh and stale-response guard", () => {
    const watcher = read("components/signings/use-signing-state-watcher.ts");
    assert.match(watcher, /SIGNING_STATE_POLL_MS = 20_000/);
    assert.match(watcher, /document\.visibilityState !== "visible"\) return/);
    assert.match(watcher, /addEventListener\("visibilitychange", onReveal\)/);
    assert.match(watcher, /addEventListener\("focus", onFocus\)/);
    const page = read("components/signings/signing-dashboard-page.tsx");
    assert.match(page, /if \(loadSeq !== loadSeqRef\.current\) return;/);
    assert.match(page, /shouldWatchSigningState\(dashboard\.signing\.lifecycleState, dashboard\.completedArtifactsSettled\)/);
  });

  it("is read-only: no worker kick, enqueue, retry or artifact write from the watcher or the state loader", () => {
    const watcher = read("components/signings/use-signing-state-watcher.ts");
    assert.doesNotMatch(watcher, /kick|enqueue|requeue|worker|Action\(/i);
    const loader = read("lib/signing/completed-documents.ts");
    const body = loader.slice(loader.indexOf("export async function loadCompletedArtifactsStateForActor"));
    const fn = body.slice(0, body.indexOf("\nasync function listForScope"));
    assert.ok(fn.indexOf("completedRevisionForActor(") < fn.indexOf('from("signing_work_items")'), "authority before the work-item read");
    assert.doesNotMatch(fn, /\.insert\(|\.update\(\{|\.upsert\(|\.delete\(|kickSigningWork|requeueFailedWorkItem|processSigningWorkBatch/);
    assert.match(fn, /\.eq\("signing_id", scope\.signingId\)/);
    assert.doesNotMatch(fn, /last_error_safe|claimed_by/);
  });
});

describe("Completed documents: combined package row", () => {
  const documents: ManagerCompletedArtifact[] = [
    { artifactId: "11111111-1111-4111-8111-111111111111", kind: "DOCUMENT", label: "Contract", filename: "Contract - signed.pdf", pageCount: 2 },
    { artifactId: "22222222-2222-4222-8222-222222222222", kind: "CERTIFICATE", label: "Audit certificate", filename: "Audit certificate.pdf", pageCount: 1 },
  ];
  const combined: ManagerCompletedArtifact = {
    artifactId: "33333333-3333-4333-8333-333333333333",
    kind: "COMBINED",
    label: "Combined signed package",
    filename: "Combined signed package.pdf",
    pageCount: 3,
  };
  const render = (artifacts: ManagerCompletedArtifact[], combinedPackage: Parameters<typeof SigningCompletedDocuments>[0]["combinedPackage"]) =>
    renderToStaticMarkup(createElement(SigningCompletedDocuments, { signingId: "sig", artifacts, combinedPackage }));
  const pendingRow = (html: string) => {
    const start = html.indexOf('data-completed-artifact-pending="COMBINED"');
    return start < 0 ? null : html.slice(start, html.indexOf("</li>", start));
  };

  it("shows Combined signed package — Preparing… with no View or Download while pending", () => {
    const html = render(documents, "PREPARING");
    const row = pendingRow(html);
    assert.ok(row, "pending row missing");
    assert.match(row!, /Combined signed package/);
    assert.match(row!, /Preparing…/);
    assert.match(row!, /role="status"/);
    assert.doesNotMatch(row!, /View|Download|href=/);
    assert.doesNotMatch(html, /33333333-3333/);
    assert.match(html, /aria-label="View Contract"/);
    assert.match(html, /aria-label="Download Audit certificate"/);
  });

  it("replaces the pending row with View / Download once the artifact is listed", () => {
    const html = render([...documents, combined], "READY");
    assert.equal(pendingRow(html), null);
    assert.doesNotMatch(html, /Preparing/);
    assert.match(html, /aria-label="View Combined signed package"/);
    assert.match(html, /href="\/signings\/sig\/completed\/33333333-3333-4333-8333-333333333333\?download=1"/);
  });

  it("shows no combined row when it is not expected or no longer coming", () => {
    for (const state of ["NOT_EXPECTED", "UNAVAILABLE", null] as const) {
      const html = render(documents, state);
      assert.equal(pendingRow(html), null, String(state));
      assert.doesNotMatch(html, /Combined signed package/, String(state));
    }
  });
});
