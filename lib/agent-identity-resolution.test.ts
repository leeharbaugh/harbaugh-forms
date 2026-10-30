import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type FieldResolverContext,
  isAgentIdentityField,
  loadFieldResolverContext,
  resolveFieldValueFromContext,
  resolvePacketFormFieldValues,
} from "./field-resolver";
import { planFieldInstanceSyncMutations } from "./field-instance-sync";
import { fillPacketFormPdfBytes } from "./fill-packet-form-pdf";
import {
  agentInputToUserAgentSettingsColumns,
  resolveUserAgentSettingsField,
  saveCurrentUserAgentProfile,
} from "./user-agent-profile";
import {
  type AgentProfileInput,
  type BrokerageSettings,
  resolveBrokerageSettingsField,
} from "./types/brokerage-settings";
import type { Field } from "./types/field";
import type { FieldDefault } from "./types/field-default";
import type { FieldInstanceWithField } from "./types/field-instance";
import type { FormFieldMapping } from "./types/form-field-mapping";
import { buildPacketFormFieldViews } from "./types/packet-form-editor";
import type { UserAgentSettings } from "./types/user-agent-settings";

// Fictional agents in one brokerage. The shared row still carries the legacy
// agent_* copy of agent A, exactly like production before the fix.
const ORG_ID = "org-shared-brokerage";
const AGENT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const AGENT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const VIEWER_ADMIN = "cccccccc-0000-4000-8000-00000000000c";

function agentProfile(
  userId: string,
  overrides: Partial<UserAgentSettings> = {},
): UserAgentSettings {
  return {
    user_id: userId,
    create_date: "2026-10-01T00:00:00Z",
    update_date: "2026-10-01T00:00:00Z",
    status: "ACTIVE",
    legal_first_name: null,
    legal_middle_name: null,
    legal_last_name: null,
    preferred_name: null,
    display_name: null,
    email: null,
    phone: null,
    phone_alternate: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    state: "TX",
    zip: null,
    trec_license_number: null,
    title: null,
    ...overrides,
  };
}

const PROFILE_A = agentProfile(AGENT_A, {
  legal_first_name: "Avery",
  legal_middle_name: "Q",
  legal_last_name: "Stone",
  trec_license_number: "0111111",
  email: "avery@example.test",
  phone: "817-555-0101",
  address_line_1: "1 First St",
  address_line_2: "Suite 100",
  city: "Arlington",
  zip: "76010",
});

const PROFILE_B = agentProfile(AGENT_B, {
  legal_first_name: "Jordan",
  legal_last_name: "Reyes",
  trec_license_number: "0222222",
  email: "jordan@example.test",
  phone: "817-555-0202",
});

const SHARED_BROKERAGE = {
  id: 1,
  create_date: "2026-01-01T00:00:00Z",
  update_date: "2026-01-01T00:00:00Z",
  status: "ACTIVE",
  organization_id: ORG_ID,
  agent_first_name: "Avery",
  agent_middle_name: "Q",
  agent_last_name: "Stone",
  agent_license_number: "0111111",
  agent_phone: "817-555-0101",
  agent_email: "avery@example.test",
  agent_address: "1 First St",
  agent_city: "Arlington",
  agent_state: "TX",
  agent_zip: "76010",
  brokerage_name: "Example Realty",
  brokerage_address: "500 Main St",
  brokerage_city: "Mansfield",
  brokerage_state: "TX",
  brokerage_zip: "76063",
  brokerage_office_phone: "817-555-0100",
  brokerage_license_number: "9000000",
  brokerage_email: "office@example.test",
  broker_first_name: "Dana",
  broker_middle_name: null,
  broker_last_name: "Broker",
  broker_license_number: "0333333",
  broker_phone: "817-555-0300",
  broker_email: "broker@example.test",
  supervisor_name: null,
  supervisor_license_number: null,
  supervisor_phone: null,
  supervisor_email: null,
} as BrokerageSettings;

let fieldCounter = 0;
function field(overrides: Partial<Field>): Field {
  fieldCounter += 1;
  return {
    id: `field-${fieldCounter}`,
    field_key: `field_${fieldCounter}`,
    field_name: null,
    field_label: null,
    field_data_type: "text",
    field_widget_type: "text",
    default_value: null,
    default_checked: null,
    required: false,
    notes: null,
    source_type: null,
    source_path: null,
    resolver_key: null,
    fallback_value: null,
    field_resolver_id: null,
    create_date: "2026-01-01T00:00:00Z",
    update_date: "2026-01-01T00:00:00Z",
    status: "ACTIVE",
    scope: "GLOBAL",
    owner_user_id: null,
    organization_id: null,
    ...overrides,
  } as Field;
}

