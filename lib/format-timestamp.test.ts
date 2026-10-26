import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DISPLAY_TIME_ZONE, formatTimestamp } from "./format-timestamp.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("formatTimestamp", () => {
  it("formats in America/Chicago with an explicit zone label", () => {
    assert.equal(DISPLAY_TIME_ZONE, "America/Chicago");
    assert.equal(formatTimestamp("2026-10-02T02:16:05Z"), "10/1/2026, 9:16:05 PM CDT");
    assert.equal(formatTimestamp("2026-01-15T18:00:00Z"), "1/15/2026, 12:00:00 PM CST");
    assert.equal(formatTimestamp("2026-01-15T06:00:00.000+00:00"), "1/15/2026, 12:00:00 AM CST");
  });

  it("uses plain ASCII spacing regardless of ICU version", () => {
    assert.match(formatTimestamp("2026-10-02T02:16:05Z"), /^[\x20-\x7e]+$/);
  });

  it("keeps the existing empty and invalid fallbacks", () => {
    assert.equal(formatTimestamp(null), "—");
    assert.equal(formatTimestamp(undefined), "—");
    assert.equal(formatTimestamp(""), "—");
    assert.equal(formatTimestamp("not-a-date"), "—");
    assert.equal(formatTimestamp("not-a-date", { invalid: "raw" }), "not-a-date");
  });

  it("produces identical output under different process time zones", () => {
    const moduleUrl = pathToFileURL(join(root, "lib/format-timestamp.ts")).href;
    const script = `import { formatTimestamp } from ${JSON.stringify(moduleUrl)};
console.log(JSON.stringify(["2026-10-02T02:16:05Z", "2026-01-15T06:00:00Z", "2026-03-08T08:30:00Z"].map((v) => formatTimestamp(v))));`;
    const outputs = ["UTC", "America/Chicago", "Asia/Tokyo"].map((tz) => {
      const result = spawnSync(
        process.execPath,
        ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
        { env: { ...process.env, TZ: tz }, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    });
    assert.equal(outputs[0], outputs[1]);
    assert.equal(outputs[0], outputs[2]);
  });
});

describe("admin components render deterministic timestamps", () => {
  const adminDir = join(root, "components/admin");
  const files = readdirSync(adminDir).filter((name) => name.endsWith(".tsx"));

  it("never format dates with the runtime locale or time zone", () => {
    assert.ok(files.length > 0);
    for (const name of files) {
      const source = readFileSync(join(adminDir, name), "utf8");
      assert.ok(
        !/\.toLocale(?:Date|Time)?String\(/.test(source),
        `${name} must use formatTimestamp() from lib/format-timestamp.ts`,
      );
    }
  });
});

describe("signing manager components render deterministic timestamps", () => {
  const signingsDir = join(root, "components/signings");
  const files = readdirSync(signingsDir).filter((name) => name.endsWith(".tsx"));
  // Rendered only from client state after the manager starts an in-person
  // handoff, so it is never part of the server-rendered hydration tree.
  const clientOnly = "new Date(handoff.expiresAt).toLocaleTimeString()";

  it("never format server-rendered dates with the runtime locale or time zone", () => {
    assert.ok(files.length > 0);
    for (const name of files) {
      const source = readFileSync(join(signingsDir, name), "utf8").split(clientOnly).join("");
      assert.ok(
        !/\.toLocale(?:Date|Time)?String\(/.test(source),
        `${name} must use formatTimestamp() from lib/format-timestamp.ts`,
      );
    }
  });

  it("formats the dashboard and list timestamps with formatTimestamp()", () => {
    const dashboard = readFileSync(join(signingsDir, "signing-dashboard-page.tsx"), "utf8");
    const list = readFileSync(join(signingsDir, "signings-list-page.tsx"), "utf8");
    assert.match(dashboard, /function formatWhen\(value: string \| null\): string \| null \{\s+return value \? formatTimestamp\(value\) : null;/);
    assert.match(dashboard, /` on \$\{formatTimestamp\(dashboard\.signing\.activatedAt\)\}`/);
    assert.match(list, /Updated \{formatTimestamp\(signing\.updateDate\)\}/);
    assert.equal(formatTimestamp("2026-10-26T15:46:00Z"), "10/26/2026, 10:46:00 AM CDT");
  });
});

describe("packet timestamps render in a fixed time zone", () => {
  const sources = [
    "lib/types/packet.ts",
    ...["components/packets", "components/contacts"].flatMap((dir) =>
      readdirSync(join(root, dir))
        .filter((name) => name.endsWith(".tsx"))
        .map((name) => `${dir}/${name}`),
    ),
  ];

  it("never format dates with the runtime locale or time zone", () => {
    for (const path of sources) {
      const source = readFileSync(join(root, path), "utf8");
      assert.ok(
        !/\.toLocale(?:Date|Time)?String\(/.test(source),
        `${path} must use formatDateTime() / formatTimestamp()`,
      );
    }
  });
});
