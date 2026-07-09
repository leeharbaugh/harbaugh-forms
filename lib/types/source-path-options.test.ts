import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeSourcePathOptions } from "./source-path-options.ts";

function canonicalizePhoneAlias(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const dotMatch = trimmed.match(/^([a-z0-9_]+)\.([a-z_]+)$/i);
  if (!dotMatch) {
    return trimmed;
  }

  const suffix = dotMatch[2] === "phone" ? "phone_primary" : dotMatch[2];
  return `${dotMatch[1]}.${suffix}`;
}

describe("dedupeSourcePathOptions", () => {
  it("keeps one option per canonical source path", () => {
    const options = dedupeSourcePathOptions(
      [
        {
          value: "buyer_1.phone",
          label: "Buyer 1 · Primary phone — (817) 555-0100",
        },
        {
          value: "buyer_1.phone_primary",
          label: "Buyer 1 · Primary phone — (817) 555-0100",
        },
        {
          value: "buyer_2.phone",
          label: "Buyer 2 · Primary phone — (817) 555-0100",
        },
        {
          value: "buyer_2.phone_primary",
          label: "Buyer 2 · Primary phone — (817) 555-0100",
        },
      ],
      {
        canonicalize: canonicalizePhoneAlias,
        preferValue: (values, canonicalValue) =>
          values.find((value) => value.toLowerCase() === canonicalValue) ??
          values[0],
      },
    );

    assert.equal(options.length, 2);
    assert.deepEqual(
      options.map((option) => option.value),
      ["buyer_1.phone_primary", "buyer_2.phone_primary"],
    );
  });

  it("disambiguates options that share a label but differ by path", () => {
    const options = dedupeSourcePathOptions([
      {
        value: "buyer_1.email",
        label: "Buyer 1 · Email — jane@example.com",
      },
      {
        value: "buyer_client_1.email",
        label: "Buyer 1 · Email — jane@example.com",
      },
    ]);

    assert.equal(options.length, 2);
    assert.ok(options.every((option) => option.label.includes(option.value)));
  });
});
