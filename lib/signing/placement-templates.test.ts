import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  canUseFormForOrganizationTemplate,
  canUseFormForPersonalTemplate,
  COPY_FROM_VERSION_WARNING,
  formVersionDisplay,
  formVersionPlacementEligibility,
  isAdminManagingOwnerPersonalTemplate,
  mappedRegionsFromMappings,
  mapParticipantsToSlots,
  parseSlotKey,
  personalTemplateCardTitle,
  personalTemplateSubjectUserId,
  pickEffectiveTemplate,
  planTemplateApplication,
  planTemplateCopy,
  slotKey,
  slotLabel,
  templateSlotOptions,
  templateSourceLabel,
  unresolvedSlotNotice,
  type MappedRegionSourceRow,
  type SlotRankableParticipant,
} from "./placement-template-model";
import { roleCodeForPacketRole } from "./participant-roles";
import { PACKET_CONTACT_ROLES } from "@/lib/types/packet-contact";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read(
  "supabase/migrations/20261014120000_native_signing_placement_templates.sql",
);
const templatesModule = read("lib/signing/placement-templates.ts");
const applyModule = read("lib/signing/placement-template-apply.ts");
const actions = read("lib/signing/placement-template-actions.ts");
const panel = read("components/signings/placement-template-apply-panel.tsx");
const page = read("components/forms/signing-placements-page.tsx");
const dialog = read("components/signings/signing-preview-dialog.tsx");

function participant(
  id: string,
  roleCode: string | null,
  displayOrder: number,
  extra: Partial<SlotRankableParticipant> = {},
): SlotRankableParticipant {
  return {
    id,
    roleCode,
    displayOrder,
    createDate: "2026-10-14T12:00:00.000Z",
    participantStatus: "PENDING",
    ...extra,
  };
}

describe("Placement slots", () => {
  it("parses role + ordinal slots and rejects anything else", () => {
    assert.deepEqual(parseSlotKey("BUYER:2"), { roleCode: "BUYER", ordinal: 2 });
    assert.equal(parseSlotKey("BUYER:0"), null);
    assert.equal(parseSlotKey("BUYER:21"), null);
    assert.equal(parseSlotKey("SPOUSE:1"), null);
    assert.equal(parseSlotKey("buyer:1"), null);
    assert.equal(parseSlotKey("4f6b2c1e-0000-4000-8000-000000000000"), null);
    assert.equal(parseSlotKey(undefined), null);
    assert.equal(slotLabel({ roleCode: "SELLER", ordinal: 1 }), "Seller 1");
    assert.equal(slotKey({ roleCode: "BROKER", ordinal: 3 }), "BROKER:3");
  });

  it("offers each role's first ordinals plus every slot already used", () => {
    const options = templateSlotOptions([{ roleCode: "BUYER", ordinal: 5 }]);
    const keys = options.map(slotKey);
    assert.ok(keys.includes("BUYER:1") && keys.includes("OTHER:3"));
    assert.ok(keys.includes("BUYER:5"));
    assert.deepEqual(keys.slice(0, 4), ["BUYER:1", "BUYER:2", "BUYER:3", "BUYER:5"]);
  });
});

describe("Slot -> participant mapping", () => {
  it("numbers each role by display order, then creation, then id", () => {
    const slots = mapParticipantsToSlots([
      participant("b2", "BUYER", 3),
      participant("s1", "SELLER", 0),
      participant("b1", "BUYER", 1),
      participant("b3-late", "BUYER", 5, { createDate: "2026-10-14T13:00:00.000Z" }),
      participant("b3-early", "BUYER", 5, { createDate: "2026-10-14T11:00:00.000Z" }),
    ]);
    assert.equal(slots.get("BUYER:1"), "b1");
    assert.equal(slots.get("BUYER:2"), "b2");
    assert.equal(slots.get("BUYER:3"), "b3-early");
    assert.equal(slots.get("BUYER:4"), "b3-late");
    assert.equal(slots.get("SELLER:1"), "s1");
  });

  it("breaks full ties by id so the mapping is deterministic", () => {
    const slots = mapParticipantsToSlots([
      participant("bbbb", "TENANT", 1),
      participant("aaaa", "TENANT", 1),
    ]);
    assert.equal(slots.get("TENANT:1"), "aaaa");
    assert.equal(slots.get("TENANT:2"), "bbbb");
  });

  it("never fills a slot from a removed participant or one without a role", () => {
    const slots = mapParticipantsToSlots([
      participant("gone", "BUYER", 0, { participantStatus: "REMOVED" }),
      participant("norole", null, 1),
      participant("legacy", "Spouse", 2),
      participant("kept", "BUYER", 3),
    ]);
    assert.equal(slots.get("BUYER:1"), "kept");
    assert.equal(slots.size, 1);
  });
});

