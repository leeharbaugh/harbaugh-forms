import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildCompletedPackageUrl,
  buildParticipantInviteUrl,
  completedPackagePathname,
  FRAGMENT_SECRET_RE,
  isSigningCredentialPublicId,
  participantInvitePathname,
} from "./bearer-transport";

const PUBLIC_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"; // 43 chars base64url-shaped

describe("bearer transport", () => {
  it("builds fragment URLs with UUID path only", () => {
    assert.ok(isSigningCredentialPublicId(PUBLIC_ID));
    assert.match(SECRET, FRAGMENT_SECRET_RE);

    const invite = buildParticipantInviteUrl(PUBLIC_ID, SECRET);
    assert.match(invite, new RegExp(`/sign/${PUBLIC_ID}#`));
    assert.ok(invite.endsWith(`#${SECRET}`));
    assert.equal(participantInvitePathname(PUBLIC_ID), `/sign/${PUBLIC_ID}`);
    assert.doesNotMatch(participantInvitePathname(PUBLIC_ID), /#/);

    const pack = buildCompletedPackageUrl(PUBLIC_ID, SECRET);
    assert.match(pack, new RegExp(`/sign/completed/${PUBLIC_ID}#`));
    assert.equal(
      completedPackagePathname(PUBLIC_ID),
      `/sign/completed/${PUBLIC_ID}`,
    );
  });

  it("rejects secret-in-path legacy URL builders", () => {
    assert.throws(() => buildParticipantInviteUrl(SECRET, SECRET));
    assert.throws(() => buildCompletedPackageUrl("not-a-uuid", SECRET));
  });

  it("wires GET landings and POST exchanges without path-token auth", () => {
    const entryPage = readFileSync(
      join(process.cwd(), "app/sign/[publicId]/page.tsx"),
      "utf8",
    );
    const packagePage = readFileSync(
      join(process.cwd(), "app/sign/completed/[publicId]/page.tsx"),
      "utf8",
    );
    const entryExchange = readFileSync(
      join(process.cwd(), "app/api/sign/entry-exchange/route.ts"),
      "utf8",
    );
    const packageExchange = readFileSync(
      join(process.cwd(), "app/api/sign/completed-package-exchange/route.ts"),
      "utf8",
    );
    const bootstrap = readFileSync(
      join(process.cwd(), "components/sign/fragment-exchange-bootstrap.tsx"),
      "utf8",
    );

    assert.equal(existsSync(join(process.cwd(), "app/sign/[token]/route.ts")), false);
    assert.equal(
      existsSync(join(process.cwd(), "app/sign/completed/[token]/route.ts")),
      false,
    );

    assert.match(entryPage, /FragmentExchangeBootstrap/);
    assert.match(packagePage, /completed-package/);
    assert.match(entryExchange, /validateParticipantCredentialByPublicIdAndSecret/);
    assert.match(
      packageExchange,
      /validateCompletedPackageCredentialByPublicIdAndSecret/,
    );
    assert.match(bootstrap, /history\.replaceState/);
    assert.match(bootstrap, /location\.hash/);
    assert.doesNotMatch(bootstrap, /localStorage|sessionStorage/);
    assert.doesNotMatch(entryExchange, /validateParticipantCredential\(/);
  });

  it("declares Pro Cron every 2 minutes", () => {
    const vercelJson = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    assert.match(vercelJson, /\/api\/internal\/cron\/signing-worker/);
    assert.match(vercelJson, /\*\/2 \* \* \* \*/);
    assert.doesNotMatch(vercelJson, /0 14 \* \* \*/);
  });
});
