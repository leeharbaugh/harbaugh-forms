import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

type Contact = {
  id: number;
  contact_type: "INDIVIDUAL" | "ENTITY";
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  preferred_name: string | null;
  entity_name: string | null;
  status: string;
};

type PacketContact = {
  id: number;
  packet_role: string;
  sort_order: number;
  status: string;
  contacts: Contact | null;
};

const TENANT_SIDE_PACKET_ROLES = new Set([
  "TENANT",
  "CO_CLIENT",
  "SPOUSE",
  "PRIMARY",
  "OTHER",
]);

function hasUsableContactDisplayName(contact: Contact): boolean {
  if (contact.contact_type === "ENTITY") {
    return Boolean(contact.entity_name?.trim());
  }
  if (contact.preferred_name?.trim()) return true;
  return Boolean(
    contact.first_name?.trim() ||
      contact.middle_name?.trim() ||
      contact.last_name?.trim() ||
      contact.suffix?.trim(),
  );
}

function formatContactDisplayName(contact: Contact): string {
  if (contact.contact_type === "ENTITY" && contact.entity_name) {
    return contact.entity_name;
  }
  const preferred = contact.preferred_name?.trim();
  if (preferred) return preferred;
  const parts = [
    contact.first_name,
    contact.middle_name,
    contact.last_name,
    contact.suffix,
  ]
    .filter(Boolean)
    .join(" ");
  return parts || "Unnamed contact";
}

function sortPacketContacts<T extends { sort_order?: number; id: number }>(
  contacts: T[],
): T[] {
  return [...contacts].sort((a, b) => {
    const aOrder = a.sort_order ?? 0;
    const bOrder = b.sort_order ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.id - b.id;
  });
}

/** Mirror of lib/types/packet-contact.ts getOrderedTenantContacts. */
function getOrderedTenantContacts(packetContacts: PacketContact[]): Contact[] {
  const rows = sortPacketContacts(
    packetContacts.filter(
      (row) =>
        row.status === "ACTIVE" &&
        row.contacts != null &&
        row.contacts.status === "ACTIVE" &&
        TENANT_SIDE_PACKET_ROLES.has(row.packet_role) &&
        hasUsableContactDisplayName(row.contacts),
    ),
  );

  const seen = new Set<number>();
  const contacts: Contact[] = [];
  for (const row of rows) {
    const contact = row.contacts as Contact;
    if (seen.has(contact.id)) continue;
    seen.add(contact.id);
    contacts.push(contact);
  }
  return contacts;
}

function formatJoinedContactNames(contacts: Contact[]): string {
  return contacts
    .map((c) => formatContactDisplayName(c))
    .filter(Boolean)
    .join(", ");
}

function contact(partial: Partial<Contact> & { id: number }): Contact {
  return {
    contact_type: "INDIVIDUAL",
    first_name: null,
    middle_name: null,
    last_name: null,
    suffix: null,
    preferred_name: null,
    entity_name: null,
    status: "ACTIVE",
    ...partial,
  };
}

function row(
  partial: Partial<PacketContact> & {
    id: number;
    packet_role: string;
    contacts: Contact | null;
  },
): PacketContact {
  return {
    sort_order: 0,
    status: "ACTIVE",
    ...partial,
  };
}