describe("Application plan", () => {
  const fields = [
    { fieldType: "SIGNATURE" as const, slot: { roleCode: "BUYER" as const, ordinal: 1 } },
    { fieldType: "DATE_SIGNED" as const, slot: { roleCode: "BUYER" as const, ordinal: 1 } },
    { fieldType: "SIGNATURE" as const, slot: { roleCode: "BUYER" as const, ordinal: 3 } },
    { fieldType: "DATE_SIGNED" as const, slot: { roleCode: "BUYER" as const, ordinal: 3 } },
    { fieldType: "PRINTED_NAME" as const, slot: { roleCode: "SELLER" as const, ordinal: 1 } },
    { fieldType: "CHECKMARK" as const, slot: null },
  ];

  it("adds resolved slots and Checkmarks, skips unresolved slots", () => {
    const plan = planTemplateApplication(
      fields,
      new Map([
        ["BUYER:1", "p-b1"],
        ["SELLER:1", "p-s1"],
        ["BUYER:2", "p-extra"],
      ]),
    );
    assert.equal(plan.checkmarkCount, 1);
    assert.equal(plan.applicableCount, 4);
    assert.equal(plan.skippedCount, 2);
    const buyer3 = plan.slots.find((row) => row.label === "Buyer 3")!;
    assert.equal(buyer3.participantId, null);
    assert.equal(
      unresolvedSlotNotice(buyer3),
      "Buyer 3 has no matching participant. 2 placements will not be added.",
    );
    // Extra participants with no template slot receive nothing.
    assert.equal(plan.slots.some((row) => row.participantId === "p-extra"), false);
  });

  it("uses singular wording for one placement", () => {
    assert.equal(
      unresolvedSlotNotice({
        slot: { roleCode: "AGENT", ordinal: 2 },
        label: "Agent 2",
        participantId: null,
        placementCount: 1,
      }),
      "Agent 2 has no matching participant. 1 placement will not be added.",
    );
  });
});

describe("Precedence and labels", () => {
  it("lets a Personal template fully win without merging", () => {
    assert.deepEqual(pickEffectiveTemplate({ personal: "p", organization: "o" }), {
      scope: "PERSONAL",
      template: "p",
    });
    assert.deepEqual(pickEffectiveTemplate({ personal: null, organization: "o" }), {
      scope: "ORGANIZATION",
      template: "o",
    });
    assert.equal(pickEffectiveTemplate({ personal: null, organization: null }), null);
  });

  it("labels the source the manager sees", () => {
    assert.equal(templateSourceLabel({ scope: "PERSONAL", ownerFirstName: "Lee" }), "Lee Personal");
    assert.equal(
      templateSourceLabel({ scope: "ORGANIZATION", organizationName: "Harbaugh Realty" }),
      "Harbaugh Realty Organization",
    );
  });

  it("always shows the exact form version", () => {
    assert.equal(
      formVersionDisplay({ id: 42, form_name: "Residential Contract", form_code: "TXR-1601", version_label: "2025" }),
      "Residential Contract · TXR-1601 · Version 2025 · Form #42",
    );
  });
});

