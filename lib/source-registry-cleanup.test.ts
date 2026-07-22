import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722210000_remove_unused_source_registry_metadata.sql",
);

const FIELD_SOURCE_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "field-source.ts",
);

const FIELD_RESOLVER_PATH = join(process.cwd(), "lib", "field-resolver.ts");

const FORM_FIELDS_PATH = join(
  process.cwd(),
  "components",
  "forms",
  "field-source-form-fields.tsx",
);

const PROVENANCE_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "field-provenance-labels.ts",
);

const DEAD_CUSTOM_RESOLVER_FIELD_IDS = [
  "f8772cac-54e9-4853-b7c0-20d86434b332",
  "34c3d4b6-079e-457c-8118-69f6b40f6b9b",
  "eaae334b-8d18-4b44-aaaf-73ee4e6c507c",
  "5bbf798f-9d5a-44a4-9aa7-0a6ea33c5bd0",
  "29141220-19d5-433f-883a-abfdf8d787c9",
  "0325154f-411d-434b-af37-1ee80cd53b1f",
  "19ba5699-8cab-429a-ab7c-a9e4e4ec2856",
  "81916754-54fb-450a-8da9-ae33d382ff8f",
  "7a472bb1-abb5-47b7-a527-294e5b5688e1",
  "d75bea67-aafd-41d1-a199-d58e41c123ab",
  "0adad259-ceed-4473-b4d2-47286b2c8dc5",
  "e705f9a5-cfa0-4fc8-bcac-2bc5a2d1ca5e",
  "443943cf-952f-44a0-bbb9-3dfb1c1be49e",
  "9e90a258-9ef7-42e1-a6ab-0711767fcc90",
  "1dd783c8-2768-435e-ab80-b7f7a56ffea1",
  "b9510242-b0e3-4bb3-831f-19f9fd0b9930",
  "ef8a543e-e67e-4969-95bf-9df7237e5240",
  "a03de7f8-f01b-4e89-b9ae-3fbc6c3266a4",
  "8b50ca83-a96e-4442-bf14-0a5e98ad0c17",
  "d22ccd04-7ca5-42b3-a78d-5f39c9057e08",
  "a08396db-07e8-4530-9004-fbcbf22ab18c",
  "a5b6a0a8-742a-41da-bbe0-9dd9c1b67dab",
  "503cba15-0ebe-44bd-8930-1903e6391d1f",
  "520b9560-8d85-4b60-98d6-fb51e57f0a5a",
  "66a333e7-141f-4bd4-b1d4-09cc98e787a7",
  "8f05a14b-987c-4676-9445-85bc2d46ce46",
  "b32cc3d8-3c5b-44ff-94b7-f93421d04714",
  "423a46ba-dd6c-4c72-80b6-9a9d02e102d6",
  "f7698db2-eec3-4524-9a08-45d2a48d50c0",
  "e9bab993-e068-49c9-bb94-fff9d960fedc",
  "a99e6f92-9a89-42ad-8cb0-f0af5fa46c52",
  "de6a83d3-c741-472a-b8de-9792af30d9b9",
  "bcd40956-2741-4034-a75d-dccb5a667ac7",
  "5bf1a2b5-5895-4ed3-8c45-2a01492ccc8a",
  "01994cf2-7155-488d-bfbd-dfedc1205011",
  "a86558af-500b-444f-84f4-c6996607dc26",
  "9168a44c-c67c-4433-acbe-6cdf1962d5d8",
  "61defa71-372d-45ec-8635-51a7c88a3f22",
  "50d1fa9a-7e0c-4ad0-b563-73faf79e5859",
  "4d5fe84d-93c9-4e79-b17f-01dc1d813b03",
  "ad2fa315-15bb-46f2-ab5a-0293aea21e29",
  "cfb7f9b4-0095-4e39-85b3-593715922486",
  "731ea151-77d8-429a-9ca7-99d7d318f37c",
  "09134ee6-6927-492b-9600-11c876db364b",
  "6b65f1b8-8760-4b12-91e1-29f5fc4ea468",
  "31c5ee23-9ef0-487a-8ac2-ecda5bfda64b",
  "09fa7f77-4271-4c66-aae4-5ad47a27592a",
  "bbc04795-ad10-4d12-ba4b-4adf6e2eebcf",
  "7f702a06-6e6a-47f9-aa0c-348c05e8862c",
  "b1fe245b-392a-4602-972e-00a3e1c375de",
  "c212f8d3-fe1f-49cb-b50d-7ca25d285c54",
  "c7caa01e-3e92-446b-9d82-e1a9be0fb801",
  "e8adaba4-753c-4e33-81a8-9ef9b5dc2a23",
] as const;

