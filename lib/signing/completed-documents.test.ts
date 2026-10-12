import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { canReadCompletedSigningArtifacts, evaluateSigningAuthority } from "./authority";
import {
  completedArtifactContentDisposition,
  completedArtifactFilename,
} from "./completed-documents";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const ROUTE = "app/signings/[signingId]/completed/[artifactId]/route.ts";
const MODULE = "lib/signing/completed-documents.ts";
const SECTION = "components/signings/signing-completed-documents.tsx";
const VIEWER = "components/signings/completed-document-viewer.tsx";
const DASHBOARD_PAGE = "components/signings/signing-dashboard-page.tsx";
const DASHBOARD = "lib/signing/dashboard.ts";

const signing = {
  signingId: "sig-1",
  originatingOrganizationId: "org-a",
  lifecycleState: "COMPLETE",
  currentPrimaryAgentAssociationId: "assoc-1",
  originalSenderUserId: "agent-1",
  associations: [
    { id: "assoc-1", agentUserId: "agent-1", associationRole: "PRIMARY" as const, effectiveEndedAt: null },
    { id: "assoc-2", agentUserId: "co-1", associationRole: "CO_AGENT" as const, effectiveEndedAt: null },
    { id: "assoc-0", agentUserId: "former-1", associationRole: "PRIMARY" as const, effectiveEndedAt: "2026-09-01T00:00:00Z" },
  ],
  operatorAssociations: [
    {
      id: "op-1",
      operatorUserId: "tc-1",
      operatorRole: "TRANSACTION_COORDINATOR" as const,
      status: "ACTIVE",
      effectiveEndedAt: null,
      signingOperatorDelegationId: "del-1",
    },
  ],
  operatorDelegations: [
    {
      id: "del-1",
      organizationId: "org-a",
      responsibleUserId: "agent-1",
      delegateUserId: "tc-1",
      operatorRole: "TRANSACTION_COORDINATOR" as const,
      status: "ACTIVE",
      revokedAt: null,
      effectiveEndedAt: null,
    },
  ],
};

const membership = (organizationId: string, membershipRole: "MEMBER" | "ORG_ADMIN" = "MEMBER") => [
  { organizationId, membershipRole, membershipStatus: "ACTIVE", organizationStatus: "ACTIVE" },
];

function mayRead(actorUserId: string, memberships: ReturnType<typeof membership>, lifecycleState: string) {
  const authority = evaluateSigningAuthority({
    signing: { ...signing, lifecycleState },
    actorUserId,
    memberships,
  });
  return canReadCompletedSigningArtifacts(authority, lifecycleState);
}

describe("Completed documents: authority and lifecycle", () => {
  const authorized: Array<[string, string, ReturnType<typeof membership>]> = [
    ["primary agent", "agent-1", membership("org-a")],
    ["co-agent", "co-1", membership("org-a")],
    ["active TC", "tc-1", membership("org-a")],
    ["originating brokerage admin", "broker-admin", membership("org-a", "ORG_ADMIN")],
    ["former primary agent (historical read)", "former-1", membership("org-a")],
  ];

  for (const [label, userId, memberships] of authorized) {
    it(`${label} may read completed documents only when Complete`, () => {
      assert.equal(mayRead(userId, memberships, "COMPLETE"), true);
      for (const state of ["DRAFT", "IN_PROGRESS", "DECLINED", "CANCELLED"]) {
        assert.equal(mayRead(userId, memberships, state), false, `${label} in ${state}`);
      }
    });
  }

  it("unrelated users, other brokerages and global admins without Signing authority are denied", () => {
    assert.equal(mayRead("stranger", membership("org-a"), "COMPLETE"), false);
    assert.equal(mayRead("elsewhere-admin", membership("org-b", "ORG_ADMIN"), "COMPLETE"), false);
    assert.equal(mayRead("global-admin", [], "COMPLETE"), false);
  });
});

describe("Completed documents: filenames and disposition", () => {
  it("names downloads after the frozen document, never the Signing title or a key", () => {
    assert.equal(completedArtifactFilename("DOCUMENT", "Residential Contract"), "Residential Contract - signed.pdf");
    assert.equal(completedArtifactFilename("DOCUMENT", 'a/b\\c:d*e?"f<g>h|i'), "a b c d e f g h i - signed.pdf");
    assert.equal(completedArtifactFilename("DOCUMENT", "   "), "Document - signed.pdf");
    assert.ok(completedArtifactFilename("DOCUMENT", "x".repeat(400)).length <= 150 + " - signed.pdf".length);
    assert.equal(completedArtifactFilename("CERTIFICATE", "ignored"), "Audit certificate.pdf");
    assert.equal(completedArtifactFilename("COMBINED", "ignored"), "Combined signed package.pdf");
  });

  it("builds inline/attachment headers with a safe ASCII fallback and UTF-8 name", () => {
    assert.equal(
      completedArtifactContentDisposition("attachment", "Contract - signed.pdf"),
      `attachment; filename="Contract - signed.pdf"; filename*=UTF-8''Contract%20-%20signed.pdf`,
    );
    const header = completedArtifactContentDisposition("inline", 'Café "x"; y - signed.pdf');
    assert.ok(header.startsWith('inline; filename="Caf_ _x__ y - signed.pdf"'));
    assert.ok(header.includes("filename*=UTF-8''Caf%C3%A9"));
    assert.equal(header.split("\n").length, 1);
  });
});