describe("Form version eligibility and scope", () => {
  const form = {
    id: 1,
    scope: "GLOBAL",
    owner_user_id: null,
    organization_id: null,
    status: "ACTIVE",
    publication_state: "PUBLISHED",
  };

  it("accepts published and retired versions only", () => {
    assert.deepEqual(formVersionPlacementEligibility(form), { ok: true });
    assert.deepEqual(
      formVersionPlacementEligibility({ status: "INACTIVE", publication_state: "DRAFT" }),
      { ok: true },
    );
    assert.equal(
      formVersionPlacementEligibility({ status: "ACTIVE", publication_state: "DRAFT" }).ok,
      false,
    );
    assert.equal(
      formVersionPlacementEligibility({ status: "DELETED", publication_state: "PUBLISHED" }).ok,
      false,
    );
  });

  it("allows Personal templates on forms the user can use; Global Admin may open a private owner's form", () => {
    const actor = { userId: "u1", memberOrganizationIds: ["org-a"] };
    assert.equal(canUseFormForPersonalTemplate(actor, form), true);
    assert.equal(
      canUseFormForPersonalTemplate(actor, { ...form, scope: "PRIVATE", owner_user_id: "u1" }),
      true,
    );
    assert.equal(
      canUseFormForPersonalTemplate(actor, { ...form, scope: "PRIVATE", owner_user_id: "u2" }),
      false,
    );
    assert.equal(
      canUseFormForPersonalTemplate(
        { ...actor, isActiveAppAdmin: true },
        { ...form, scope: "PRIVATE", owner_user_id: "u2" },
      ),
      true,
    );
    assert.equal(
      canUseFormForPersonalTemplate(actor, { ...form, scope: "ORGANIZATION", organization_id: "org-b" }),
      false,
    );
    // Apply path stays free of app-admin override (Personal precedence is the acting manager).
    assert.doesNotMatch(applyModule, /isActiveAppAdmin|isActivePlacementAppAdmin|requireAppAdmin/);
  });

  it("keeps Personal ownership on the form owner when a Global Admin manages on behalf", () => {
    const privateForm = { ...form, scope: "PRIVATE", owner_user_id: "owner-1" };
    const admin = { userId: "admin-1", isActiveAppAdmin: true };
    assert.equal(personalTemplateSubjectUserId(admin, privateForm), "owner-1");
    assert.equal(isAdminManagingOwnerPersonalTemplate(admin, privateForm), true);
    assert.equal(
      personalTemplateCardTitle({
        ownerDisplayName: "Lee Harbaugh",
        managingOnBehalf: true,
      }),
      "Personal placement template for Lee Harbaugh",
    );
    assert.equal(
      personalTemplateSubjectUserId(admin, form),
      "admin-1",
      "Global forms stay the acting admin's own Personal template",
    );
    assert.equal(
      isAdminManagingOwnerPersonalTemplate(
        { userId: "owner-1", isActiveAppAdmin: false },
        privateForm,
      ),
      false,
    );
  });

  it("maps Packet Contact role AGENT to Signing participant AGENT", () => {
    assert.ok(PACKET_CONTACT_ROLES.includes("AGENT"));
    assert.equal(roleCodeForPacketRole("AGENT"), "AGENT");
  });

  it("allows Organization templates only on forms all members can use", () => {
    assert.equal(canUseFormForOrganizationTemplate("org-a", form), true);
    assert.equal(
      canUseFormForOrganizationTemplate("org-a", { ...form, scope: "PRIVATE", owner_user_id: "u1" }),
      false,
    );
    assert.equal(
      canUseFormForOrganizationTemplate("org-a", { ...form, scope: "ORGANIZATION", organization_id: "org-a" }),
      true,
    );
  });
});

describe("Copy from another version", () => {
  it("copies placements that fit and skips later pages with their Dates", () => {
    const plan = planTemplateCopy(
      [
        { id: "sig1", fieldType: "SIGNATURE", pageNumber: 1, linkedTemplateFieldId: null },
        { id: "date1", fieldType: "DATE_SIGNED", pageNumber: 1, linkedTemplateFieldId: "sig1" },
        { id: "sig9", fieldType: "SIGNATURE", pageNumber: 9, linkedTemplateFieldId: null },
        { id: "date9", fieldType: "DATE_SIGNED", pageNumber: 9, linkedTemplateFieldId: "sig9" },
        { id: "check", fieldType: "CHECKMARK", pageNumber: 2, linkedTemplateFieldId: null },
      ],
      8,
    );
    assert.deepEqual(plan.copiedIds.sort(), ["check", "date1", "sig1"]);
    assert.deepEqual(plan.skippedIds.sort(), ["date9", "sig9"]);
    assert.deepEqual(plan.skippedPages, [9]);
  });

  it("warns that placements must be reviewed", () => {
    assert.equal(
      COPY_FROM_VERSION_WARNING,
      "Placement locations may have changed in this form version. Review all placements before using this template.",
    );
    assert.match(page, /copyWarning/);
  });
});

