import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import { createDraftSigningWithActor } from "./operations";
import {
  defaultPacketSigningTitle,
  normalizeSigningTitle,
  resolvePacketSigningTitle,
  SIGNING_TITLE_MAX_LENGTH,
  type SigningActor,
} from "./types";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const LIST_PAGE = "components/signings/signings-list-page.tsx";

/** Any database access fails the test: validation must reject first. */
const untouchableAdmin = new Proxy(
  {},
  {
    get() {
      throw new Error("database must not be reached");
    },
  },
) as SupabaseClient;

const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "agent@example.com",
  displayName: "Agent",
  profile: {},
  memberships: [],
} as unknown as SigningActor;

describe("Create Signing from a Packet", () => {
  it("titles the Signing from the Packet label", () => {
    assert.equal(
      defaultPacketSigningTitle({ id: 17, label: "  123 Main St Purchase " }),
      "Signing — 123 Main St Purchase",
    );
  });

  it("falls back to the Packet number when no label is available", () => {
    for (const label of [null, "", "   "]) {
      assert.equal(
        defaultPacketSigningTitle({ id: 17, label }),
        "Signing — Packet 17",
      );
    }
  });

  it("keeps a long Packet label within the required title limit", () => {
    const title = defaultPacketSigningTitle({ id: 1, label: "A".repeat(500) });
    assert.equal(title.length, SIGNING_TITLE_MAX_LENGTH);
    assert.equal(normalizeSigningTitle(title), title);
    const emoji = defaultPacketSigningTitle({
      id: 1,
      label: `${"A".repeat(SIGNING_TITLE_MAX_LENGTH - "Signing — ".length - 1)}😀`,
    });
    assert.doesNotMatch(emoji, /[\uD800-\uDBFF]$/);
    assert.ok(emoji.length <= SIGNING_TITLE_MAX_LENGTH);
  });

  it("uses the Packet-derived title from the server, not a client default", () => {
    const packetToSigning = read("lib/signing/packet-to-signing.ts");
    assert.match(packetToSigning, /resolvePacketSigningTitle\(input\.title,/);
    const packetDetail = read("components/packets/packet-detail.tsx");
    const call = packetDetail.match(
      /createSigningFromPacketAction\(\{[^}]*\}\)/,
    );
    assert.ok(call, "Packet page calls createSigningFromPacketAction");
    assert.doesNotMatch(call[0], /title/);
  });
});

describe("Create Signing without a Packet title", () => {
  it("starts blank with a placeholder instead of a QA title", () => {
    const list = read(LIST_PAGE);
    assert.match(list, /const \[title, setTitle\] = useState\(""\);/);
    assert.match(list, /placeholder="Enter signing title"/);
  });

  it("never seeds a development or QA title in Signing creation", () => {
    const sources = [
      LIST_PAGE,
      "components/packets/packet-detail.tsx",
      "components/signings/signing-dashboard-page.tsx",
      "lib/signing/packet-to-signing.ts",
      "lib/signing/operations.ts",
      "lib/signing/actions.ts",
      "lib/signing/types.ts",
    ];
    for (const file of sources) {
      assert.doesNotMatch(read(file), /DEV QA|QA Test|Test Signing/i, file);
    }
  });
});

describe("Create Signing with a custom title", () => {
  it("prefers the requested title over the Packet label", () => {
    assert.equal(
      resolvePacketSigningTitle("  Smith purchase  ", { id: 17, label: "Packet A" }),
      "Smith purchase",
    );
    assert.equal(
      resolvePacketSigningTitle("   ", { id: 17, label: "Packet A" }),
      "Signing — Packet A",
    );
  });

  it("sends exactly what the agent typed and changes the title only on input", () => {
    const list = read(LIST_PAGE);
    assert.match(list, /createDraftSigningAction\(\{ title \}\)/);
    const setters = list.match(/setTitle\(/g) ?? [];
    assert.equal(setters.length, 1);
    assert.match(list, /onChange=\{\(event\) => setTitle\(event\.target\.value\)\}/);
  });
});

describe("Required Signing title", () => {
  it("blocks Create Signing in the form until a title is entered", () => {
    const list = read(LIST_PAGE);
    assert.match(list, /disabled=\{creating \|\| title\.trim\(\)\.length === 0\}/);
    assert.match(list, /\brequired\b/);
  });

  it("rejects a blank title on the server before any write", async () => {
    const previous = process.env.NATIVE_SIGNING_ENABLED;
    process.env.NATIVE_SIGNING_ENABLED = "true";
    try {
      for (const title of ["", "   ", undefined]) {
        await assert.rejects(
          createDraftSigningWithActor(actor, { title }, untouchableAdmin),
          (error: unknown) =>
            error instanceof SigningError &&
            error.code === "INVALID_INPUT" &&
            error.message === "A Signing title is required.",
        );
      }
    } finally {
      if (previous === undefined) delete process.env.NATIVE_SIGNING_ENABLED;
      else process.env.NATIVE_SIGNING_ENABLED = previous;
    }
  });
});

describe("Existing Signing titles", () => {
  it("are displayed as stored", () => {
    assert.match(read(LIST_PAGE), /\{signing\.title\}/);
  });

  it("are not rewritten by any migration", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(dir)) {
      const sql = readFileSync(join(dir, file), "utf8");
      assert.doesNotMatch(sql, /update\s+(public\.)?signings\s+set\s+title/i, file);
      assert.doesNotMatch(sql, /DEV QA/i, file);
    }
  });

  it("keep the Packet-derived default out of rename and listing", () => {
    for (const file of [
      "lib/signing/rename.ts",
      "lib/signing/operations.ts",
      "components/signings/signing-dashboard-page.tsx",
    ]) {
      assert.doesNotMatch(
        read(file),
        /defaultPacketSigningTitle|resolvePacketSigningTitle/,
        file,
      );
    }
  });
});