const agentField = (key: string, path: string) =>
  field({ field_key: key, source_type: "settings_agent", source_path: path });

const AGENT_FIELDS = {
  name: agentField("AGENT_NAME", "agent_full_name"),
  license: agentField("AGENT_LICENSE_NUMBER", "agent_license_number"),
  email: agentField("CONTRACT_BUYER_AGENT_NOTICE_EMAIL", "agent_email"),
  phone: agentField("AGENT_PHONE", "agent_phone"),
  address: agentField("AGENT_ADDRESS", "agent_address"),
};

const BROKERAGE_FIELDS = {
  name: field({ field_key: "BROKERAGE_NAME", source_type: "settings_brokerage", source_path: "brokerage_name" }),
  broker: field({ field_key: "BROKER_NAME", source_type: "settings_brokerage", source_path: "broker_full_name" }),
  license: field({ field_key: "BROKERAGE_LICENSE", source_type: "settings_brokerage", source_path: "brokerage_license_number" }),
  cityStateZip: field({ field_key: "BROKERAGE_CSZ", source_type: "custom_resolver", resolver_key: "brokerage_city_state_zip" }),
};

function contextFor(
  ownerUserId: string,
  profile: UserAgentSettings | null,
  overrides: Partial<FieldResolverContext> = {},
): FieldResolverContext {
  return {
    packetId: 1,
    packetFormId: 1,
    actingUserId: ownerUserId,
    actingOrganizationId: ORG_ID,
    formId: 5,
    scopedDefaults: { privateDefaults: [], organizationDefaults: [] },
    packet: {
      id: 1,
      owner_user_id: ownerUserId,
      property_id: null,
      label: "Packet",
      packet_type: "custom",
      create_date: "2026-10-01T00:00:00Z",
      representation_agreement_id: null,
      properties: null,
    },
    packetContacts: [],
    fallbackSellersAsLandlords: false,
    settings: SHARED_BROKERAGE,
    agentProfile: profile,
    representationAgreement: null,
    buyerRepDetails: null,
    propertyHoas: [],
    ...overrides,
  } as FieldResolverContext;
}

const resolve = (f: Field, context: FieldResolverContext) =>
  resolveFieldValueFromContext({ field: f, context, existingInstance: null });

// ---------------------------------------------------------------------------
// Recording fake of the Supabase query builder.
// ---------------------------------------------------------------------------
type Filter = { op: string; column: string; value: unknown };
type Call = {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  filters: Filter[];
  payload?: unknown;
};
type Handler = (call: Call) => unknown;

function filterValue(call: Call, column: string): unknown {
  return call.filters.find((f) => f.op === "eq" && f.column === column)?.value;
}

