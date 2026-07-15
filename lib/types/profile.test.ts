import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  formatProfileDisplayName,
  formatSignedInGreeting,
  type ProfileNameFields,
} from "./profile.ts";

function fields(
  overrides: Partial<ProfileNameFields> = {},
): ProfileNameFields {
  return {
    preferred_name: null,
    display_name: null,
    first_name: null,
    middle_name: null,
    last_name: null,
    email: null,
    ...overrides,
  };
}

describe("formatSignedInGreeting", () => {
  it("renders preferred name as Hello, Lee", () => {
    const greeting = formatSignedInGreeting(
      fields({
        preferred_name: "Lee",
        display_name: "Lee Harbaugh",
        email: "user@example.com",
      }),
    );
    assert.equal(greeting, "Hello, Lee");
    assert.notEqual(greeting, "Lee");
    assert.doesNotMatch(greeting, /Hey/i);
  });

  it("renders another preferred name correctly", () => {
    assert.equal(
      formatSignedInGreeting(fields({ preferred_name: "Jane" })),
      "Hello, Jane",
    );
  });

  it("renders email fallback as Hello, user@example.com", () => {
    const greeting = formatSignedInGreeting(
      fields({ email: "user@example.com" }),
    );
    assert.equal(greeting, "Hello, user@example.com");
    assert.notEqual(greeting, "user@example.com");
    assert.doesNotMatch(greeting, /Hey/i);
  });

  it("prefers display name before legal name and email", () => {
    assert.equal(
      formatSignedInGreeting(
        fields({
          display_name: "Jane",
          first_name: "Janet",
          email: "user@example.com",
        }),
      ),
      "Hello, Jane",
    );
  });
});

describe("formatProfileDisplayName", () => {
  it("keeps name-only resolution for non-greeting callers", () => {
    assert.equal(formatProfileDisplayName(fields({ preferred_name: "Lee" })), "Lee");
    assert.equal(
      formatProfileDisplayName(fields({ email: "user@example.com" })),
      "user@example.com",
    );
  });
});

describe("AppNav identity wiring", () => {
  it("AuthButton uses Hello greeting with truncation title and Logout", () => {
    const source = readFileSync(
      join(process.cwd(), "components/auth-button.tsx"),
      "utf8",
    );
    assert.match(source, /formatSignedInGreeting/);
    assert.match(source, /\{greeting\}/);
    assert.match(source, /title=\{user\.email \?\? greeting\}/);
    assert.match(source, /aria-label=\{greeting\}/);
    assert.match(source, /<LogoutButton \/>/);
    assert.doesNotMatch(source, /Hey,/);
    assert.doesNotMatch(source, /formatProfileDisplayName/);
  });

  it("AdminNavLink visibility rules remain ADMIN/ACTIVE gated", () => {
    const source = readFileSync(
      join(process.cwd(), "components/admin-nav-link.tsx"),
      "utf8",
    );
    assert.match(source, /app_role !== "ADMIN"/);
    assert.match(source, /status !== "ACTIVE"/);
    assert.match(source, /onboarding_status !== "ACTIVE"/);
  });

  it("LogoutButton still signs out and routes to login", () => {
    const source = readFileSync(
      join(process.cwd(), "components/logout-button.tsx"),
      "utf8",
    );
    assert.match(source, /signOut/);
    assert.match(source, /\/auth\/login/);
    assert.match(source, /variant="ghost"/);
  });
});