describe("Completed documents: server boundary", () => {
  const route = read(ROUTE);
  const serverModule = read(MODULE);

  it("route authenticates before any service-role access and accepts only opaque ids", () => {
    const actorAt = route.indexOf("requireSigningActor()");
    const adminAt = route.indexOf("createAdminClient()");
    assert.ok(actorAt > 0 && adminAt > actorAt, "requireSigningActor must precede createAdminClient");
    assert.match(route, /signingId, artifactId \} = await context\.params/);
    assert.doesNotMatch(route, /searchParams\.get\("(path|key|bucket|object)/);
    assert.doesNotMatch(route, /storage_object_key|createSignedUrl|getPublicUrl/);
    assert.match(route, /searchParams\.get\("download"\) === "1"/);
  });

  it("route returns the same bytes for View and Download, private and uncached", () => {
    assert.equal((route.match(/loadCompletedArtifactForActor\(/g) ?? []).length, 1);
    assert.match(route, /"Content-Type": "application\/pdf"/);
    assert.match(route, /no-store/);
    assert.match(route, /nosniff/);
    assert.match(route, /X-Signing-Artifact-SHA256/);
    assert.match(route, /"INTEGRITY_MISMATCH"[\s\S]{0,160}textResponse\(409/);
    assert.match(route, /"UNAUTHENTICATED"\) return textResponse\(401/);
    assert.match(route, /return textResponse\(404, "Not Found"\);\s*\}\s*console\.error/);
  });

  it("module gates on authority + Complete, binds to the Signing and re-hashes every serve", () => {
    const gateAt = serverModule.indexOf("canReadCompletedSigningArtifacts(");
    const downloadAt = serverModule.indexOf(".download(");
    assert.ok(gateAt > 0 && downloadAt > gateAt, "authority gate must precede storage download");
    assert.match(serverModule, /storage_bucket !== SIGNING_ARTIFACTS_BUCKET/);
    assert.match(serverModule, /startsWith\(`signings\/\$\{signingId\}\/artifacts\/`\)/);
    assert.match(serverModule, /\.eq\("package_revision_id", frozenRevisionId\)/);
    assert.match(serverModule, /\.not\("verified_at", "is", null\)/);
    assert.match(serverModule, /createHash\("sha256"\)/);
    assert.match(serverModule, /sha256 !== artifact\.content_sha256/);
    assert.match(serverModule, /INTEGRITY_MISMATCH/);
  });

  it("never renders, regenerates or writes completed artifacts", () => {
    for (const source of [route, serverModule]) {
      assert.doesNotMatch(source, /renderCompleted|\.upload\(|\.insert\(|\.upsert\(|\.delete\(|\.remove\(|\)\s*\.update\(\{/);
      assert.doesNotMatch(source, /isGlobalAdmin|GLOBAL_ADMIN|is_global_admin/);
    }
  });
});

describe("Completed documents: manager UI", () => {
  const section = read(SECTION);
  const viewer = read(VIEWER);
  const page = read(DASHBOARD_PAGE);
  const dashboard = read(DASHBOARD);

  it("appears only on Complete Signings, from server-listed artifacts", () => {
    assert.match(page, /lifecycleState === "COMPLETE" \? \(?\s*<SigningCompletedDocuments/);
    assert.match(dashboard, /summary\.lifecycleState === "COMPLETE"[\s\S]{0,80}loadCompletedArtifactsStateForActor/);
  });

  it("View and Download hit the same server route; no raw storage in the browser", () => {
    assert.match(section, /\/signings\/\$\{.*\}\/completed\/\$\{.*\}/);
    assert.match(section, /\?download=1/);
    for (const source of [section, viewer]) {
      assert.doesNotMatch(source, /supabase|storage_object_key|signing-artifacts|createSignedUrl/i);
    }
  });

  it("viewer is read-only with Fit Width, Fit Page, zoom and close", () => {
    for (const label of ["Fit Width", "Fit Page", "Zoom in", "Zoom out", "Close", "Download"]) {
      assert.ok(viewer.includes(label), `viewer missing ${label}`);
    }
    assert.match(viewer, /renderTextLayer=\{false\}/);
    assert.doesNotMatch(viewer, /Prepare|Add field|onDrop|draggable/);
  });
});
