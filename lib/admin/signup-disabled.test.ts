import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

describe("public signup disabled", () => {
  it("sign-up page does not render a registration form", async () => {
    const page = await readFile(
      new URL("../../app/auth/sign-up/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /InvitationOnlyNotice/);
    assert.doesNotMatch(page, /SignUpForm/);
  });

  it("no browser auth.signUp calls remain", async () => {
    const files = [
      "../../components/sign-up-form.tsx",
      "../../components/login-form.tsx",
      "../../components/auth-button.tsx",
      "../../app/auth/actions.ts",
    ];
    for (const relative of files) {
      const source = await readFile(new URL(relative, import.meta.url), "utf8");
      assert.doesNotMatch(source, /\.signUp\s*\(/);
    }
  });

  it("login form no longer links to public signup", async () => {
    const source = await readFile(
      new URL("../../components/login-form.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /\/auth\/sign-up/);
    assert.match(source, /invitation-only/i);
  });
});
