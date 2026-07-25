import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { countPdfPagesFromBytes } from "./pdf-page-count.ts";
import { buildPublishStructureFingerprintPayload } from "./publish-structure-fingerprint.ts";
import { validateFormForPublish } from "../types/form-publish-validation.ts";
import {
  canEditForm,
  isActiveAppAdmin,
  type LibraryActor,
} from "../library-permissions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

function readRepo(...parts: string[]): string {
  return readFileSync(join(root, ...parts), "utf8");
}

async function makePdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage();
  }
  return doc.save();
}

describe("secure publish source contracts", () => {
  it("revokes client EXECUTE and grants only service_role in the new migration", () => {
    const sql = readRepo(
      "supabase/migrations/20260725180000_secure_publish_form_template.sql",
    );
    assert.match(sql, /drop function if exists public\.publish_form_template\(bigint, bigint, text\)/);
    assert.match(
      sql,
      /revoke all on function public\.publish_form_template\(bigint, bigint, text, uuid, text\) from anon/i,
    );
    assert.match(
      sql,
      /revoke all on function public\.publish_form_template\(bigint, bigint, text, uuid, text\) from authenticated/i,
    );
    assert.match(
      sql,
      /grant execute on function public\.publish_form_template\(bigint, bigint, text, uuid, text\) to service_role/i,
    );
    assert.match(sql, /p_actor_user_id uuid/);
    assert.match(sql, /p_expected_structure_fingerprint text/);
    assert.match(sql, /can_publish_form_as/);
    assert.match(sql, /form_publish_structure_fingerprint/);
    assert.doesNotMatch(
      sql,
      /grant execute on function public\.publish_form_template\([^)]+\) to authenticated/i,
    );
  });

  it("trusted server action uses admin client and session actor only", () => {
    const source = readRepo("lib/forms/form-lifecycle-actions.ts");
    assert.match(source, /createAdminClient/);
    assert.match(source, /p_actor_user_id:\s*userId/);
    assert.match(source, /p_expected_structure_fingerprint/);
    assert.match(source, /evaluatePublishReadiness/);
    assert.doesNotMatch(source, /input\.actor/);
    assert.doesNotMatch(source, /p_actor_user_id:\s*input\./);
    // Final publish must not call RPC through the user-scoped client.
    assert.doesNotMatch(
      source,
      /supabase\.rpc\(\s*["']publish_form_template["']/,
    );
    assert.match(source, /admin\.rpc\(\s*["']publish_form_template["']/);
  });

  it("does not expose service-role imports to client UI", () => {
    const ui = readRepo("components/forms/forms-page.tsx");
    assert.doesNotMatch(ui, /createAdminClient/);
    assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE/);
    assert.doesNotMatch(ui, /SUPABASE_SECRET_KEY/);
    assert.match(ui, /publishFormTemplate/);
  });
});

describe("publish structure fingerprint payload", () => {
  it("includes form path, update timestamp, ACTIVE mappings, and field metadata", () => {
    const payload = buildPublishStructureFingerprintPayload({
      form: {
        id: 42,
        source_storage_path: "global/forms/42/blank.pdf",
        update_date: "2026-07-25T12:00:00+00:00",
        status: "ACTIVE",
        publication_state: "DRAFT",
      },
      mappings: [
        {
          id: "m2",
          field_id: "f1",
          page_number: 2,
          pdf_field_name: "Buyer",
          occurrence_index: 0,
          status: "ACTIVE",
        },
        {
          id: "m1",
          field_id: "f1",
          page_number: 1,
          pdf_field_name: "Seller",
          occurrence_index: 0,
          status: "ACTIVE",
        },
      ],
      fields: [
        {
          id: "f1",
          status: "ACTIVE",
          source_type: "manual_only",
          resolver_key: null,
        },
      ],
    });

    assert.match(payload, /form:42/);
    assert.match(payload, /path:global\/forms\/42\/blank\.pdf/);
    assert.match(payload, /updated:2026-07-25T12:00:00\+00:00/);
    // Sorted by mapping id
    assert.match(payload, /mappings:m1:.*m2:/);
    assert.match(payload, /fields:f1:ACTIVE:manual_only:/);
  });

  it("changes when ACTIVE mapping inventory changes (TOCTOU signal)", () => {
    const base = {
      form: {
        id: 1,
        source_storage_path: "a.pdf",
        update_date: "t1",
        status: "ACTIVE",
        publication_state: "DRAFT",
      },
      fields: [] as {
        id: string;
        status: string | null;
        source_type: string | null;
        resolver_key: string | null;
      }[],
    };
    const before = buildPublishStructureFingerprintPayload({
      ...base,
      mappings: [
        {
          id: "m1",
          field_id: "f1",
          page_number: 1,
          pdf_field_name: "x",
          occurrence_index: 0,
          status: "ACTIVE",
        },
      ],
    });
    const after = buildPublishStructureFingerprintPayload({
      ...base,
      mappings: [
        {
          id: "m1",
          field_id: "f1",
          page_number: 99,
          pdf_field_name: "x",
          occurrence_index: 0,
          status: "ACTIVE",
        },
      ],
    });
    assert.notEqual(before, after);
  });
});

describe("secure publish authorization rules", () => {
  const globalForm = {
    scope: "GLOBAL" as const,
    owner_user_id: null as string | null,
    organization_id: null as string | null,
    status: "ACTIVE",
  };
  const privateForm = {
    scope: "PRIVATE" as const,
    owner_user_id: "owner-1",
    organization_id: null as string | null,
    status: "ACTIVE",
  };

  it("blocks a normal user from publishing a Global form", () => {
    const actor: LibraryActor = {
      userId: "user-1",
      isActiveAdmin: false,
    };
    assert.equal(canEditForm(actor, globalForm), false);
  });

  it("allows an authorized Private-form owner to mutate their form", () => {
    const actor: LibraryActor = {
      userId: "owner-1",
      isActiveAdmin: false,
    };
    assert.equal(canEditForm(actor, privateForm), true);
  });

  it("ORG_ADMIN alone cannot publish a Global form", () => {
    // ORG_ADMIN is not application ADMIN; canEditForm requires isActiveAdmin for GLOBAL.
    const orgAdminProfile = {
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "COMPLETE",
    };
    assert.equal(isActiveAppAdmin(orgAdminProfile), false);
    const actor: LibraryActor = {
      userId: "org-admin-1",
      isActiveAdmin: false,
      // Even with org admin memberships, Global form edit requires app admin.
      orgAdminOrganizationIds: ["org-1"],
    };
    assert.equal(canEditForm(actor, globalForm), false);
  });
});

describe("failed PDF validation blocks publication (no transition)", () => {
  const draftForm = {
    status: "ACTIVE",
    publication_state: "DRAFT",
    scope: "GLOBAL",
    source_storage_path: "global/forms/1/blank.pdf",
  };

  it("missing PDF produces blocking issue", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [],
      fieldsById: new Map(),
      pdfPageCount: null,
      pdfLoadError: "The form PDF could not be downloaded from Storage.",
      allowEmptyMappings: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.blocking));
  });

  it("corrupt PDF bytes are unreadable", async () => {
    const counted = await countPdfPagesFromBytes(
      new TextEncoder().encode("not-a-pdf"),
    );
    assert.equal(counted.ok, false);
  });

  it("out-of-range mapping blocks publication", async () => {
    const bytes = await makePdfBytes(2);
    const counted = await countPdfPagesFromBytes(bytes);
    assert.equal(counted.ok, true);
    if (!counted.ok) return;

    const result = validateFormForPublish({
      form: draftForm,
      mappings: [
        {
          id: "m1",
          field_id: "f1",
          page_number: 9,
          status: "ACTIVE",
        },
      ],
      fieldsById: new Map([
        [
          "f1",
          {
            id: "f1",
            status: "ACTIVE",
            source_type: "manual_only",
            resolver_key: null,
            field_key: "X",
            field_label: "X",
            field_name: "X",
          },
        ],
      ]),
      pdfPageCount: counted.pageCount,
      pdfLoadError: null,
      allowEmptyMappings: false,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (i) => i.blocking && /page|range|PDF/i.test(i.message),
      ),
    );
  });
});
