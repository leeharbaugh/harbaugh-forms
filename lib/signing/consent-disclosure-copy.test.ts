import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { consentDisclosureFingerprint } from "./consent-disclosure";
import {
  CONSENT_ACKNOWLEDGEMENT,
  disclosureDownloadFilename,
  disclosureDownloadText,
  parseDisclosureBlocks,
} from "./consent-disclosure-view";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");

const MIGRATION = read(
  "supabase/migrations/20261019120000_native_signing_esign_disclosure_2026_10_19.sql",
);
const BODY = MIGRATION.match(/\$disclosure\$([\s\S]*?)\$disclosure\$/)?.[1] ?? "";

describe("Electronic records disclosure 2026-10-19: copy", () => {
  it("states each E-SIGN 7001(c)-style item in plain language", () => {
    assert.ok(BODY.length > 0);
    for (const anchor of [
      /You are not required to\./, // no obligation to use electronic records
      /applies only to this Signing/, // scope: this transaction only
      /"Leave for now" ends this browser session only\. It does not withdraw your consent or decline/,
      /"Decline to sign" withdraws you from electronic signing for this Signing\. It ends the Signing for everyone/,
      /charges no fee/,
      /To ask for a paper copy[\s\S]*contact the sender/,
      /cannot be changed here\. If either is wrong, stop and contact the sender/,
      /JavaScript and cookies/,
      /view PDF documents/,
      /download, save and print/,
      /works until the sender replaces or revokes it/,
    ]) {
      assert.match(BODY, anchor);
    }
  });

  it("makes no claim the product cannot support", () => {
    for (const claim of [
      /TREC/i,
      /approv/i,
      /complies? with/i,
      /legally binding/i,
      /notar/i,
      /verif(y|ied|ies) (your )?identity/i,
      /forever|indefinite|permanent/i,
      /we will (mail|provide paper)/i,
      /waive/i,
    ]) {
      assert.doesNotMatch(BODY, claim);
    }
    assert.match(BODY, /Harbaugh Forms does not provide a paper signing process/);
    assert.match(BODY, /Harbaugh Forms does not mail paper copies/);
  });

  it("lays the stored text out as sections without changing it", () => {
    const blocks = parseDisclosureBlocks(BODY);
    assert.deepEqual(
      blocks.map((block) => block.heading).filter(Boolean),
      [
        "Your choice",
        "What your consent covers",
        "Stopping before you finish",
        "Paper copies",
        "Your contact information",
        "What you need",
        "Keeping your records",
      ],
    );
    assert.equal(blocks[0].heading, null, "the introduction is not a heading");
    const needs = blocks.find((block) => block.heading === "What you need");
    assert.equal(needs?.bullets.length, 5);
    const stopping = blocks.find((block) => block.heading === "Stopping before you finish");
    assert.equal(stopping?.bullets.length, 2);
    assert.equal(stopping?.paragraphs.length, 1);
  });

  it("downloads the exact stored text with its version and fingerprint", () => {
    const sha = consentDisclosureFingerprint(BODY);
    const text = disclosureDownloadText({
      title: "Electronic records and signatures",
      versionKey: "esign-disclosure-2026-10-19",
      contentSha256: sha,
      bodyText: BODY,
    });
    assert.ok(text.includes(BODY));
    assert.ok(text.includes("Version: esign-disclosure-2026-10-19"));
    assert.ok(text.includes(`SHA-256: ${sha}`));
    assert.equal(disclosureDownloadFilename("esign-disclosure-2026-10-19"), "esign-disclosure-2026-10-19.txt");
  });

  it("asks for affirmative consent to this Signing and confirms access", () => {
    assert.match(CONSENT_ACKNOWLEDGEMENT, /I can view it on this device/);
    assert.match(CONSENT_ACKNOWLEDGEMENT, /electronic records and electronic signatures for this Signing/);
  });
});

describe("Electronic records disclosure 2026-10-19: publication", () => {
  it("publishes a new version, supersedes the old one and stays non-production", () => {
    assert.match(MIGRATION, /'esign-disclosure-2026-10-19'/);
    assert.match(MIGRATION, /encode\(sha256\(convert_to\(v_body, 'UTF8'\)\), 'hex'\)/);
    assert.match(MIGRATION, /set superseded_at = now\(\)\s+where superseded_at is null/);
    assert.match(MIGRATION, /v_body,\s+encode\(sha256[^)]+\)\), 'hex'\),\s+false\s*\)/);
    assert.match(MIGRATION, /expected exactly one current disclosure version/);
    assert.doesNotMatch(MIGRATION, /update public\.signing_consent_disclosure_versions\s+set (body_text|content_sha256)/);
    assert.doesNotMatch(MIGRATION, /update public\.signing_participants/);
  });
});

describe("Electronic records disclosure: ceremony UI", () => {
  const card = read("components/sign/consent-disclosure.tsx");
  const shell = read("components/sign/ceremony-shell.tsx");

  it("starts unchecked and enables Continue only after the checkbox", () => {
    assert.match(card, /const \[acknowledged, setAcknowledged\] = useState\(false\)/);
    assert.match(card, /disabled=\{pending \|\| !acknowledged\}/);
    assert.match(card, /<Label htmlFor=\{checkboxId\}/);
    assert.match(card, /data-testid="disclosure-download"/);
    assert.match(card, /data-testid="disclosure-print"/);
    assert.match(card, /Version \{disclosure\.versionKey\}/);
  });

  it("shows consent before any signing step and keeps Leave and Decline available", () => {
    const gateAt = shell.indexOf("if (!consentSatisfied || needsMarkSetup(overview))");
    const cardAt = shell.indexOf("<ConsentDisclosureCard");
    const leaveAt = shell.indexOf("{leaveButton}", cardAt);
    const declineAt = shell.indexOf("{declineButton}", cardAt);
    assert.ok(gateAt > 0 && cardAt > gateAt && leaveAt > cardAt && declineAt > cardAt);
    assert.match(shell, /acceptConsentAction\(\{\s*disclosureVersionId: disclosure\.id,/);
    assert.doesNotMatch(shell, /I agree to use electronic records and signatures/);
  });

  it("lets the participant reopen the disclosure they accepted", () => {
    assert.match(shell, /overview\.consent\.acceptedDisclosure \? \(\s*<DisclosureReviewButton disclosure=\{overview\.consent\.acceptedDisclosure\}/);
    assert.match(card, /role="dialog"/);
    assert.match(card, /event\.key === "Escape"/);
  });
});
