import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildPropertyHoaWritePayload,
  extractPropertyHoaFormFields,
  propertyHoaFormFieldsFromRow,
  pickPrimaryPropertyHoa,
  resolvePropertyHoaFieldValue,
  type PropertyHoa,
} from "./types/property-hoa.ts";
import {
  fieldInstanceSyncWouldWrite,
  planFieldInstanceSyncMutations,
} from "./field-instance-sync.ts";

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722120000_consolidate_property_hoa_storage.sql",
);
const PROPERTY_TYPES_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "property.ts",
);
const PACKET_PROPERTY_PATHS_PATH = join(
  process.cwd(),
  "lib",
  "types",
  "packet-property-source-paths.ts",
);

const HOA_ASSOCIATION_NAME_FIELD_ID =
  "20392b1b-ef65-4eef-a664-1a0bf49d16fe";
const TXR_2001_HOA_NAME_FIELD_ID = "70acefff-d8fe-495b-96c4-3d675b900911";

function makeHoa(overrides: Partial<PropertyHoa> & Pick<PropertyHoa, "id">): PropertyHoa {
  return {
    create_date: "2026-01-01T00:00:00.000Z",
    update_date: "2026-01-01T00:00:00.000Z",
    status: "ACTIVE",
    property_id: 1,
    hoa_name: "Primary HOA",
    hoa_phone: null,
    management_company_name: null,
    management_company_phone: null,
    management_company_email: null,
    notes: null,
    ...overrides,
  };
}

describe("property HOA storage helpers", () => {
  it("creates no write payload when HOA name is blank", () => {
    assert.equal(
      buildPropertyHoaWritePayload({
        hoa_name: "   ",
        hoa_phone: "(817) 555-0100",
        hoa_management_company: "Example Mgmt",
      }),
      null,
    );
  });

  it("builds an insert/update payload with management company on the HOA row", () => {
    assert.deepEqual(
      buildPropertyHoaWritePayload({
        hoa_name: " Example Estates ",
        hoa_phone: " (817) 555-0100 ",
        hoa_management_company: " Example Mgmt ",
      }),
      {
        hoa_name: "Example Estates",
        hoa_phone: "(817) 555-0100",
        management_company_name: "Example Mgmt",
      },
    );
  });

  it("clears optional HOA values to null while keeping the name", () => {
    assert.deepEqual(
      buildPropertyHoaWritePayload({
        hoa_name: "Example Estates",
        hoa_phone: "  ",
        hoa_management_company: "",
      }),
      {
        hoa_name: "Example Estates",
        hoa_phone: null,
        management_company_name: null,
      },
    );
  });

  it("maps the first ACTIVE property_hoas row into Property form fields", () => {
    const fields = propertyHoaFormFieldsFromRow(
      makeHoa({
        id: 7,
        hoa_name: "Oak Bend HOA",
        hoa_phone: "2145551212",
        management_company_name: "Oak Mgmt",
      }),
    );

    assert.deepEqual(fields, {
      hoa_name: "Oak Bend HOA",
      hoa_phone: "2145551212",
      hoa_management_company: "Oak Mgmt",
    });
  });

  it("extracts HOA form fields from PropertyInput-shaped objects", () => {
    assert.deepEqual(
      extractPropertyHoaFormFields({
        hoa_name: "Name",
        hoa_phone: "Phone",
        hoa_management_company: "Mgmt",
      }),
      {
        hoa_name: "Name",
        hoa_phone: "Phone",
        hoa_management_company: "Mgmt",
      },
    );
  });
});

describe("Property normalize / toInput HOA split", () => {
  const propertyTypesSource = readFileSync(PROPERTY_TYPES_PATH, "utf8");

  it("does not persist retired HOA columns on properties payloads", () => {
    assert.match(
      propertyTypesSource,
      /\/\/ HOA name\/phone\/management company persist on property_hoas/,
    );
    assert.doesNotMatch(
      propertyTypesSource,
      /hoa_name: trim\(input\.hoa_name\)/,
    );
    assert.doesNotMatch(
      propertyTypesSource,
      /hoa_phone: trim\(input\.hoa_phone\)/,
    );
    assert.doesNotMatch(
      propertyTypesSource,
      /hoa_management_company: trim\(input\.hoa_management_company\)/,
    );
    assert.match(
      propertyTypesSource,
      /hoa_contact_name: trim\(input\.hoa_contact_name\)/,
    );
  });

  it("loads HOA form fields from the primary property_hoas row overlay", () => {
    assert.match(
      propertyTypesSource,
      /hoa_name: optionalString\(primaryHoa\?\.hoa_name\)/,
    );
    assert.match(
      propertyTypesSource,
      /hoa_management_company: optionalString\(primaryHoa\?\.management_company_name\)/,
    );
    assert.match(
      propertyTypesSource,
      /hoa_phone: optionalString\(primaryHoa\?\.hoa_phone\)/,
    );
  });
});