function fakeSupabase(options: {
  authUserId: string | null;
  tables: Record<string, Handler>;
}) {
  const calls: Call[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.authUserId ? { id: options.authUserId } : null },
        error: null,
      }),
    },
    from(table: string) {
      const call: Call = { table, action: "select", filters: [] };
      const run = () => {
        calls.push(call);
        const data = options.tables[table]?.(call) ?? null;
        return { data, error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (payload: unknown) => ((call.action = "insert"), (call.payload = payload), builder),
        update: (payload: unknown) => ((call.action = "update"), (call.payload = payload), builder),
        upsert: (payload: unknown) => ((call.action = "upsert"), (call.payload = payload), builder),
        eq: (column: string, value: unknown) => (call.filters.push({ op: "eq", column, value }), builder),
        neq: (column: string, value: unknown) => (call.filters.push({ op: "neq", column, value }), builder),
        in: (column: string, value: unknown) => (call.filters.push({ op: "in", column, value }), builder),
        is: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const result = run();
          return { ...result, data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data };
        },
        single: async () => {
          const result = run();
          return { ...result, data: Array.isArray(result.data) ? result.data[0] : result.data };
        },
        then: (resolveFn: (value: unknown) => void) => resolveFn(run()),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const writes = (calls: Call[]) => calls.filter((c) => c.action !== "select");

// ---------------------------------------------------------------------------

describe("1. Two agents in the same brokerage resolve their own identity", () => {
  it("agent A and agent B get different agent values on the same forms", () => {
    const a = contextFor(AGENT_A, PROFILE_A);
    const b = contextFor(AGENT_B, PROFILE_B);

    assert.equal(resolve(AGENT_FIELDS.name, a).value, "Avery Q Stone");
    assert.equal(resolve(AGENT_FIELDS.license, a).value, "0111111");
    assert.equal(resolve(AGENT_FIELDS.email, a).value, "avery@example.test");
    assert.equal(resolve(AGENT_FIELDS.phone, a).value, "817-555-0101");
    assert.equal(resolve(AGENT_FIELDS.address, a).value, "1 First St, Suite 100");

    assert.equal(resolve(AGENT_FIELDS.name, b).value, "Jordan Reyes");
    assert.equal(resolve(AGENT_FIELDS.license, b).value, "0222222");
    assert.equal(resolve(AGENT_FIELDS.email, b).value, "jordan@example.test");
    assert.equal(resolve(AGENT_FIELDS.phone, b).value, "817-555-0202");
  });

  it("key-only agent fields (no source_type) also use the owner's own profile", () => {
    const keyOnly = field({ field_key: "agent_full_name" });
    assert.equal(resolve(keyOnly, contextFor(AGENT_B, PROFILE_B)).value, "Jordan Reyes");
    assert.equal(resolve(keyOnly, contextFor(AGENT_A, PROFILE_A)).value, "Avery Q Stone");
  });

  it("maps every agent_* source path to an explicit user_agent_settings column", () => {
    const expected: Record<string, string | null> = {
      agent_first_name: "Avery",
      agent_middle_name: "Q",
      agent_last_name: "Stone",
      agent_full_name: "Avery Q Stone",
      agent_license_number: "0111111",
      agent_phone: "817-555-0101",
      agent_email: "avery@example.test",
      agent_address: "1 First St, Suite 100",
      agent_city: "Arlington",
      agent_state: "TX",
      agent_zip: "76010",
      agent_initials: null,
    };
    for (const [path, value] of Object.entries(expected)) {
      assert.equal(resolveUserAgentSettingsField(PROFILE_A, path), value, path);
    }
  });
});

describe("2. Brokerage information stays shared", () => {
  it("both agents resolve identical brokerage and broker values", () => {
    const a = contextFor(AGENT_A, PROFILE_A);
    const b = contextFor(AGENT_B, PROFILE_B);
    for (const f of Object.values(BROKERAGE_FIELDS)) {
      const valueA = resolve(f, a).value;
      assert.notEqual(valueA, "", f.field_key);
      assert.equal(resolve(f, b).value, valueA, f.field_key);
    }
    assert.equal(resolve(BROKERAGE_FIELDS.broker, b).value, "Dana Broker");
    assert.equal(resolve(BROKERAGE_FIELDS.cityStateZip, b).value.includes("Mansfield"), true);
  });

  it("the shared row can no longer supply agent_* identity at all", () => {
    for (const path of ["agent_full_name", "agent_license_number", "agent_email", "agent_phone"]) {
      assert.equal(resolveBrokerageSettingsField(SHARED_BROKERAGE, path), null, path);
    }
    const misfiled = field({ field_key: "X", source_type: "settings_brokerage", source_path: "agent_license_number" });
    assert.equal(resolve(misfiled, contextFor(AGENT_B, PROFILE_B)).value, "0222222");
    assert.equal(isAgentIdentityField(misfiled), true);
  });
});

describe("3. Resolution follows the packet owner, never the viewer", () => {
  it("an admin viewing agent B's packet loads agent B's profile", async () => {
    const profiles: Record<string, UserAgentSettings> = {
      [AGENT_A]: PROFILE_A,
      [AGENT_B]: PROFILE_B,
      [VIEWER_ADMIN]: agentProfile(VIEWER_ADMIN, { legal_first_name: "Admin", legal_last_name: "Viewer" }),
    };
    const { client, calls } = fakeSupabase({
      authUserId: VIEWER_ADMIN,
      tables: {
        packets: () => ({
          id: 13,
          owner_user_id: AGENT_B,
          property_id: null,
          label: "B packet",
          packet_type: "custom",
          create_date: "2026-08-21T00:00:00Z",
          representation_agreement_id: null,
          properties: null,
          collections: null,
          representation_agreements: null,
          packet_contacts: [],
          packet_forms: [],
        }),
        profiles: (call) => ({ primary_organization_id: filterValue(call, "id") === AGENT_B ? ORG_ID : "viewer-org" }),
        organization_members: () => ({ id: "membership" }),
        brokerage_settings: (call) => (filterValue(call, "organization_id") === ORG_ID ? SHARED_BROKERAGE : null),
        user_agent_settings: (call) => profiles[filterValue(call, "user_id") as string] ?? null,
      },
    });

    const context = await loadFieldResolverContext(client, 13);

    assert.equal(context.actingUserId, AGENT_B);
    assert.equal(context.agentProfile?.user_id, AGENT_B);
    const profileLookups = calls.filter((c) => c.table === "user_agent_settings");
    assert.deepEqual(profileLookups.map((c) => filterValue(c, "user_id")), [AGENT_B]);
    assert.equal(filterValue(profileLookups[0], "status"), "ACTIVE");
    assert.equal(resolve(AGENT_FIELDS.license, context).value, "0222222");
    assert.equal(resolve(BROKERAGE_FIELDS.name, context).value, "Example Realty");
    assert.equal(writes(calls).length, 0);
  });
});

describe("4. Missing personal fields never inherit another agent's values", () => {
  it("blank personal columns stay blank instead of using the shared row", () => {
    const partial = agentProfile(AGENT_B, { legal_first_name: "Jordan", legal_last_name: "Reyes" });
    const context = contextFor(AGENT_B, partial);
    const license = resolve(AGENT_FIELDS.license, context);
    assert.equal(license.value, "");
    assert.equal(license.source, "empty");
    assert.equal(resolve(AGENT_FIELDS.email, context).value, "");
    assert.equal(resolve(AGENT_FIELDS.phone, context).value, "");
    assert.equal(resolve(AGENT_FIELDS.name, context).value, "Jordan Reyes");
  });

  it("no personal profile leaves every agent field blank", () => {
    const context = contextFor(AGENT_B, null);
    for (const f of [...Object.values(AGENT_FIELDS), field({ field_key: "agent_email" })]) {
      assert.equal(resolve(f, context).value, "", f.field_key);
    }
    assert.equal(resolve(BROKERAGE_FIELDS.name, context).value, "Example Realty");
  });

  it("organization defaults never fill agent identity; the owner's private default may", () => {
    const orgDefault = {
      id: "d1",
      field_id: AGENT_FIELDS.license.id,
      scope: "ORGANIZATION",
      status: "ACTIVE",
      default_value: "0111111",
      default_checked: null,
      form_id: null,
      form_field_mapping_id: null,
    } as unknown as FieldDefault;
    const privateDefault = { ...orgDefault, id: "d2", scope: "PRIVATE", default_value: "0222222" } as FieldDefault;

    const orgOnly = contextFor(AGENT_B, null, {
      scopedDefaults: { privateDefaults: [], organizationDefaults: [orgDefault] },
    });
    assert.equal(resolve(AGENT_FIELDS.license, orgOnly).value, "");

    const withPrivate = contextFor(AGENT_B, null, {
      scopedDefaults: { privateDefaults: [privateDefault], organizationDefaults: [orgDefault] },
    });
    const resolved = resolve(AGENT_FIELDS.license, withPrivate);
    assert.equal(resolved.value, "0222222");
    assert.equal(resolved.source, "private_default");
  });
});

describe("5. Agent Settings saves are isolated to the signed-in user", () => {
  const input: AgentProfileInput = {
    agent_first_name: "Jordan",
    agent_middle_name: "",
    agent_last_name: "Reyes",
    agent_license_number: "0222222",
    agent_phone: "8175550202",
    agent_email: "Jordan@Example.TEST",
    agent_address: "2 Second St",
    agent_address_line_2: "",
    agent_city: "Fort Worth",
    agent_state: "tx",
    agent_zip: "76102",
  };

  it("updates only the signed-in user's own user_agent_settings row", async () => {
    const { client, calls } = fakeSupabase({
      authUserId: AGENT_B,
      tables: {
        user_agent_settings: (call) =>
          call.action === "update" ? { ...PROFILE_B, ...(call.payload as object) } : PROFILE_B,
      },
    });
    const smuggled = { ...input, user_id: AGENT_A, status: "DELETED" } as AgentProfileInput;

    await saveCurrentUserAgentProfile(client, smuggled);

    assert.deepEqual([...new Set(calls.map((c) => c.table))], ["user_agent_settings"]);
    const [update] = writes(calls);
    assert.equal(update.action, "update");
    assert.equal(filterValue(update, "user_id"), AGENT_B);
    const payload = update.payload as Record<string, unknown>;
    assert.equal("user_id" in payload, false);
    assert.equal("status" in payload, false);
    assert.equal(payload.email, "jordan@example.test");
    assert.equal(payload.phone, "817-555-0202");
    assert.equal(payload.state, "TX");
  });

  it("creates the row for the signed-in user when none exists", async () => {
    const { client, calls } = fakeSupabase({
      authUserId: AGENT_B,
      tables: {
        user_agent_settings: (call) =>
          call.action === "insert" ? { ...PROFILE_B, ...(call.payload as object) } : null,
      },
    });
    await saveCurrentUserAgentProfile(client, input);
    const [insert] = writes(calls);
    assert.equal(insert.action, "insert");
    assert.equal((insert.payload as { user_id: string }).user_id, AGENT_B);
  });

  it("does not reactivate or edit an inactive profile", async () => {
    const { client, calls } = fakeSupabase({
      authUserId: AGENT_B,
      tables: { user_agent_settings: () => ({ ...PROFILE_B, status: "INACTIVE" }) },
    });
    await assert.rejects(saveCurrentUserAgentProfile(client, input), /inactive/);
    assert.equal(writes(calls).length, 0);
  });

  it("maps Settings input onto personal columns with admin-equivalent normalization", () => {
    const columns = agentInputToUserAgentSettingsColumns(input);
    assert.deepEqual(Object.keys(columns).sort(), [
      "address_line_1", "address_line_2", "city", "email", "legal_first_name",
      "legal_last_name", "legal_middle_name", "phone", "state", "trec_license_number", "zip",
    ]);
  });
});

function latestPolicy(sql: string, name: string): string {
  const created = [...sql.matchAll(new RegExp(`create policy "${name}"[\\s\\S]*?;`, "g"))];
  assert.ok(created.length > 0, `policy ${name} not found`);
  const last = created[created.length - 1];
  const lastDrop = sql.lastIndexOf(`drop policy if exists "${name}"`);
  assert.ok(lastDrop < (last.index ?? 0), `policy ${name} is dropped after its last definition`);
  return last[0];
}

const MIGRATIONS = (() => {
  const dir = join(process.cwd(), "supabase", "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
})();

describe("5–6. RLS keeps agent profiles personal and brokerage settings admin-only", () => {
  it("user_agent_settings rows are readable and writable only by their owner or an app admin", () => {
    for (const name of ["user_agent_settings_select", "user_agent_settings_insert", "user_agent_settings_update"]) {
      const policy = latestPolicy(MIGRATIONS, name);
      assert.match(policy, /user_id = auth\.uid\(\) or public\.is_app_admin\(\)/, name);
      assert.doesNotMatch(policy, /\(true\)/, name);
    }
  });

  it("packets are readable only by their owner or an app admin, matching agent profile access", () => {
    assert.match(latestPolicy(MIGRATIONS, "packets_select"), /owner_user_id = auth\.uid\(\) or public\.is_app_admin\(\)/);
  });

  it("only app admins can insert or update the shared brokerage_settings row", () => {
    for (const name of ["brokerage_settings_insert", "brokerage_settings_update"]) {
      const policy = latestPolicy(MIGRATIONS, name);
      assert.match(policy, /public\.is_app_admin\(\)/, name);
      assert.doesNotMatch(policy, /is_active_organization_member/, name);
    }
  });

  it("Settings shows the brokerage profile read-only unless the user is an app admin", () => {
    const page = readFileSync(join(process.cwd(), "components/settings/settings-page.tsx"), "utf8");
    assert.match(page, /profile\?\.app_role === "ADMIN" && profile\?\.status === "ACTIVE"/);
    assert.match(page, /readOnly=\{!canEditBrokerage\}/);
    assert.match(page, /saveCurrentUserAgentProfile\(/);
    assert.doesNotMatch(page, /agentProfileInputToRow|brokerageSettingsToAgentInput/);
  });
});

describe("7. Existing overrides and finalized forms stay unchanged", () => {
  it("a manual override keeps its value even though the owner's profile differs", () => {
    const resolved = resolveFieldValueFromContext({
      field: AGENT_FIELDS.license,
      context: contextFor(AGENT_B, PROFILE_B),
      existingInstance: { value: "0999999", value_json: null, is_override: true, source: "manual_override" },
    });
    assert.equal(resolved.value, "0999999");
    assert.equal(resolved.source, "manual_override");
  });

  it("ordinary open never rewrites a stale saved agent value; only explicit Refresh does", () => {
    const fieldId = AGENT_FIELDS.license.id;
    const stale = { id: "i1", field_id: fieldId, value: "0111111", value_json: null, source: "settings", is_override: false };
    const override = { ...stale, id: "i2", value: "0999999", source: "manual_override", is_override: true };
    const fresh = () => ({ value: "0222222", value_json: null, source: "settings" });

    const open = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [fieldId],
      existingByFieldId: new Map([[fieldId, stale]]),
      resolveForFieldId: fresh,
    });
    assert.equal(open.inserts.length + open.updates.length, 0);

    const refreshOverride = planFieldInstanceSyncMutations({
      mode: "refresh_non_overrides",
      fieldIds: [fieldId],
      existingByFieldId: new Map([[fieldId, override]]),
      resolveForFieldId: fresh,
    });
    assert.equal(refreshOverride.updates.length, 0);

    const refreshStale = planFieldInstanceSyncMutations({
      mode: "refresh_non_overrides",
      fieldIds: [fieldId],
      existingByFieldId: new Map([[fieldId, stale]]),
      resolveForFieldId: fresh,
    });
    assert.equal(refreshStale.updates.length, 1);
    assert.equal(refreshStale.updates[0].resolved.value, "0222222");
  });

  it("a FINAL packet form refuses value resolution and writes nothing", async () => {
    const { client, calls } = fakeSupabase({
      authUserId: AGENT_B,
      tables: {
        packet_forms: () => ({ id: 99, packet_id: 13, form_id: 5, status: "ACTIVE", document_state: "FINAL" }),
      },
    });
    for (const mode of ["ensure_missing", "refresh_non_overrides"] as const) {
      await assert.rejects(resolvePacketFormFieldValues(client, 99, { mode }));
    }
    assert.equal(writes(calls).length, 0);
    assert.deepEqual([...new Set(calls.map((c) => c.table))], ["packet_forms"]);
  });
});

describe("8. PDF output uses the saved field-instance value", () => {
  it("fills the PDF from the stored instance, not from a live profile lookup", async () => {
    const savedValue = "Saved Agent Value";
    const mapping = {
      id: "m1",
      form_id: 5,
      field_id: AGENT_FIELDS.name.id,
      mapping_name: "Agent name",
      occurrence_index: 0,
      page_number: 1,
      x: 72,
      y: 700,
      width: 300,
      height: 20,
      page_width: 612,
      page_height: 792,
      font_size: 10,
      alignment: "left",
      field_widget_type: "text",
      is_multiline: false,
      mask_background: false,
      default_value_override: null,
      required: false,
      notes: null,
      pdf_field_name: null,
      pdf_field_type: null,
      pdf_export_value: null,
      create_date: "2026-01-01T00:00:00Z",
      update_date: "2026-01-01T00:00:00Z",
      status: "ACTIVE",
      fields: AGENT_FIELDS.name,
    } as FormFieldMapping;
    const instance = {
      id: "i1",
      packet_id: 13,
      packet_form_id: 99,
      field_id: AGENT_FIELDS.name.id,
      value: savedValue,
      value_json: null,
      source: "settings",
      is_override: false,
      notes: null,
      create_date: "2026-01-01T00:00:00Z",
      update_date: "2026-01-01T00:00:00Z",
      status: "ACTIVE",
      fields: AGENT_FIELDS.name,
    } as FieldInstanceWithField;

    const views = buildPacketFormFieldViews({ mappings: [mapping], instances: [instance], placementOverrides: [] });
    assert.equal(views.length, 1);

    const blank = await PDFDocument.create();
    blank.addPage([612, 792]);
    const filled = await fillPacketFormPdfBytes(await blank.save(), views);

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: Uint8Array.from(filled), useSystemFonts: true }).promise;
    const text = (await (await parsed.getPage(1)).getTextContent()).items
      .map((item) => ("str" in item ? item.str : ""))
      .join("");
    assert.match(text, new RegExp(savedValue));
    assert.doesNotMatch(text, /Jordan|Avery/);
  });
});