const RETAINED_RESOLVER_KEYS = [
  "property_hoa_name",
  "property_hoa_phone",
  "buyer_names",
  "buyer_notice_phone",
  "buyer_notice_email",
  "buyer_client_address",
  "buyer_client_city_state_zip",
  "seller_city_state_zip",
  "landlord_address",
  "landlord_city_state_zip",
  "brokerage_city_state_zip",
  "buyer_rep_agreement_between",
  "buyer_rep_retainer_will_not_apply",
  "buyer_rep_intermediary_status_no",
] as const;

const REMOVED_RESOLVER_KEYS = [
  "agent_full_name",
  "broker_full_name",
  "property_address_city",
  "property_address_street_zip",
  "seller_names",
  "buyer_notice_address",
  "seller_notice_address",
  "seller_notice_phone",
  "seller_notice_email",
] as const;

describe("source registry cleanup migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("targets exactly 53 dead custom_resolver field IDs", () => {
    assert.equal(DEAD_CUSTOM_RESOLVER_FIELD_IDS.length, 53);
    for (const id of DEAD_CUSTOM_RESOLVER_FIELD_IDS) {
      assert.match(sql, new RegExp(id));
    }
  });

  it("converts dead custom_resolver fields to manual_only without CASCADE", () => {
    assert.match(sql, /source_type = 'manual_only'/);
    assert.match(sql, /resolver_key = null/);
    assert.doesNotMatch(sql, /drop\s+.*\s+cascade/i);
  });

  it("repairs PROPERTY_ADDRESS to packet_property full_address", () => {
    assert.match(sql, /27e50ce0-130e-4640-89d1-0e468e18434e/);
    assert.match(sql, /source_path = 'full_address'/);
  });

  it("soft-deletes contract_* field_resolvers and clears FKs", () => {
    assert.match(sql, /resolver_key like 'contract_%'/);
    assert.match(sql, /status = 'DELETED'/);
    assert.match(sql, /field_resolver_id = null/);
  });

  it("shrinks fields_source_type_check without packet or static_default", () => {
    assert.match(sql, /fields_source_type_check/);
    assert.match(sql, /'buyer_rep_details'::text/);
    assert.match(sql, /'packet_instance'::text/);
    const constraintBlock = sql.slice(
      sql.indexOf("add constraint fields_source_type_check"),
    );
    assert.doesNotMatch(
      constraintBlock.slice(0, 800),
      /'packet'::text|'static_default'::text/,
    );
  });
});

describe("source registry application cleanup", () => {
  const fieldSource = readFileSync(FIELD_SOURCE_PATH, "utf8");
  const resolver = readFileSync(FIELD_RESOLVER_PATH, "utf8");
  const formFields = readFileSync(FORM_FIELDS_PATH, "utf8");
  const provenance = readFileSync(PROVENANCE_PATH, "utf8");

  it("removes packet and static_default from selectable source types", () => {
    assert.doesNotMatch(
      fieldSource,
      /FIELD_SOURCE_TYPES = \[[^\]]*\"packet\"/s,
    );
    assert.doesNotMatch(
      fieldSource,
      /FIELD_SOURCE_TYPES = \[[^\]]*\"static_default\"/s,
    );
    assert.doesNotMatch(fieldSource, /PACKET_SOURCE_PATHS/);
    assert.doesNotMatch(fieldSource, /STATIC_DEFAULT_SOURCE_PATHS/);
    assert.doesNotMatch(formFields, /static_default/);
  });

  it("retains live custom resolver keys and drops unused registry keys", () => {
    for (const key of RETAINED_RESOLVER_KEYS) {
      assert.match(
        fieldSource,
        new RegExp(`CUSTOM_RESOLVER_KEYS = \\[[^\\]]*\"${key}\"`, "s"),
      );
    }
    for (const key of REMOVED_RESOLVER_KEYS) {
      assert.doesNotMatch(
        fieldSource,
        new RegExp(`CUSTOM_RESOLVER_KEYS = \\[[^\\]]*\"${key}\"`, "s"),
      );
    }
  });

  it("resolver no longer dispatches packet or static_default source types", () => {
    assert.doesNotMatch(resolver, /case \"packet\":/);
    assert.doesNotMatch(resolver, /case \"static_default\":/);
    assert.doesNotMatch(resolver, /resolvePacketMetadataSourcePath/);
    assert.doesNotMatch(resolver, /resolveStaticDefaultSource/);
  });

  it("keeps provenance display for historical instance source=packet", () => {
    assert.match(provenance, /case \"packet\":/);
    assert.match(provenance, /From packet/);
  });

  it("retains Buyer Rep and settings source types", () => {
    assert.match(
      fieldSource,
      /FIELD_SOURCE_TYPES = \[[^\]]*\"buyer_rep_details\"/s,
    );
    assert.match(
      fieldSource,
      /FIELD_SOURCE_TYPES = \[[^\]]*\"representation_agreement\"/s,
    );
    assert.match(
      fieldSource,
      /FIELD_SOURCE_TYPES = \[[^\]]*\"settings_brokerage\"/s,
    );
  });
});