describe("getOrderedTenantContacts / tenant_names aggregate", () => {
  it("returns empty when no tenants exist", () => {
    assert.deepEqual(getOrderedTenantContacts([]), []);
    assert.equal(formatJoinedContactNames(getOrderedTenantContacts([])), "");
  });

  it("returns one tenant name", () => {
    const contacts = getOrderedTenantContacts([
      row({
        id: 1,
        packet_role: "TENANT",
        sort_order: 0,
        contacts: contact({ id: 10, first_name: "Jane", last_name: "Smith" }),
      }),
    ]);
    assert.equal(formatJoinedContactNames(contacts), "Jane Smith");
  });

  it("joins two tenants with commas (buyer_names convention)", () => {
    const contacts = getOrderedTenantContacts([
      row({
        id: 1,
        packet_role: "TENANT",
        sort_order: 0,
        contacts: contact({ id: 10, first_name: "Jane", last_name: "Smith" }),
      }),
      row({
        id: 2,
        packet_role: "CO_CLIENT",
        sort_order: 1,
        contacts: contact({ id: 11, first_name: "John", last_name: "Smith" }),
      }),
    ]);
    assert.equal(
      formatJoinedContactNames(contacts),
      "Jane Smith, John Smith",
    );
  });

  it("joins three or more tenants with commas", () => {
    const contacts = getOrderedTenantContacts([
      row({
        id: 1,
        packet_role: "TENANT",
        sort_order: 0,
        contacts: contact({ id: 10, first_name: "Jane", last_name: "Smith" }),
      }),
      row({
        id: 2,
        packet_role: "CO_CLIENT",
        sort_order: 1,
        contacts: contact({ id: 11, first_name: "John", last_name: "Smith" }),
      }),
      row({
        id: 3,
        packet_role: "SPOUSE",
        sort_order: 2,
        contacts: contact({ id: 12, first_name: "Maria", last_name: "Garcia" }),
      }),
    ]);
    assert.equal(
      formatJoinedContactNames(contacts),
      "Jane Smith, John Smith, Maria Garcia",
    );
  });

  it("preserves sort_order and excludes sellers/landlords", () => {
    const contacts = getOrderedTenantContacts([
      row({
        id: 9,
        packet_role: "LANDLORD",
        sort_order: 0,
        contacts: contact({ id: 99, first_name: "Larry", last_name: "Landlord" }),
      }),
      row({
        id: 2,
        packet_role: "TENANT",
        sort_order: 2,
        contacts: contact({ id: 11, first_name: "Second", last_name: "Tenant" }),
      }),
      row({
        id: 1,
        packet_role: "TENANT",
        sort_order: 1,
        contacts: contact({ id: 10, first_name: "First", last_name: "Tenant" }),
      }),
      row({
        id: 8,
        packet_role: "SELLER",
        sort_order: 3,
        contacts: contact({ id: 88, first_name: "Sam", last_name: "Seller" }),
      }),
    ]);
    assert.equal(
      formatJoinedContactNames(contacts),
      "First Tenant, Second Tenant",
    );
  });

  it("excludes deleted packet relationships and inactive contacts", () => {
    const contacts = getOrderedTenantContacts([
      row({
        id: 1,
        packet_role: "TENANT",
        sort_order: 0,
        status: "DELETED",
        contacts: contact({ id: 10, first_name: "Gone", last_name: "Rel" }),
      }),
      row({
        id: 2,
        packet_role: "TENANT",
        sort_order: 1,
        contacts: contact({
          id: 11,
          first_name: "Inactive",
          last_name: "Person",
          status: "DELETED",
        }),
      }),
      row({
        id: 3,
        packet_role: "TENANT",
        sort_order: 2,
        contacts: contact({ id: 12, first_name: "Keep", last_name: "Me" }),
      }),
    ]);
    assert.equal(formatJoinedContactNames(contacts), "Keep Me");
  });

  it("omits blank tenant names and supports entity tenants", () => {
    const contacts = getOrderedTenantContacts([
      row({
        id: 1,
        packet_role: "TENANT",
        sort_order: 0,
        contacts: contact({ id: 10, first_name: null, last_name: null }),
      }),
      row({
        id: 2,
        packet_role: "TENANT",
        sort_order: 1,
        contacts: contact({
          id: 11,
          contact_type: "ENTITY",
          entity_name: "Acme Tenant LLC",
        }),
      }),
    ]);
    assert.equal(formatJoinedContactNames(contacts), "Acme Tenant LLC");
  });

  it("dedupes duplicate relationships to the same contact", () => {
    const same = contact({ id: 10, first_name: "Jane", last_name: "Twice" });
    const contacts = getOrderedTenantContacts([
      row({
        id: 1,
        packet_role: "TENANT",
        sort_order: 0,
        contacts: same,
      }),
      row({
        id: 2,
        packet_role: "CO_CLIENT",
        sort_order: 1,
        contacts: same,
      }),
    ]);
    assert.equal(formatJoinedContactNames(contacts), "Jane Twice");
  });
});

describe("tenant_names source registry wiring", () => {
  const fieldSource = readFileSync("lib/types/field-source.ts", "utf8");
  const resolver = readFileSync("lib/field-resolver.ts", "utf8");
  const packetContact = readFileSync("lib/types/packet-contact.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260805210000_packet_tenant_names_resolver.sql",
    "utf8",
  );

  it("registers tenant_names with Packet Tenant Names label", () => {
    assert.match(
      fieldSource,
      /CUSTOM_RESOLVER_KEYS = \[[^\]]*\"tenant_names\"/s,
    );
    assert.match(fieldSource, /tenant_names:\s*"Packet Tenant Names"/);
  });

  it("implements tenant_names via getOrderedTenantContacts", () => {
    assert.match(resolver, /normalizedKey === "tenant_names"/);
    assert.match(resolver, /getOrderedTenantContacts/);
    assert.match(packetContact, /export function getOrderedTenantContacts/);
  });

  it("keeps buyer_names and landlord resolvers unchanged", () => {
    assert.match(
      fieldSource,
      /CUSTOM_RESOLVER_KEYS = \[[^\]]*\"buyer_names\"/s,
    );
    assert.match(
      fieldSource,
      /CUSTOM_RESOLVER_KEYS = \[[^\]]*\"landlord_address\"/s,
    );
    assert.match(resolver, /normalizedKey === "buyer_names"/);
  });

  it("adds a durable field_resolvers catalog migration", () => {
    assert.match(migration, /'tenant_names'/);
    assert.match(migration, /Packet Tenant Names/);
    assert.match(migration, /insert into public\.field_resolvers/i);
  });
});

describe("Map Fields source-only edit preserves field identity", () => {
  it("normalizeFieldInput no longer uppercases field keys", () => {
    const fieldTs = readFileSync("lib/types/field.ts", "utf8");
    assert.match(
      fieldTs,
      /Preserve the stored field_key case/,
    );
    assert.doesNotMatch(
      fieldTs,
      /const fieldKey = trim\(input\.field_key\)\.toUpperCase\(\)/,
    );
  });

  it("locks identity fields and hides Section B for unmapped placements", () => {
    const dialog = readFileSync(
      "components/forms/pdf-field-edit-dialog.tsx",
      "utf8",
    );
    const definition = readFileSync(
      "components/forms/pdf-field-definition-form-fields.tsx",
      "utf8",
    );
    const editor = readFileSync(
      "components/forms/pdf-field-editor.tsx",
      "utf8",
    );
    assert.match(dialog, /hasLinkedField/);
    assert.match(dialog, /identityReadOnly/);
    assert.match(
      dialog,
      /This placement is not linked to a reusable field definition/,
    );
    assert.match(definition, /identityReadOnly/);
    assert.match(definition, /Field key, label, and types are locked/);
    assert.match(
      editor,
      /Fetch by id[\s\S]*emptying Section B|Catalog list can miss a linked field/,
    );
    assert.match(
      editor,
      /allowStructural && editingMapping\.field_id/,
    );
  });
});
