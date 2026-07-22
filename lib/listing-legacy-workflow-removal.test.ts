import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { workflowSupportsLegacyAgreement } from "./types/packet-workflow.ts";

const REMOVAL_MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722190000_remove_listing_legacy_workflow.sql",
);

const PRIOR_CONVERSION_MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722010000_remove_obsolete_listing_details_sources.sql",
);

const FIELD_SOURCE_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "field-source.ts",
);

const FIELD_RESOLVER_PATH = join(process.cwd(), "lib", "field-resolver.ts");
const PACKET_PATH = join(process.cwd(), "lib", "types", "packet.ts");
const WIZARD_PATH = join(
  process.cwd(),
  "components",
  "packets",
  "create-packet-wizard.tsx",
);

const DELETED_FIELD_IDS = [
  "377c4c42-432f-43fb-9aed-faaedf03d08a",
  "9978a3ec-8dac-4c36-bd7f-2969ee442fb4",
  "c96307ee-3fbb-4780-8dff-a56ee708ad47",
  "799f0606-ed3f-4a5d-a111-23dc22eda8f1",
  "1be66607-e27d-435a-b701-a5df8ad56aad",
  "78b92ae2-361d-4767-9381-f21504b84d72",
  "1c9cd33c-4632-474e-b39c-a7d5caac4774",
  "24863fb8-b429-4d34-9bdf-0780a82e031b",
] as const;

describe("listing legacy workflow removal migration", () => {
  const sql = readFileSync(REMOVAL_MIGRATION_PATH, "utf8");

  it("hard-deletes details row 1 and soft-deletes Listing agreement 2 and client links 3/4", () => {
    assert.match(sql, /delete from public\.listing_agreement_details/);
    assert.match(sql, /where id = 1/);
    assert.match(sql, /representation_agreement_id = 2/);
    assert.match(
      sql,
      /update public\.representation_agreement_clients[\s\S]*status = 'DELETED'[\s\S]*id in \(3, 4\)/,
    );
    assert.match(
      sql,
      /update public\.representation_agreements[\s\S]*status = 'DELETED'[\s\S]*id = 2/,
    );
  });

  it("refuses deletion when packets still reference Listing agreement 2", () => {
    assert.match(
      sql,
      /packet\(s\) still reference Listing agreement id=2/,
    );
  });

  it("does not use CASCADE when dropping the table", () => {
    assert.match(sql, /drop table public\.listing_agreement_details;/i);
    assert.doesNotMatch(
      sql,
      /drop table public\.listing_agreement_details cascade/i,
    );
  });

  it("normalizes the eight DELETED fields to manual_only", () => {
    for (const id of DELETED_FIELD_IDS) {
      assert.match(sql, new RegExp(id));
    }
    assert.match(sql, /source_type = 'manual_only'/);
    assert.match(sql, /status = 'DELETED'/);
  });

  it("removes listing_agreement_details from fields_source_type_check", () => {
    assert.match(sql, /drop constraint if exists fields_source_type_check/i);
    assert.doesNotMatch(
      sql,
      /array\[[^\]]*'listing_agreement_details'::text[^\]]*\]/s,
    );
  });

  it("preserves Buyer Rep agreement, details, and shared helpers", () => {
    assert.match(sql, /Buyer Rep agreement id=1/);
    assert.match(sql, /buyer_rep_details/);
    assert.match(sql, /set_update_date\(\)/);
    assert.match(sql, /validate_representation_agreement_detail\(\)/);
    assert.doesNotMatch(sql, /drop table public\.representation_agreements/i);
    assert.doesNotMatch(sql, /drop table public\.buyer_rep_details/i);
  });

  it("is rerun-safe when the table is already absent", () => {
    assert.match(sql, /to_regclass\('public\.listing_agreement_details'\) is null/);
    assert.match(sql, /return;/);
  });
});

describe("listing legacy source registry and routes removed", () => {
  it("rejects listing_agreement_details as a selectable source type", () => {
    const fieldSource = readFileSync(FIELD_SOURCE_PATH, "utf8");
    assert.doesNotMatch(
      fieldSource,
      /FIELD_SOURCE_TYPES = \[[^\]]*\"listing_agreement_details\"/s,
    );
    assert.doesNotMatch(fieldSource, /Listing agreement details/);
    assert.match(fieldSource, /\"manual_only\"/);
  });

  it("resolver no longer loads or dispatches listing_agreement_details", () => {
    const source = readFileSync(FIELD_RESOLVER_PATH, "utf8");
    assert.doesNotMatch(source, /listing_agreement_details/);
    assert.doesNotMatch(source, /listingAgreementDetails/);
    assert.doesNotMatch(source, /ListingAgreementDetailsRow/);
    assert.doesNotMatch(source, /listing-agreement-field-resolution/);
  });

  it("removes /listing-agreements route and Listing agreement modules", () => {
    assert.equal(existsSync(join(process.cwd(), "app", "listing-agreements")), false);
    assert.equal(
      existsSync(join(process.cwd(), "components", "listing-agreements")),
      false,
    );
    assert.equal(
      existsSync(join(process.cwd(), "lib", "types", "listing-agreement.ts")),
      false,
    );
    assert.equal(
      existsSync(
        join(process.cwd(), "lib", "types", "listing-agreement-field-resolution.ts"),
      ),
      false,
    );
  });

  it("keeps /representation-agreements route", () => {
    assert.equal(
      existsSync(join(process.cwd(), "app", "representation-agreements")),
      true,
    );
  });
});

describe("listing packet workflow cleanup", () => {
  it("legacy agreement path supports Buyer Rep only", () => {
    assert.equal(workflowSupportsLegacyAgreement("buyer_rep"), true);
    assert.equal(workflowSupportsLegacyAgreement("listing"), false);
    assert.equal(workflowSupportsLegacyAgreement("contract_offer"), false);
  });

  it("wizard no longer references /listing-agreements or ListingAgreement types", () => {
    const wizard = readFileSync(WIZARD_PATH, "utf8");
    assert.doesNotMatch(wizard, /listing-agreements/);
    assert.doesNotMatch(wizard, /ListingAgreement/);
    assert.doesNotMatch(wizard, /listing-agreement/);
    assert.match(wizard, /CreatePacketFromCollectionForm/);
  });

  it("generatePacketFromAgreement rejects non-Buyer-Rep agreements", () => {
    const packet = readFileSync(PACKET_PATH, "utf8");
    assert.match(
      packet,
      /Agreement-linked packet creation is only supported for Buyer Rep/,
    );
    assert.match(packet, /packet_type: \"buyer_rep\"/);
    assert.match(packet, /createPacketFromCollection/);
  });

  it("prior conversion migration still targets the 129 listing field IDs", () => {
    const prior = readFileSync(PRIOR_CONVERSION_MIGRATION_PATH, "utf8");
    assert.match(prior, /v_listing_expected constant integer := 129/);
  });
});
