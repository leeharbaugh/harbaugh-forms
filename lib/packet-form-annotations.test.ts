import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  defaultTypedSignatureSize,
  validatePacketFormAnnotationInput,
} from "./types/packet-form-annotation.ts";

describe("packet form typed signature annotations", () => {
  it("validates typed signature input", () => {
    assert.equal(
      validatePacketFormAnnotationInput({
        page_number: 1,
        annotation_type: "typed_signature",
        text_value: "Lee Agent",
        x: 10,
        y: 10,
        width: 100,
        height: 30,
      }),
      null,
    );
    assert.match(
      validatePacketFormAnnotationInput({
        page_number: 0,
        annotation_type: "typed_signature",
        text_value: "Lee",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }) ?? "",
      /page/i,
    );
    assert.match(
      validatePacketFormAnnotationInput({
        page_number: 1,
        annotation_type: "typed_signature",
        text_value: "   ",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }) ?? "",
      /required/i,
    );
    assert.match(
      validatePacketFormAnnotationInput({
        page_number: 1,
        annotation_type: "typed_signature",
        text_value: "Lee",
        x: Number.NaN,
        y: 0,
        width: 10,
        height: 10,
      }) ?? "",
      /coordinate/i,
    );
    assert.match(
      validatePacketFormAnnotationInput({
        page_number: 1,
        annotation_type: "highlight" as never,
        text_value: "nope",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }) ?? "",
      /unsupported/i,
    );
  });

  it("sizes typed signatures from text length", () => {
    const short = defaultTypedSignatureSize("Ab");
    const long = defaultTypedSignatureSize("Kenneth Lee Harbaugh");
    assert.ok(long.width >= short.width);
    assert.equal(short.height, 36);
  });

  it("uses a dedicated annotations table migration with RLS", () => {
    const migration = readFileSync(
      "supabase/migrations/20260805220000_fill_form_presentation_and_annotations.sql",
      "utf8",
    );
    assert.match(migration, /packet_form_annotations/);
    assert.match(migration, /typed_signature/);
    assert.match(migration, /mask_background/);
    assert.match(migration, /is_multiline/);
    assert.match(migration, /packet_form_annotations_select/);
    assert.match(migration, /owns_packet/);
    assert.match(migration, /'DELETED'/);
    assert.match(migration, /created_by_user_id = auth\.uid\(\)/);
    assert.match(migration, /pf\.packet_id = packet_form_annotations\.packet_id/);
    assert.doesNotMatch(migration, /on delete cascade/i);
    assert.match(migration, /default false/);
    assert.match(
      readFileSync("lib/packet-form-annotations.ts", "utf8"),
      /status:\s*"DELETED"/,
    );
    assert.match(
      readFileSync("lib/packet-form-annotations.ts", "utf8"),
      /\.eq\("status", "ACTIVE"\)/,
    );
  });

  it("enforces authoritative created_by via forward migration trigger", () => {
    const hardening = readFileSync(
      "supabase/migrations/20260805230000_packet_form_annotations_created_by_immutable.sql",
      "utf8",
    );
    assert.match(hardening, /packet_form_annotations_enforce_created_by/);
    assert.match(hardening, /new\.created_by_user_id := auth\.uid\(\)/);
    assert.match(hardening, /new\.created_by_user_id := old\.created_by_user_id/);
    assert.match(hardening, /created_by_user_id = auth\.uid\(\)/);
    assert.match(hardening, /INVOKER \+ search_path=public; not SECURITY DEFINER/);
    assert.doesNotMatch(
      hardening,
      /returns trigger\s+language plpgsql\s+security definer/i,
    );
    assert.match(hardening, /set search_path = public/);
    const app = readFileSync("lib/packet-form-annotations.ts", "utf8");
    assert.match(app, /trigger replaces it/i);
    assert.match(app, /Never include created_by_user_id/);
  });

  it("keeps browser font loader free of node:fs", () => {
    const browserFont = readFileSync("lib/signature-font.ts", "utf8");
    const serverFont = readFileSync("lib/signature-font-server.ts", "utf8");
    const download = readFileSync("lib/packet-form-download.ts", "utf8");
    assert.doesNotMatch(browserFont, /node:fs/);
    assert.match(serverFont, /node:fs\/promises/);
    assert.match(serverFont, /NEVER import this module from Client/);
    assert.match(download, /signature-font"/);
    assert.doesNotMatch(download, /signature-font-server/);
  });

  it("registers fontkit before embedding Caveat", () => {
    const fill = readFileSync("lib/fill-packet-form-pdf.ts", "utf8");
    assert.match(fill, /@pdf-lib\/fontkit/);
    assert.match(fill, /registerFontkit/);
  });

  it("keeps annotations out of field_instances / Authentisign paths", () => {
    const fill = readFileSync("lib/fill-packet-form-pdf.ts", "utf8");
    const overlay = readFileSync(
      "components/packets/packet-form-annotation-overlay.tsx",
      "utf8",
    );
    assert.match(fill, /annotations/);
    assert.match(overlay, /not Authentisign/i);
    assert.doesNotMatch(fill, /authentisign/i);
  });

  it("includes forward date_signed type migration", () => {
    const migration = readFileSync(
      "supabase/migrations/20260806150000_packet_form_annotations_date_signed.sql",
      "utf8",
    );
    assert.match(migration, /date_signed/);
    assert.match(migration, /typed_signature/);
  });
});