describe("Database protections", () => {
  it("forces deny-by-default RLS on every template table", () => {
    for (const table of [
      "signing_placement_templates",
      "signing_placement_template_fields",
      "signing_placement_template_applications",
    ]) {
      assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
      assert.match(migration, new RegExp(`on public\\.${table}\\s+as restrictive\\s+for all\\s+to authenticated\\s+using \\(false\\)`));
    }
  });

  it("keeps one ACTIVE template per form and scope owner, with no Global scope", () => {
    assert.match(migration, /spt_one_active_personal_uidx[\s\S]*?\(form_id, owner_user_id\)[\s\S]*?status = 'ACTIVE'/);
    assert.match(migration, /spt_one_active_organization_uidx[\s\S]*?\(form_id, organization_id\)/);
    assert.match(migration, /check \(scope_type in \('PERSONAL', 'ORGANIZATION'\)\)/);
    assert.match(migration, /PLACEMENT_TEMPLATE_IDENTITY_IMMUTABLE/);
  });

  it("stores slots only (no participant, contact, user, name, or email columns)", () => {
    const fieldsTable = migration.slice(
      migration.indexOf("create table if not exists public.signing_placement_template_fields"),
      migration.indexOf("comment on table public.signing_placement_template_fields"),
    );
    assert.doesNotMatch(fieldsTable, /participant_id|contact_id|user_id|full_name|email/);
    assert.match(fieldsTable, /slot_role_code text/);
    assert.match(fieldsTable, /slot_ordinal integer/);
  });

  it("constrains Date links to the same template, a source type, the same slot, no self-link", () => {
    assert.match(migration, /foreign key \(template_id, linked_template_field_id\)\s+references public\.signing_placement_template_fields \(template_id, id\)/);
    assert.match(migration, /linked_template_field_id is null or linked_template_field_id <> id/);
    assert.match(migration, /v_source\.field_type not in \('SIGNATURE', 'INITIALS'\)/);
    assert.match(migration, /v_source\.slot_role_code is distinct from new\.slot_role_code/);
    assert.match(migration, /field_type = 'CHECKMARK' and slot_role_code is null/);
  });

  it("grants the application and copy transactions to service_role only", () => {
    for (const signature of [
      "signing_apply_placement_template(uuid, uuid, uuid, uuid, uuid)",
      "signing_copy_placement_template(uuid, bigint, integer, uuid)",
    ]) {
      const escaped = signature.replace(/[()]/g, "\\$&");
      assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from authenticated`));
      assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to service_role`));
    }
  });

  it("maps slots in SQL with the same ordering as the model", () => {
    assert.match(migration, /partition by p\.role_code\s+order by p\.display_order, p\.create_date, p\.id/);
    assert.match(migration, /p\.participant_status <> 'REMOVED'\s+and p\.role_code is not null/);
    assert.doesNotMatch(migration, /optional_role/);
  });

  it("revalidates Draft state, the exact form version, and precedence inside the transaction", () => {
    const apply = migration.slice(migration.indexOf("function public.signing_apply_placement_template"));
    assert.match(apply, /for update;/);
    assert.match(apply, /PLACEMENT_TEMPLATE_NOT_DRAFT/);
    assert.match(apply, /PLACEMENT_TEMPLATE_FORM_MISMATCH/);
    assert.match(apply, /PLACEMENT_TEMPLATE_SUPERSEDED/);
    assert.match(apply, /order by \(f\.field_type = 'DATE_SIGNED'\)/);
    assert.match(apply, /unique|request_id = p_request_id/);
  });
});

