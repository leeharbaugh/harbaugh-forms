import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deletePacket,
  formatPacketStatus,
  PACKET_STATUSES,
  type PacketStatus,
  restorePacket,
  updatePacket,
} from "./packet";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

type Write = {
  table: string;
  values: Record<string, unknown>;
  filters: [string, string, unknown][];
};

/** Records writes; every packet read returns `packetStatus`. */
function fakeClient(packetStatus: string) {
  const writes: Write[] = [];
  const client = {
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let values: Record<string, unknown> | null = null;
      const builder = {
        select() {
          return builder;
        },
        update(next: Record<string, unknown>) {
          values = next;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push(["eq", column, value]);
          return builder;
        },
        neq(column: string, value: unknown) {
          filters.push(["neq", column, value]);
          return builder;
        },
        single() {
          return Promise.resolve({
            data: { id: 1, status: packetStatus, representation_agreement_id: null },
            error: null,
          });
        },
        then(resolve: (value: { error: null }) => unknown) {
          if (values) writes.push({ table, values, filters });
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

describe("Packet lifecycle: ACTIVE and DELETED only", () => {
  it("defines exactly ACTIVE and DELETED", () => {
    assert.deepEqual([...PACKET_STATUSES], ["ACTIVE", "DELETED"]);
    // @ts-expect-error INACTIVE is not a Packet status
    const inactive: PacketStatus = "INACTIVE";
    assert.equal(PACKET_STATUSES.includes(inactive), false);
  });

  it("labels only Active and Deleted", () => {
    assert.equal(formatPacketStatus("ACTIVE"), "Active");
    assert.equal(formatPacketStatus("DELETED"), "Deleted");
    assert.doesNotMatch(read("lib/types/packet.ts"), /INACTIVE/);
  });

  it("creates Packets without a status, so the ACTIVE column default applies", () => {
    const source = read("lib/types/packet.ts");
    const inserts = source.split('.from("packets")').slice(1).filter((chunk) => /^\s*\.insert\(/.test(chunk));
    assert.equal(inserts.length, 3);
    for (const chunk of inserts) {
      assert.doesNotMatch(chunk.slice(0, chunk.indexOf("})")), /status/);
    }
  });

  it("soft delete moves ACTIVE to DELETED", async () => {
    const { client, writes } = fakeClient("ACTIVE");
    await deletePacket(client, 1);
    const packetWrite = writes.find((write) => write.table === "packets");
    assert.deepEqual(packetWrite?.values, { status: "DELETED" });
    assert.deepEqual(packetWrite?.filters, [
      ["eq", "id", 1],
      ["eq", "status", "ACTIVE"],
    ]);
  });

  it("restore moves DELETED to ACTIVE and refuses anything else", async () => {
    const { client, writes } = fakeClient("DELETED");
    await restorePacket(client, 1);
    const packetWrite = writes.find((write) => write.table === "packets");
    assert.deepEqual(packetWrite?.values, { status: "ACTIVE" });
    assert.deepEqual(packetWrite?.filters, [
      ["eq", "id", 1],
      ["eq", "status", "DELETED"],
    ]);
    await assert.rejects(restorePacket(fakeClient("ACTIVE").client, 1), /Only deleted packets/);
  });

  it("editing Packet details never writes status", async () => {
    const { client, writes } = fakeClient("ACTIVE");
    await updatePacket(client, 1, {
      label: "Packet",
      packetType: "custom",
      collectionId: null,
      propertyId: null,
      notes: null,
    });
    const packetWrite = writes.find((write) => write.table === "packets");
    assert.ok(packetWrite);
    assert.equal("status" in packetWrite.values, false);
    assert.deepEqual(packetWrite.filters, [
      ["eq", "id", 1],
      ["neq", "status", "DELETED"],
    ]);
  });

  it("offers no Packet status control or Inactive state in the Packet UI", () => {
    for (const file of [
      "components/packets/packet-edit-form.tsx",
      "components/packets/packet-detail.tsx",
      "components/packets/packets-page.tsx",
      "lib/signing/packet-signing-eligibility.ts",
      "lib/signing/source-packet.ts",
    ]) {
      assert.doesNotMatch(read(file), /INACTIVE|Inactive/, file);
    }
    assert.doesNotMatch(read("components/packets/packet-edit-form.tsx"), /packet_status|setStatus/);
  });

  it("normalizes INACTIVE to ACTIVE, then constrains Packets to ACTIVE / DELETED", () => {
    const migration = read("supabase/migrations/20261009140000_packets_active_deleted_only.sql");
    const sql = migration.replace(/^--.*$/gm, "");
    const normalizeAt = sql.indexOf("set status = 'ACTIVE'");
    const constraintAt = sql.indexOf("check (status in ('ACTIVE', 'DELETED'))");
    assert.ok(normalizeAt > 0 && normalizeAt < constraintAt);
    assert.match(sql, /where status = 'INACTIVE';/);
    assert.equal((sql.match(/\bupdate\s+public\.\w+/g) ?? []).join(), "update public.packets");
    assert.doesNotMatch(sql, /owner_user_id|packet_forms|field_instances|signing/);
  });
});