describe("property_hoa resolver ordering and soft-delete", () => {
  it("picks the first ACTIVE row by create_date then id", () => {
    const primary = pickPrimaryPropertyHoa([
      makeHoa({
        id: 2,
        create_date: "2026-02-01T00:00:00.000Z",
        hoa_name: "Second",
      }),
      makeHoa({
        id: 1,
        create_date: "2026-01-01T00:00:00.000Z",
        hoa_name: "First",
        hoa_phone: "111",
      }),
      makeHoa({
        id: 3,
        create_date: "2026-01-01T00:00:00.000Z",
        hoa_name: "Also First Day",
      }),
    ]);

    assert.equal(primary?.id, 1);
    assert.equal(
      resolvePropertyHoaFieldValue("property_hoa_name", primary),
      "First",
    );
    assert.equal(
      resolvePropertyHoaFieldValue("property_hoa_phone", primary),
      "111",
    );
  });

  it("ignores missing primary HOA rows", () => {
    assert.equal(resolvePropertyHoaFieldValue("property_hoa_name", null), "");
    assert.equal(pickPrimaryPropertyHoa([]), null);
  });
});

describe("retired properties HOA packet_property paths", () => {
  const packetPathsSource = readFileSync(PACKET_PROPERTY_PATHS_PATH, "utf8");

  it("removes retired HOA columns from direct packet_property paths", () => {
    assert.doesNotMatch(
      packetPathsSource,
      /PACKET_PROPERTY_DIRECT_SOURCE_PATHS = \[[^\]]*\"hoa_name\"/s,
    );
    assert.doesNotMatch(packetPathsSource, /\"hoa_phone\",/);
    assert.doesNotMatch(packetPathsSource, /\"hoa_management_company\",/);
    assert.match(packetPathsSource, /\"has_hoa\",/);
    assert.match(packetPathsSource, /\"hoa_contact_name\",/);
  });
});

describe("HOA consolidation migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("drops only the three proven-redundant properties columns", () => {
    assert.match(sql, /drop column if exists hoa_name/i);
    assert.match(sql, /drop column if exists hoa_phone/i);
    assert.match(sql, /drop column if exists hoa_management_company/i);
    assert.match(sql, /has_hoa/);
    assert.match(sql, /hoa_contact_name/);
    assert.doesNotMatch(sql, /drop column if exists has_hoa/i);
    assert.doesNotMatch(sql, /drop table .*property_hoas/i);
  });

  it("redirects the two ACTIVE hoa_name packet_property fields to property_hoa_name", () => {
    assert.match(sql, new RegExp(HOA_ASSOCIATION_NAME_FIELD_ID));
    assert.match(sql, new RegExp(TXR_2001_HOA_NAME_FIELD_ID));
    assert.match(sql, /resolver_key = 'property_hoa_name'/);
    assert.match(sql, /source_type = 'custom_resolver'/);
  });

  it("asserts property_hoas indexes and RLS policies remain intact", () => {
    assert.match(sql, /property_hoas_property_hoa_name_active_uidx/);
    assert.match(sql, /property_hoas_select/);
    assert.match(sql, /property_hoas_insert/);
    assert.match(sql, /property_hoas_update/);
    assert.match(sql, /does not backfill/i);
  });
});

describe("packet snapshot safety for HOA source redirect", () => {
  it("ordinary open (ensure_missing) does not rewrite existing HOA instances", () => {
    const existing = new Map([
      [
        HOA_ASSOCIATION_NAME_FIELD_ID,
        {
          id: "inst-hoa-name",
          field_id: HOA_ASSOCIATION_NAME_FIELD_ID,
          value: "Historical HOA Name",
          value_json: null,
          source: "property",
          is_override: false,
        },
      ],
    ]);

    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [...existing.keys()],
      existingByFieldId: existing,
      resolveForFieldId: () => {
        throw new Error(
          "ordinary open must not re-resolve fields with existing instances",
        );
      },
    });

    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.updates.length, 0);
    assert.equal(fieldInstanceSyncWouldWrite(plan), false);
  });

  it("future eligible inserts may resolve from property_hoas via property source", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [HOA_ASSOCIATION_NAME_FIELD_ID],
      existingByFieldId: new Map(),
      resolveForFieldId: () => ({
        value: "Oak Bend HOA",
        value_json: null,
        source: "property",
      }),
    });

    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0].resolved.source, "property");
    assert.equal(plan.inserts[0].resolved.value, "Oak Bend HOA");
  });
});

describe("owner isolation contract", () => {
  it("documents that property_hoas writes inherit ownership through property_id RLS", () => {
    const storageSource = readFileSync(
      join(process.cwd(), "lib", "property-hoa-storage.ts"),
      "utf8",
    );
    const rlsSource = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260713230000_phase_c_database_rls.sql",
      ),
      "utf8",
    );

    assert.match(storageSource, /property_id: propertyId/);
    assert.match(storageSource, /status: \"DELETED\"/);
    assert.match(rlsSource, /property_hoas_insert/);
    assert.match(rlsSource, /owns_property\(property_id\)/);
    assert.match(rlsSource, /property_hoas_update/);
    assert.doesNotMatch(rlsSource, /create policy \"property_hoas_delete\"/i);
  });
});