describe("Mapped Form regions", () => {
  const row = (extra: Partial<MappedRegionSourceRow> = {}): MappedRegionSourceRow => ({
    status: "ACTIVE",
    field_id: "f1",
    mapping_name: null,
    occurrence_index: null,
    page_number: 1,
    x: "151.98",
    y: 73.9,
    width: 153.9,
    height: "13.85",
    page_width: 612,
    page_height: 792,
    field_widget_type: null,
    fields: { field_key: "listing_agent_name", field_label: "Listing Agent Name", field_widget_type: "text", status: "ACTIVE" },
    ...extra,
  });

  it("keeps only ACTIVE mappings connected to an ACTIVE field with a page and position", () => {
    const regions = mappedRegionsFromMappings([
      row(),
      row({ status: "INACTIVE" }),
      row({ status: "DELETED" }),
      row({ field_id: null }),
      row({ fields: null }),
      row({ fields: { field_key: "x", field_label: "X", field_widget_type: "text", status: "INACTIVE" } }),
      row({ page_number: 0 }),
      row({ x: "not a number" }),
    ]);
    assert.equal(regions.length, 1);
    assert.deepEqual(regions[0], {
      pageNumber: 1,
      x: 151.98,
      y: 73.9,
      width: 153.9,
      height: 13.85,
      pageWidth: 612,
      pageHeight: 792,
      label: "Listing Agent Name",
      kind: "TEXT",
    });
  });

  it("labels like Map Fields and never sends ids, keys, sources or values", () => {
    const [named, numbered, keyOnly, bare] = mappedRegionsFromMappings([
      row({ mapping_name: "Seller agent notice email" }),
      row({ mapping_name: "Buyer name", occurrence_index: 2 }),
      row({ fields: { field_key: "broker_full_name", field_label: null, field_widget_type: "text", status: "ACTIVE" } }),
      row({ fields: { field_key: "", field_label: "  ", field_widget_type: "text", status: "ACTIVE" } }),
    ]);
    assert.equal(named.label, "Seller agent notice email");
    assert.equal(numbered.label, "Buyer name #2");
    assert.equal(keyOnly.label, "broker_full_name");
    assert.equal(bare.label, "Mapped field");
    assert.deepEqual(Object.keys(named).sort(), [
      "height",
      "kind",
      "label",
      "pageHeight",
      "pageNumber",
      "pageWidth",
      "width",
      "x",
      "y",
    ]);
  });

  it("uses the Map Fields checkbox size and default sizes", () => {
    const [checkbox, unsized] = mappedRegionsFromMappings([
      row({ field_widget_type: "checkbox", width: 40, height: 40 }),
      row({ width: null, height: null }),
    ]);
    assert.equal(checkbox.kind, "CHECKBOX");
    assert.ok(checkbox.width < 40 && checkbox.width === checkbox.height);
    assert.ok(unsized.width > 0 && unsized.height > 0);
  });
});

