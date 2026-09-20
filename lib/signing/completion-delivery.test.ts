/**
 * Native Signing completion-delivery boundary and helper tests.
 * Mock-free where possible: source reads and pure functions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  canManageCompletedSigningOperations,
} from "./completed-package-authority";
import {
  generateCompletedPackageToken,
  hashCompletedPackageToken,
  isWellFormedCompletedPackageToken,
} from "./completed-package-credentials";
import {
  buildCompletedPackageCookieAttributes,
  generateCompletedPackageSessionToken,
  SIGNING_COMPLETED_PACKAGE_COOKIE_NAME,
  SIGNING_COMPLETED_PACKAGE_COOKIE_PATH,
  SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES,
} from "./completed-package-sessions";
import {
  COMPLETED_PACKAGE_WRAP_KEY_ENV,
  COMPLETED_PACKAGE_WRAP_KEY_ID_ENV,
  COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV,
  resolveCompletedPackageWrapKeyring,
  CompletedPackageWrapConfigError,
} from "./completed-package-wrap";
import type { SigningAuthorityResult } from "./authority";
import {
  NATIVE_SIGNING_COMPLETION_DELIVERY_MIGRATIONS,
  NATIVE_SIGNING_COMPLETION_DELIVERY_TABLES,
} from "./stage1-schema";
import {
  SIGNING_WORK_SUSPENDED_ENV,
} from "./work-suspension";
import {
  SIGNING_WORKER_SECRET_HEADER,
  verifySigningWorkerSecret,
} from "./signing-worker-dispatch";
import { DELIVER_COMPLETED_PACKAGE_WORK_TYPE } from "./completed-package-delivery";
import { buildCompletedPackageMessage, buildCompletedPackageUrl } from "./delivery";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

function baseAuthority(
  overrides: Partial<SigningAuthorityResult> = {},
): SigningAuthorityResult {
  return {
    canRead: false,
    canManage: false,
    activeAssociation: null,
    historicalAssociation: null,
    activeOperatorAssociation: null,
    historicalOperatorAssociation: null,
    isBrokerageAdministrator: false,
    isTransactionCoordinator: false,
    ...overrides,
  };
}

describe("Native Signing completion delivery", () => {
  const migration = read(
    `supabase/migrations/${NATIVE_SIGNING_COMPLETION_DELIVERY_MIGRATIONS[0]}.sql`,
  );
  const wrap = read("lib/signing/completed-package-wrap.ts");
  const credentials = read("lib/signing/completed-package-credentials.ts");
  const sessions = read("lib/signing/completed-package-sessions.ts");
  const delivery = read("lib/signing/completed-package-delivery.ts");
  const finalization = read("lib/signing/finalization-worker.ts");
  const workerRoute = read("app/api/internal/signing-worker/route.ts");
  const exchangeRoute = read("app/sign/completed/[token]/route.ts");
  const packagePage = read("app/sign/package/page.tsx");
  const artifactRoute = read(
    "app/sign/package/artifact/[artifactId]/route.ts",
  );
  const ceremonyShell = read("components/sign/ceremony-shell.tsx");
  const dispatch = read("lib/signing/signing-worker-dispatch.ts");

  it("creates completion-delivery tables with deny-by-default RLS", () => {
    assert.deepEqual(
      [...NATIVE_SIGNING_COMPLETION_DELIVERY_TABLES],
      [
        "signing_copy_recipients",
        "signing_completed_package_credentials",
        "signing_completed_package_sessions",
        "signing_completed_package_access_log",
        "signing_system_controls",
      ],
    );
    for (const table of NATIVE_SIGNING_COMPLETION_DELIVERY_TABLES) {
      assert.match(
        migration,
        new RegExp(`create table if not exists public\\.${table}\\b`),
      );
    }
    assert.match(migration, /enable row level security/);
    assert.match(migration, /force row level security/);
    assert.match(migration, /using \(false\) with check \(false\)/);
    assert.match(migration, /purpose in \('INVITATION', 'COMPLETED_PACKAGE'\)/);
    assert.match(migration, /work_suspended boolean not null default false/);
    assert.doesNotMatch(migration, /on delete cascade/i);
  });

  it("uses purpose-separated wrap keys and completed-package-v1 AAD", () => {
    assert.match(wrap, /SIGNING_COMPLETED_PACKAGE_WRAP_KEY_ID/);
    assert.match(wrap, /SIGNING_COMPLETED_PACKAGE_WRAP_KEY/);
    assert.match(wrap, /SIGNING_COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS/);
    assert.match(wrap, /completed-package-v1/);
    assert.doesNotMatch(wrap, /SUPABASE_SECRET_KEY/);
    assert.doesNotMatch(wrap, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(wrap, /SIGNING_CREDENTIAL_WRAP_KEY/);

    assert.throws(
      () => resolveCompletedPackageWrapKeyring({}),
      CompletedPackageWrapConfigError,
    );

    const keyMaterial = Buffer.alloc(32, 7).toString("base64url");
    const keyring = resolveCompletedPackageWrapKeyring({
      [COMPLETED_PACKAGE_WRAP_KEY_ID_ENV]: "v1",
      [COMPLETED_PACKAGE_WRAP_KEY_ENV]: keyMaterial,
      [COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV]: undefined,
    });
    assert.equal(keyring.currentKeyId, "v1");
    assert.ok(keyring.keys.has("v1"));
  });

  it("issues 32-byte base64url tokens hashed with SHA-256 hex", () => {
    const token = generateCompletedPackageToken();
    assert.ok(isWellFormedCompletedPackageToken(token));
    assert.equal(token.length, 43);
    const hash = hashCompletedPackageToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.match(credentials, /never log raw tokens/i);
    assert.match(credentials, /token_hash/);
    assert.match(credentials, /lifecycle_state !== "COMPLETE"/);
  });

  it("scopes package session cookie to /sign/package for 60 minutes", () => {
    const cookie = buildCompletedPackageCookieAttributes({
      rawSessionToken: generateCompletedPackageSessionToken(),
    });
    assert.equal(cookie.name, "hf_signing_completed_package");
    assert.equal(SIGNING_COMPLETED_PACKAGE_COOKIE_NAME, "hf_signing_completed_package");
    assert.equal(cookie.path, "/sign/package");
    assert.equal(SIGNING_COMPLETED_PACKAGE_COOKIE_PATH, "/sign/package");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES, 60);
    assert.equal(cookie.maxAge, 60 * 60);
    assert.match(sessions, /SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES = 60/);
  });

  it("reconstructs completed manage authority after COMPLETE", () => {
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          canManage: false,
          isBrokerageAdministrator: true,
        }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          canManage: false,
          activeAssociation: {
            id: "a1",
            agentUserId: "u1",
            associationRole: "PRIMARY",
            effectiveEndedAt: null,
          },
        }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          canManage: false,
          activeOperatorAssociation: {
            id: "o1",
            operatorUserId: "tc1",
            operatorRole: "TRANSACTION_COORDINATOR",
            status: "ACTIVE",
            effectiveEndedAt: null,
            signingOperatorDelegationId: "d1",
          },
        }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({
          historicalOperatorAssociation: {
            id: "o1",
            operatorUserId: "tc1",
            operatorRole: "TRANSACTION_COORDINATOR",
            status: "ENDED",
            effectiveEndedAt: "2026-01-01T00:00:00.000Z",
            signingOperatorDelegationId: "d1",
          },
        }),
        "COMPLETE",
      ),
      false,
    );
    assert.equal(
      canManageCompletedSigningOperations(
        baseAuthority({ isBrokerageAdministrator: true }),
        "IN_PROGRESS",
      ),
      false,
    );
  });

  it("honors SIGNING_WORK_SUSPENDED env and worker secret header", () => {
    assert.equal(SIGNING_WORK_SUSPENDED_ENV, "SIGNING_WORK_SUSPENDED");
    assert.match(read("lib/signing/work-suspension.ts"), /SIGNING_WORK_SUSPENDED/);
    assert.match(read("lib/signing/work-suspension.ts"), /work_suspended/);

    assert.equal(SIGNING_WORKER_SECRET_HEADER, "x-signing-worker-secret");
    assert.equal(
      verifySigningWorkerSecret("secret", {
        SIGNING_WORKER_SECRET: "secret",
      }),
      true,
    );
    assert.equal(
      verifySigningWorkerSecret("wrong", {
        SIGNING_WORKER_SECRET: "secret",
      }),
      false,
    );
    assert.equal(verifySigningWorkerSecret(null, {}), false);
    assert.match(workerRoute, /x-signing-worker-secret|SIGNING_WORKER_SECRET_HEADER/);
    assert.match(workerRoute, /POST/);
    assert.match(dispatch, /DELIVER_COMPLETED_PACKAGE/);
    assert.equal(DELIVER_COMPLETED_PACKAGE_WORK_TYPE, "DELIVER_COMPLETED_PACKAGE");
  });

  it("wires fan-out after Complete without failing finalization", () => {
    assert.match(finalization, /enqueueInitialCompletedPackageFanOut/);
    assert.match(finalization, /must never fail or roll back Complete/);
    assert.match(finalization, /isSigningWorkSuspended/);
    assert.match(delivery, /enqueueInitialCompletedPackageFanOut/);
    assert.match(delivery, /frozen_email/);
    assert.match(delivery, /COMPLETED_PACKAGE_SENT/);
    assert.match(delivery, /COMPLETED_PACKAGE_RESEND_REQUESTED/);
    assert.match(
      delivery,
      /Completed-package link could not be recovered; use Replace Link/,
    );
  });

  it("revokes completed-package access when a copy recipient is removed", () => {
    const copyRecipients = read("lib/signing/copy-recipients.ts");
    assert.match(copyRecipients, /revokeCompletedPackageCredential/);
    assert.match(copyRecipients, /revokeCompletedPackageSessionsForCredential/);
    assert.match(copyRecipients, /COPY_RECIPIENT_REMOVED/);
    assert.match(
      credentials,
      /copyRecipient\.status !== "ACTIVE"/,
    );
    assert.match(
      sessions,
      /copyRecipient\.status !== "ACTIVE"/,
    );
  });

  it("blocks invitation and finalization when work is suspended", () => {
    const invitationDelivery = read("lib/signing/delivery.ts");
    assert.match(invitationDelivery, /isSigningWorkSuspended/);
    assert.match(
      invitationDelivery,
      /VERCEL_ENV[\s\S]*production[\s\S]*sandbox is not allowed/,
    );
    assert.match(finalization, /isSigningWorkSuspended/);
    assert.match(
      read("lib/signing/signing-worker-dispatch.ts"),
      /isSigningWorkSuspended/,
    );
  });

  it("exchanges completed bearer and serves package without app nav", () => {
    assert.match(exchangeRoute, /validateCompletedPackageCredential/);
    assert.match(exchangeRoute, /createCompletedPackageSession/);
    assert.match(exchangeRoute, /status: 303/);
    assert.match(exchangeRoute, /"\/sign\/package"/);
    assert.match(exchangeRoute, /no-referrer/);
    assert.match(exchangeRoute, /no-store/);
    assert.match(packagePage, /validateCompletedPackageSession/);
    assert.match(packagePage, /listCompletedPackageArtifactsForSession/);
    assert.doesNotMatch(packagePage, /AppNav|MainNav|WorkspaceNav/);
    assert.match(artifactRoute, /downloadArtifactBytes/);
    assert.match(artifactRoute, /Content-Disposition/);
    assert.match(artifactRoute, /appendCompletedPackageAccessLog/);
  });

  it("keeps ceremony shell typed-only (drawn UI not enabled)", () => {
    assert.match(ceremonyShell, /representationType:\s*"TYPED"/);
    assert.doesNotMatch(ceremonyShell, /representationType:\s*"DRAWN"/);
  });

  it("builds text-only completed-package email messages", () => {
    const message = buildCompletedPackageMessage({
      recipientName: "Sam",
      recipientEmail: "sam@example.com",
      signingTitle: "Offer",
      packageUrl: buildCompletedPackageUrl("tok"),
    });
    assert.equal(message.to, "sam@example.com");
    assert.match(message.textBody, /\/sign\/completed\/tok/);
    assert.doesNotMatch(message.textBody, /<html/i);
  });
});