describe("Server and browser boundaries", () => {
  it("accepts only template, document, and request ids from the browser on apply", () => {
    const signature = actions.slice(actions.indexOf("export async function applyPlacementTemplateAction"));
    const params = signature.slice(0, signature.indexOf("}): Promise"));
    assert.match(params, /signingId: unknown;\s+signingDocumentId: unknown;\s+templateId: unknown;\s+requestId: unknown;/);
    assert.doesNotMatch(params, /participant|slot|formId|scope/);
  });

  it("authorizes Draft management before any template work and resolves precedence server-side", () => {
    const apply = applyModule.slice(applyModule.indexOf("export async function applyPlacementTemplateWithActor"));
    assert.ok(apply.indexOf("requireManageableDraftSigning") < apply.indexOf("admin.rpc"));
    assert.ok(apply.indexOf("resolveEffectiveTemplate") < apply.indexOf("admin.rpc"));
    assert.match(apply, /effective\.template\.id !== input\.templateId/);
  });

  it("establishes the session actor before creating the service-role client", () => {
    assert.match(
      actions,
      /const actor = await requireSigningActor\(\);\s+const admin = createAdminClient\(\);/,
    );
  });

  it("reads forms through the user's own session before elevation", () => {
    const load = templatesModule.slice(templatesModule.indexOf("async function loadVisibleForm"));
    assert.match(load.slice(0, 600), /await userSession\(options\)/);
    const session = templatesModule.slice(templatesModule.indexOf("function userSession"));
    assert.match(session.slice(0, 300), /options\.sessionClient \?\? \(await createClient\(\)\)/);
  });

  it("never applies automatically: only the explicit confirm button applies", () => {
    assert.match(panel, /onClick=\{\(\) => void confirmApply\(\)\}/);
    assert.equal((panel.match(/applyPlacementTemplateAction\(/g) ?? []).length, 1);
    for (const file of [
      "lib/signing/draft-documents.ts",
      "lib/signing/source-packet.ts",
      "lib/signing/stage3-actions.ts",
      "components/signings/signing-draft-prep-panel.tsx",
      "components/signings/signing-dashboard-page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /applyPlacementTemplate|signing_apply_placement_template/);
    }
    assert.doesNotMatch(dialog, /applyPlacementTemplateAction/);
  });

  it("uses one request id per review so a double click replays instead of duplicating", () => {
    assert.match(panel, /setReview\(\{ preview: fresh, requestId: newRequestId\(\) \}\)/);
    assert.match(panel, /requestId: review\.requestId/);
    assert.match(panel, /disabled=\{busy \|\| review\.preview\.applicableCount === 0\}/);
  });

  it("keeps template editing on its own trusted actions", () => {
    assert.match(page, /upsertPlacementTemplateFieldAction/);
    assert.match(page, /removePlacementTemplateFieldAction/);
    assert.doesNotMatch(page, /upsertDraftSigningFieldAction|removeDraftSigningFieldAction/);
    assert.match(page, /dynamic\(\s*\(\) =>\s*import\("@\/components\/signings\/signing-preview-dialog"\)[\s\S]*?\{ ssr: false \}/);
  });

  it("treats an Organization template as read-only for members", () => {
    assert.match(templatesModule, /membershipRole === "ORG_ADMIN"/);
    assert.match(page, /canEdit: org\.isOrgAdmin/);
  });

  it("shows the template's exact form version mapped regions as pointer-free context", () => {
    const loader = templatesModule.slice(
      templatesModule.indexOf("export async function loadPlacementTemplateEditorWithActor"),
    );
    const readAt = loader.indexOf('requirePlacementTemplate(actor, input.templateId, admin, "read")');
    const regionsAt = loader.indexOf("loadMappedRegions(admin, template.form_id)");
    assert.ok(readAt > 0 && regionsAt > readAt, "mapped regions load only after the template read is authorized");
    const regionLoader = templatesModule.slice(
      templatesModule.indexOf("async function loadMappedRegions"),
      templatesModule.indexOf("export async function loadPlacementTemplateEditorWithActor"),
    );
    assert.match(regionLoader, /\.eq\("form_id", formId\)/);
    assert.match(regionLoader, /\.eq\("status", "ACTIVE"\)/);
    assert.doesNotMatch(regionLoader, /form_family_key|copied_from|field_instances|packet/);
    const select = templatesModule.match(/const MAPPED_REGION_SELECT =\s*"([^"]+)"/)?.[1] ?? "";
    assert.ok(select.length > 0);
    assert.doesNotMatch(
      select,
      /default_value|static_value|source|resolver|pdf_field_name|notes|value/,
    );
    // Only the template editor supplies mapped regions; Prepare Documents does not.
    assert.doesNotMatch(read("lib/signing/preview.ts"), /mappedRegions:/);
    assert.match(dialog, /const \[showMappedFields, setShowMappedFields\] = useState\(true\)/);
    assert.match(dialog, /metrics && showMappedFields/);
    assert.match(dialog, /pointer-events-none absolute rounded-\[2px\] border border-dashed/);
    assert.match(dialog, /pdfToRenderRect\(/);
    // Drawn before the Signing placement overlays so placements stay on top.
    assert.ok(dialog.indexOf("<MappedRegionOverlay") < dialog.indexOf("<SigningFieldOverlay"));
    assert.match(dialog, /Show mapped fields \(/);
  });

  it("points the editor at the exact-version PDF route and labels a load failure as the form PDF", () => {
    const route = read("app/forms/[id]/signing-placements/[templateId]/pdf/route.ts");
    assert.match(page, /documentPdfUrl: \(\) => `\/forms\/\$\{formId\}\/signing-placements\/\$\{templateId\}\/pdf`/);
    assert.match(route, /export async function GET/);
    assert.ok(
      route.indexOf("requireSigningActor()") < route.indexOf("createAdminClient()"),
      "the PDF route must establish the actor before elevating",
    );
    assert.match(route, /loadPlacementTemplatePdfWithActor\(\s*actor,\s*\{ formId: id, templateId \}/);
    const loader = templatesModule.slice(
      templatesModule.indexOf("export async function loadPlacementTemplatePdfWithActor"),
    );
    assert.match(loader, /requirePlacementTemplate\(actor, input\.templateId, admin, "read"\)/);
    assert.match(loader, /template\.form_id !== formId/);
    assert.match(loader, /\.eq\("id", formId\)/);
    assert.doesNotMatch(loader, /form_family_key/);
    assert.match(dialog, /\{copy\.documentLoadError\}/);
    assert.match(page, /documentLoadError:\s*\n?\s*"Could not load the PDF for this form version\./);
  });
});
