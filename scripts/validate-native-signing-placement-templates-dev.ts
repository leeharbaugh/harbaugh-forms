/**
 * Development-only Signing Placement Templates validator.
 * Targets development Supabase ewxsxwzezhkeawnjvigx only. Disposable
 * synthetic Users, organizations, forms, Packet, and Signing; no email.
 *
 * Proves: Personal and Organization templates attach to one exact Form
 * version; Personal fully wins; only owners / ORG_ADMINs edit, members use,
 * other organizations and application admins get nothing; slots map by role
 * and stable participant order; unresolved slots are skipped and extra
 * participants get nothing; Dates link to their new source; applied fields
 * are ordinary editable Draft fields with no live link; request ids make a
 * double apply idempotent (including concurrently); copy-from-version creates
 * an independent template and skips pages the target lacks; the database
 * enforces slot, link, scope, and identity invariants; browsers cannot read
 * template tables or call the transactions.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { buildFormStoragePath, FORM_TEMPLATES_BUCKET } from "../lib/form-storage.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import {
  applyPlacementTemplateWithActor,
  loadPlacementTemplateApplyPreviewWithActor,
} from "../lib/signing/placement-template-apply.ts";
import type { PlacementTemplateApplyPreview } from "../lib/signing/placement-template-model.ts";
import {
  copyPlacementTemplateWithActor,
  createPlacementTemplateWithActor,
  deletePlacementTemplateWithActor,
  loadFormPlacementPageWithActor,
  loadPlacementTemplateEditorWithActor,
  loadPlacementTemplatePdfWithActor,
  removePlacementTemplateFieldWithActor,
  upsertPlacementTemplateFieldWithActor,
} from "../lib/signing/placement-templates.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function fail(message: string): never {
  throw new Error(`FAIL: ${message}`);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function expectSigningError(label: string, code: string | string[], action: () => Promise<unknown>) {
  const codes = Array.isArray(code) ? code : [code];
  try {
    await action();
  } catch (error) {
    if (error instanceof SigningError && codes.includes(error.code)) {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    fail(`${label} threw unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
  fail(`${label} unexpectedly succeeded`);
}

async function expectDbError(label: string, pattern: RegExp, action: () => PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await action();
  if (!error) fail(`${label} unexpectedly succeeded`);
  if (!pattern.test(error.message)) fail(`${label} failed with unexpected error: ${error.message}`);
  ok(`${label} rejected by the database`);
}

function buildActor(options: {
  userId: string;
  email: string;
  firstName: string;
  memberships: { organizationId: string; membershipRole: "MEMBER" | "ORG_ADMIN" }[];
  appRole?: "USER" | "ADMIN";
}): SigningActor {
  const profile = {
    id: options.userId,
    status: "ACTIVE",
    app_role: options.appRole ?? "USER",
    onboarding_status: "ACTIVE",
    display_name: `${options.firstName} Placement`,
    first_name: options.firstName,
    email: options.email,
    primary_organization_id: options.memberships[0]?.organizationId ?? null,
    must_change_password: false,
  } as Profile;
  return {
    userId: options.userId,
    email: options.email,
    displayName: `${options.firstName} Placement`,
    profile,
    memberships: options.memberships.map((row) => ({
      ...row,
      membershipStatus: "ACTIVE",
      organizationStatus: "ACTIVE",
    })),
  };
}

async function fixturePdf(pages: number, label: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`${label} page ${index + 1}`, { x: 72, y: 720, size: 14 });
  }
  return pdf.save();
}

async function main() {
  process.env.NATIVE_SIGNING_ENABLED = "true";
  delete process.env.SIGNING_EMAIL_SANDBOX;
  delete process.env.RESEND_API_KEY;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  ok(`target project verified (${EXPECTED_REF})`);
  const publishableKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("Need service role key");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const password = `Placement-${stamp}-Aa1!`;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const signingIds: string[] = [];
  const formIds: number[] = [];
  const storagePaths: string[] = [];
  let packetId: number | null = null;

  async function cleanup() {
    const { data: templates } = await admin
      .from("signing_placement_templates")
      .select("id")
      .or(
        [
          userIds.length ? `owner_user_id.in.(${userIds.join(",")})` : null,
          organizationIds.length ? `organization_id.in.(${organizationIds.join(",")})` : null,
        ]
          .filter(Boolean)
          .join(","),
      );
    const templateIds = (templates ?? []).map((row) => row.id as string);
    for (const id of signingIds) {
      await admin.from("signing_placement_template_applications").delete().eq("signing_id", id);
      await admin.from("signing_draft_fields").delete().eq("signing_id", id).not("linked_signature_draft_field_id", "is", null);
      await admin.from("signing_draft_fields").delete().eq("signing_id", id);
      await admin.from("signing_draft_prepared_content").delete().eq("signing_id", id);
      await admin.from("signing_documents").delete().eq("signing_id", id);
      await admin.from("signing_participants").delete().eq("signing_id", id);
      await admin.from("signing_work_items").delete().eq("signing_id", id);
      await admin.from("signing_events").delete().eq("signing_id", id);
      await admin.from("signing_event_chain_state").delete().eq("signing_id", id);
      await admin.from("signings").update({ current_primary_agent_association_id: null }).eq("id", id);
      await admin.from("signing_operator_associations").delete().eq("signing_id", id);
      await admin.from("signing_agent_associations").delete().eq("signing_id", id);
      const { error } = await admin.from("signings").delete().eq("id", id);
      if (error) console.error(`Cleanup: Signing ${id}: ${error.message}`);
    }
    if (templateIds.length > 0) {
      await admin.from("signing_placement_template_applications").delete().in("template_id", templateIds);
      await admin.from("signing_placement_template_fields").delete().in("template_id", templateIds);
      await admin.from("signing_placement_templates").update({ copied_from_template_id: null }).in("id", templateIds);
      const { error } = await admin.from("signing_placement_templates").delete().in("id", templateIds);
      if (error) console.error(`Cleanup: templates: ${error.message}`);
    }
    if (packetId != null) {
      await admin.from("packet_forms").delete().eq("packet_id", packetId);
      await admin.from("packets").delete().eq("id", packetId);
    }
    for (const id of formIds) {
      await admin.from("form_field_mappings").update({ status: "DELETED" }).eq("form_id", id);
      await admin.from("forms").update({ status: "DELETED", publication_state: "DRAFT" }).eq("id", id);
    }
    if (storagePaths.length > 0) {
      await admin.storage.from(FORM_TEMPLATES_BUCKET).remove(storagePaths);
    }
    for (const id of organizationIds) {
      await admin.from("organization_members").delete().eq("organization_id", id);
    }
    for (const id of userIds) {
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
    for (const id of organizationIds) {
      await admin.from("organizations").delete().eq("id", id);
    }
  }

  try {
    async function createOrg(name: string) {
      const { data, error } = await admin
        .from("organizations")
        .insert({ name, organization_type: "OTHER", status: "ACTIVE" })
        .select("id")
        .single();
      if (error || !data) fail(`org create failed: ${error?.message}`);
      organizationIds.push(data.id as string);
      return data.id as string;
    }
    async function createUser(label: string, firstName: string, orgId: string, role: "MEMBER" | "ORG_ADMIN") {
      const email = `placement-${label}-${stamp}@example.invalid`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) fail(`user create failed: ${error?.message}`);
      const userId = data.user.id;
      userIds.push(userId);
      const { error: profileError } = await admin.from("profiles").upsert({
        id: userId,
        email,
        status: "ACTIVE",
        app_role: "USER",
        onboarding_status: "ACTIVE",
        display_name: `${firstName} Placement`,
        first_name: firstName,
        primary_organization_id: orgId,
        must_change_password: false,
      });
      if (profileError) fail(`profile upsert failed: ${profileError.message}`);
      const { error: membershipError } = await admin.from("organization_members").insert({
        organization_id: orgId,
        user_id: userId,
        membership_role: role,
        status: "ACTIVE",
      });
      if (membershipError) fail(`membership insert failed: ${membershipError.message}`);
      const session = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInError } = await session.auth.signInWithPassword({ email, password });
      if (signInError) fail(`sign-in failed: ${signInError.message}`);
      return {
        actor: buildActor({ userId, email, firstName, memberships: [{ organizationId: orgId, membershipRole: role }] }),
        session,
      };
    }

    const orgName = `Placement Brokerage ${stamp}`;
    const orgId = await createOrg(orgName);
    const otherOrgId = await createOrg(`Placement Other ${stamp}`);
    const agent = await createUser("agent", "Pat", orgId, "MEMBER");
    const orgAdmin = await createUser("orgadmin", "Robin", orgId, "ORG_ADMIN");
    const member = await createUser("member", "Sam", orgId, "MEMBER");
    const outsider = await createUser("outsider", "Olive", otherOrgId, "ORG_ADMIN");
    const appAdmin = buildActor({
      userId: outsider.actor.userId,
      email: outsider.actor.email,
      firstName: "Olive",
      memberships: [{ organizationId: otherOrgId, membershipRole: "ORG_ADMIN" }],
      appRole: "ADMIN",
    });
    ok("created disposable Users and organizations");

    const family = `PT-${stamp}`;
    async function createForm(options: {
      label: string;
      pages: number;
      scope: "PRIVATE" | "GLOBAL";
      ownerUserId: string | null;
      family?: string;
    }): Promise<number> {
      const { data, error } = await admin
        .from("forms")
        .insert({
          form_code: options.family ?? `${family}-${options.label}`,
          form_name: `Placement ${options.label} ${stamp}`,
          form_category: "OTHER",
          state_code: "TX",
          version_label: options.label,
          source_storage_path: `pending/placement-${stamp}-${options.label}.pdf`,
          scope: options.scope,
          owner_user_id: options.ownerUserId,
          status: "ACTIVE",
          publication_state: "DRAFT",
          form_family_key: options.family ?? `${family}-${options.label}`,
        })
        .select("id")
        .single();
      if (error || !data) fail(`form create failed: ${error?.message}`);
      const formId = data.id as number;
      formIds.push(formId);
      const path = buildFormStoragePath({
        scope: options.scope,
        formId,
        fileName: `placement-${options.label}.pdf`,
        ownerUserId: options.ownerUserId,
      });
      const { error: uploadError } = await admin.storage
        .from(FORM_TEMPLATES_BUCKET)
        .upload(path, await fixturePdf(options.pages, options.label), {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) fail(`form PDF upload failed: ${uploadError.message}`);
      storagePaths.push(path);
      const { error: pathError } = await admin
        .from("forms")
        .update({ source_storage_path: path })
        .eq("id", formId);
      if (pathError) fail(pathError.message);
      return formId;
    }
    async function publish(formId: number, actorUserId: string, retireFormId: number | null = null) {
      const { data: fingerprint, error: fingerprintError } = await admin.rpc(
        "form_publish_structure_fingerprint",
        { p_form_id: formId },
      );
      if (fingerprintError || !fingerprint) fail(`fingerprint failed: ${fingerprintError?.message}`);
      const { error } = await admin.rpc("publish_form_template", {
        p_form_id: formId,
        p_retire_form_id: retireFormId,
        p_reason: "Placement template validation",
        p_actor_user_id: actorUserId,
        p_expected_structure_fingerprint: fingerprint,
      });
      if (error) fail(`publish failed: ${error.message}`);
    }

    // Mapped regions use an existing ACTIVE catalog field; mappings are added
    // before publishing because published forms are structurally locked.
    const { data: catalogField, error: catalogError } = await admin
      .from("fields")
      .select("id")
      .eq("status", "ACTIVE")
      .limit(1)
      .single();
    if (catalogError || !catalogField) fail(`no ACTIVE catalog field: ${catalogError?.message}`);
    async function mapField(
      formId: number,
      mappingName: string,
      options: { page?: number; status?: string; widget?: string; y?: number } = {},
    ) {
      const { error } = await admin.from("form_field_mappings").insert({
        form_id: formId,
        field_id: catalogField!.id,
        mapping_name: mappingName,
        page_number: options.page ?? 1,
        x: 100,
        y: options.y ?? 200,
        width: 180,
        height: 14,
        page_width: 612,
        page_height: 792,
        field_widget_type: options.widget ?? "text",
        status: options.status ?? "ACTIVE",
      });
      if (error) fail(`mapping insert failed: ${error.message}`);
    }

    const formV1 = await createForm({ label: "v1", pages: 3, scope: "PRIVATE", ownerUserId: agent.actor.userId, family });
    await mapField(formV1, "V1 Agent Name");
    await publish(formV1, agent.actor.userId);
    const formV2 = await createForm({ label: "v2", pages: 2, scope: "PRIVATE", ownerUserId: agent.actor.userId, family });
    await mapField(formV2, "V2 Agent Name", { y: 260 });
    await mapField(formV2, "V2 Retired Mapping", { status: "INACTIVE" });
    await mapField(formV2, "V2 Checkbox", { page: 2, widget: "checkbox" });
    await publish(formV2, agent.actor.userId, formV1);
    const formDraft = await createForm({ label: "draft", pages: 1, scope: "PRIVATE", ownerUserId: agent.actor.userId });
    const formOthers = await createForm({ label: "others", pages: 1, scope: "PRIVATE", ownerUserId: orgAdmin.actor.userId });
    await mapField(formOthers, "Owner Agent Name");
    await publish(formOthers, orgAdmin.actor.userId);
    const formGlobal = await createForm({ label: "global", pages: 2, scope: "GLOBAL", ownerUserId: null });
    await mapField(formGlobal, "Global Broker Name");
    await publish(formGlobal, LEE_USER_ID);

    function expectMappedRegions(
      label: string,
      model: { model: { documents: { mappedRegions?: { label: string; pageNumber: number }[] }[] } },
      expected: string[],
    ) {
      const regions = model.model.documents[0]?.mappedRegions ?? [];
      const labels = regions.map((region) => region.label).sort();
      if (JSON.stringify(labels) !== JSON.stringify([...expected].sort())) {
        fail(`${label}: mapped regions ${JSON.stringify(labels)}, expected ${JSON.stringify(expected)}`);
      }
      for (const region of regions) {
        const keys = Object.keys(region).sort().join(",");
        if (keys !== "height,kind,label,pageHeight,pageNumber,pageWidth,width,x,y") {
          fail(`${label}: mapped region carries extra data: ${keys}`);
        }
      }
      ok(`${label}: editor shows exactly ${expected.length} mapped region(s) of this form version`);
    }
    const { data: v1Row } = await admin.from("forms").select("status").eq("id", formV1).single();
    if (v1Row?.status !== "INACTIVE") fail("publishing v2 did not retire v1");
    ok("created disposable forms: retired v1 (3 pages), published v2 (2 pages, same family), Draft, another user's Private, Global");

    /** The editor PDF must be byte-identical to the template's exact form version. */
    async function expectEditorPdf(
      label: string,
      actor: SigningActor,
      formId: number,
      templateId: string,
    ) {
      const pdf = await loadPlacementTemplatePdfWithActor(actor, { formId, templateId }, admin);
      const { data: formRow } = await admin
        .from("forms")
        .select("source_storage_path")
        .eq("id", formId)
        .single();
      const { data: blob, error } = await admin.storage
        .from(FORM_TEMPLATES_BUCKET)
        .download(formRow?.source_storage_path as string);
      if (error || !blob) fail(`${label}: exact form PDF missing from storage`);
      const expected = new Uint8Array(await blob.arrayBuffer());
      if (
        pdf.bytes.byteLength !== expected.byteLength ||
        !pdf.bytes.every((byte, index) => byte === expected[index])
      ) {
        fail(`${label}: editor PDF bytes differ from Form #${formId}`);
      }
      ok(`${label}: editor PDF is Form #${formId}'s exact bytes (${expected.byteLength} B)`);
    }

    // -------------------------------------------------------------------
    // Personal templates, eligibility, and field rules
    // -------------------------------------------------------------------
    const personalV1 = (
      await createPlacementTemplateWithActor(
        agent.actor,
        { formId: formV1, scope: "PERSONAL" },
        admin,
        { sessionClient: agent.session },
      )
    ).templateId;
    ok("Personal template created on a retired (immutable) form version");

    await expectSigningError("Personal template on an unpublished Draft form", "CONFLICT", () =>
      createPlacementTemplateWithActor(agent.actor, { formId: formDraft, scope: "PERSONAL" }, admin, {
        sessionClient: agent.session,
      }),
    );
    await expectSigningError("Personal template on another user's Private form", "NOT_FOUND", () =>
      createPlacementTemplateWithActor(agent.actor, { formId: formOthers, scope: "PERSONAL" }, admin, {
        sessionClient: agent.session,
      }),
    );
    await expectSigningError("second ACTIVE Personal template for the same form", "CONFLICT", () =>
      createPlacementTemplateWithActor(agent.actor, { formId: formV1, scope: "PERSONAL" }, admin, {
        sessionClient: agent.session,
      }),
    );

    async function place(actor: SigningActor, templateId: string, input: Record<string, unknown>) {
      const result = await upsertPlacementTemplateFieldWithActor(
        actor,
        { templateId, x: 72, y: 600, width: 150, height: 24, isRequired: true, ...input } as Parameters<
          typeof upsertPlacementTemplateFieldWithActor
        >[1],
        admin,
      );
      return result.id;
    }
    const sigB1 = await place(agent.actor, personalV1, { fieldType: "SIGNATURE", slotKey: "BUYER:1", pageNumber: 1 });
    await place(agent.actor, personalV1, {
      fieldType: "DATE_SIGNED",
      slotKey: "BUYER:1",
      pageNumber: 1,
      x: 240,
      linkedTemplateFieldId: sigB1,
      dateLinkMode: "AUTO_NEAREST",
    });
    const initB2 = await place(agent.actor, personalV1, { fieldType: "INITIALS", slotKey: "BUYER:2", pageNumber: 2, width: 40 });
    await place(agent.actor, personalV1, {
      fieldType: "DATE_SIGNED",
      slotKey: "BUYER:2",
      pageNumber: 2,
      x: 140,
      linkedTemplateFieldId: initB2,
      dateLinkMode: "AUTO_NEAREST",
    });
    await place(agent.actor, personalV1, { fieldType: "PRINTED_NAME", slotKey: "SELLER:1", pageNumber: 1, y: 500 });
    const checkId = await place(agent.actor, personalV1, {
      fieldType: "CHECKMARK",
      slotKey: "BUYER:1",
      pageNumber: 2,
      y: 300,
      width: 12,
      height: 12,
    });
    const sigB3 = await place(agent.actor, personalV1, { fieldType: "SIGNATURE", slotKey: "BUYER:3", pageNumber: 3 });
    await place(agent.actor, personalV1, {
      fieldType: "DATE_SIGNED",
      slotKey: "BUYER:3",
      pageNumber: 3,
      x: 240,
      linkedTemplateFieldId: sigB3,
      dateLinkMode: "AUTO_NEAREST",
    });
    const { data: checkRow } = await admin
      .from("signing_placement_template_fields")
      .select("slot_role_code, slot_ordinal, is_required")
      .eq("id", checkId)
      .single();
    if (checkRow?.slot_role_code !== null || checkRow?.slot_ordinal !== null || checkRow?.is_required !== false) {
      fail("Checkmark kept a slot or was required");
    }
    ok("placed 8 template placements; Checkmark stores no slot and is never required");

    await expectSigningError("Signature without a slot", "INVALID_INPUT", () =>
      place(agent.actor, personalV1, { fieldType: "SIGNATURE", pageNumber: 1 }),
    );
    await expectSigningError("slot naming a participant id", "INVALID_INPUT", () =>
      place(agent.actor, personalV1, { fieldType: "SIGNATURE", slotKey: randomUUID(), pageNumber: 1 }),
    );
    await expectSigningError("Date linked to another slot's Signature", "INVALID_INPUT", () =>
      place(agent.actor, personalV1, {
        fieldType: "DATE_SIGNED",
        slotKey: "SELLER:1",
        pageNumber: 1,
        linkedTemplateFieldId: sigB1,
      }),
    );
    await expectSigningError("auto-linked Date on another page", "INVALID_INPUT", () =>
      place(agent.actor, personalV1, {
        fieldType: "DATE_SIGNED",
        slotKey: "BUYER:1",
        pageNumber: 2,
        linkedTemplateFieldId: sigB1,
        dateLinkMode: "AUTO_NEAREST",
      }),
    );
    await expectSigningError("changing a linked source's type", "INVALID_INPUT", () =>
      place(agent.actor, personalV1, { fieldId: sigB1, fieldType: "PRINTED_NAME", slotKey: "BUYER:1", pageNumber: 1 }),
    );

    await expectDbError("Date whose slot differs from its source", /PLACEMENT_TEMPLATE_DATE_LINK_INVALID/, () =>
      admin.from("signing_placement_template_fields").insert({
        template_id: personalV1,
        field_type: "DATE_SIGNED",
        slot_role_code: "SELLER",
        slot_ordinal: 1,
        page_number: 1,
        x: 1,
        y: 1,
        width: 10,
        height: 10,
        linked_template_field_id: sigB1,
      }),
    );
    const selfId = randomUUID();
    await expectDbError("self-linked Date", /sptf_not_self_linked|PLACEMENT_TEMPLATE_DATE_LINK_INVALID/, () =>
      admin.from("signing_placement_template_fields").insert({
        id: selfId,
        template_id: personalV1,
        field_type: "DATE_SIGNED",
        slot_role_code: "BUYER",
        slot_ordinal: 1,
        page_number: 1,
        x: 1,
        y: 1,
        width: 10,
        height: 10,
        linked_template_field_id: selfId,
      }),
    );
    await expectDbError("Checkmark with a slot", /sptf_slot_by_type_check/, () =>
      admin.from("signing_placement_template_fields").insert({
        template_id: personalV1,
        field_type: "CHECKMARK",
        slot_role_code: "BUYER",
        slot_ordinal: 1,
        page_number: 1,
        x: 1,
        y: 1,
        width: 10,
        height: 10,
      }),
    );
    await expectDbError("unlinked Date", /sptf_link_by_type_check|PLACEMENT_TEMPLATE_DATE_LINK_INVALID/, () =>
      admin.from("signing_placement_template_fields").insert({
        template_id: personalV1,
        field_type: "DATE_SIGNED",
        slot_role_code: "BUYER",
        slot_ordinal: 1,
        page_number: 1,
        x: 1,
        y: 1,
        width: 10,
        height: 10,
      }),
    );
    await expectDbError("changing a template's form version", /PLACEMENT_TEMPLATE_IDENTITY_IMMUTABLE/, () =>
      admin.from("signing_placement_templates").update({ form_id: formV2 }).eq("id", personalV1),
    );
    await expectDbError("a second ACTIVE Personal template row", /spt_one_active_personal_uidx|duplicate/, () =>
      admin.from("signing_placement_templates").insert({
        form_id: formV1,
        scope_type: "PERSONAL",
        owner_user_id: agent.actor.userId,
      }),
    );
    await expectDbError("a Global-scope template", /spt_scope_type_check|spt_scope_owner_check/, () =>
      admin.from("signing_placement_templates").insert({
        form_id: formGlobal,
        scope_type: "GLOBAL",
        owner_user_id: agent.actor.userId,
      }),
    );
    const boundsRow = {
      template_id: personalV1,
      field_type: "SIGNATURE",
      slot_role_code: "BUYER",
      slot_ordinal: 1,
      page_number: 1,
      x: 1,
      y: 1,
      width: 10,
      height: 10,
    };
    await expectDbError("page 0", /check constraint/, () =>
      admin.from("signing_placement_template_fields").insert({ ...boundsRow, page_number: 0 }),
    );
    await expectDbError("slot ordinal 0", /check constraint/, () =>
      admin.from("signing_placement_template_fields").insert({ ...boundsRow, slot_ordinal: 0 }),
    );
    await expectDbError("zero-width placement", /check constraint/, () =>
      admin.from("signing_placement_template_fields").insert({ ...boundsRow, width: 0 }),
    );
    await expectDbError("Signature with no slot", /check constraint/, () =>
      admin.from("signing_placement_template_fields").insert({ ...boundsRow, slot_role_code: null, slot_ordinal: null }),
    );

    // Reassigning a source moves its Date; removing it removes the Date.
    const extraSig = await place(agent.actor, personalV1, { fieldType: "SIGNATURE", slotKey: "AGENT:1", pageNumber: 1, y: 100 });
    const extraDate = await place(agent.actor, personalV1, {
      fieldType: "DATE_SIGNED",
      slotKey: "AGENT:1",
      pageNumber: 1,
      y: 100,
      x: 260,
      linkedTemplateFieldId: extraSig,
      dateLinkMode: "AUTO_NEAREST",
    });
    await place(agent.actor, personalV1, { fieldId: extraSig, fieldType: "SIGNATURE", slotKey: "BROKER:1", pageNumber: 1, y: 100 });
    const { data: followed } = await admin
      .from("signing_placement_template_fields")
      .select("slot_role_code, slot_ordinal")
      .eq("id", extraDate)
      .single();
    if (followed?.slot_role_code !== "BROKER" || followed?.slot_ordinal !== 1) {
      fail("linked Date did not follow its source's slot");
    }
    const removed = await removePlacementTemplateFieldWithActor(
      agent.actor,
      { templateId: personalV1, fieldId: extraSig },
      admin,
    );
    if (removed.removedFieldIds.length !== 2 || !removed.removedFieldIds.includes(extraDate)) {
      fail("removing a source did not remove its Date");
    }
    ok("a linked Date follows its source's slot and is removed with it");

    // -------------------------------------------------------------------
    // Authorization
    // -------------------------------------------------------------------
    await expectSigningError("another member reading a Personal template", "NOT_FOUND", () =>
      loadPlacementTemplateEditorWithActor(member.actor, { templateId: personalV1 }, admin),
    );
    await expectSigningError("another organization's admin editing a Personal template", "NOT_FOUND", () =>
      place(outsider.actor, personalV1, { fieldType: "SIGNATURE", slotKey: "BUYER:1", pageNumber: 1 }),
    );

    await expectSigningError("member creating an Organization template", "FORBIDDEN", () =>
      createPlacementTemplateWithActor(agent.actor, { formId: formGlobal, scope: "ORGANIZATION", organizationId: orgId }, admin, {
        sessionClient: agent.session,
      }),
    );
    await expectSigningError("another organization's admin creating this organization's template", "FORBIDDEN", () =>
      createPlacementTemplateWithActor(outsider.actor, { formId: formGlobal, scope: "ORGANIZATION", organizationId: orgId }, admin, {
        sessionClient: outsider.session,
      }),
    );
    await expectSigningError("Organization template on a Private form", "CONFLICT", () =>
      createPlacementTemplateWithActor(orgAdmin.actor, { formId: formOthers, scope: "ORGANIZATION", organizationId: orgId }, admin, {
        sessionClient: orgAdmin.session,
      }),
    );
    const orgGlobal = (
      await createPlacementTemplateWithActor(
        orgAdmin.actor,
        { formId: formGlobal, scope: "ORGANIZATION", organizationId: orgId },
        admin,
        { sessionClient: orgAdmin.session },
      )
    ).templateId;
    const orgSig = await place(orgAdmin.actor, orgGlobal, { fieldType: "SIGNATURE", slotKey: "BUYER:1", pageNumber: 1 });
    await place(orgAdmin.actor, orgGlobal, {
      fieldType: "DATE_SIGNED",
      slotKey: "BUYER:1",
      pageNumber: 1,
      x: 240,
      linkedTemplateFieldId: orgSig,
      dateLinkMode: "AUTO_NEAREST",
    });
    await place(orgAdmin.actor, orgGlobal, { fieldType: "INITIALS", slotKey: "SELLER:1", pageNumber: 2, width: 40 });
    ok("organization admin created and edited an Organization template on a Global form");

    await expectDbError("a Date linked to another template's Signature", /sptf_link_same_template_fkey|PLACEMENT_TEMPLATE_DATE_LINK_INVALID/, () =>
      admin.from("signing_placement_template_fields").insert({
        template_id: personalV1,
        field_type: "DATE_SIGNED",
        slot_role_code: "BUYER",
        slot_ordinal: 1,
        page_number: 1,
        x: 300,
        y: 600,
        width: 60,
        height: 14,
        linked_template_field_id: orgSig,
      }),
    );
    await expectSigningError("server Date linked to another template's Signature", ["INVALID_INPUT", "NOT_FOUND"], () =>
      place(agent.actor, personalV1, {
        fieldType: "DATE_SIGNED",
        slotKey: "BUYER:1",
        pageNumber: 1,
        linkedTemplateFieldId: orgSig,
      }),
    );

    const memberView = await loadPlacementTemplateEditorWithActor(agent.actor, { templateId: orgGlobal }, admin);
    if (memberView.canEdit || memberView.model.documents[0].fields.length !== 3) {
      fail("member view of the Organization template was wrong");
    }
    ok("members can view (use) the Organization template but not edit it");
    await expectSigningError("member editing the Organization template", "FORBIDDEN", () =>
      place(agent.actor, orgGlobal, { fieldType: "SIGNATURE", slotKey: "SELLER:1", pageNumber: 1 }),
    );
    await expectSigningError("member deleting the Organization template", "FORBIDDEN", () =>
      deletePlacementTemplateWithActor(agent.actor, { templateId: orgGlobal }, admin),
    );
    await expectSigningError("another organization reading the Organization template", "NOT_FOUND", () =>
      loadPlacementTemplateEditorWithActor(outsider.actor, { templateId: orgGlobal }, admin),
    );
    await expectSigningError("an application admin outside the organization", "NOT_FOUND", () =>
      loadPlacementTemplateEditorWithActor(appAdmin, { templateId: orgGlobal }, admin),
    );

    // Global Admin may manage a private Form owner's Personal template on
    // their behalf (ownership stays with the owner; no Global scope).
    {
      const { error: promoteError } = await admin
        .from("profiles")
        .update({ app_role: "ADMIN" })
        .eq("id", outsider.actor.userId);
      if (promoteError) fail(`promote app admin failed: ${promoteError.message}`);
      const adminOnBehalf = buildActor({
        userId: outsider.actor.userId,
        email: outsider.actor.email,
        firstName: "Olive",
        memberships: [{ organizationId: otherOrgId, membershipRole: "ORG_ADMIN" }],
        appRole: "ADMIN",
      });
      const privatePage = await loadFormPlacementPageWithActor(
        adminOnBehalf,
        { formId: formOthers },
        admin,
        { sessionClient: outsider.session },
      );
      if (!privatePage.managingPersonalOnBehalf) fail("admin page did not mark on-behalf management");
      if (!privatePage.personalCardTitle.includes("Robin")) {
        fail(`admin personal card title missing owner: ${privatePage.personalCardTitle}`);
      }
      if (privatePage.form.scope !== "PRIVATE") fail("private Form scope not shown");
      const createdForOwner = await createPlacementTemplateWithActor(
        adminOnBehalf,
        { formId: formOthers, scope: "PERSONAL" },
        admin,
        { sessionClient: outsider.session },
      );
      const { data: ownedRow } = await admin
        .from("signing_placement_templates")
        .select("owner_user_id, created_by_user_id, scope_type")
        .eq("id", createdForOwner.templateId)
        .single();
      if (
        ownedRow?.owner_user_id !== orgAdmin.actor.userId ||
        ownedRow.created_by_user_id !== outsider.actor.userId ||
        ownedRow.scope_type !== "PERSONAL"
      ) {
        fail(`admin-on-behalf template ownership wrong: ${JSON.stringify(ownedRow)}`);
      }
      const emptyEditor = await loadPlacementTemplateEditorWithActor(
        adminOnBehalf,
        { templateId: createdForOwner.templateId },
        admin,
      );
      if (emptyEditor.model.documents[0]?.fields.length !== 0 || !emptyEditor.canEdit) {
        fail("a new zero-placement on-behalf template must open editable with 0 placements");
      }
      expectMappedRegions("Global Admin on behalf, private Form", emptyEditor, ["Owner Agent Name"]);
      await expectEditorPdf("Global Admin on behalf, zero placements", adminOnBehalf, formOthers, createdForOwner.templateId);
      await expectEditorPdf("private Form owner", orgAdmin.actor, formOthers, createdForOwner.templateId);
      await expectSigningError("unrelated member loading another user's template PDF", "NOT_FOUND", () =>
        loadPlacementTemplatePdfWithActor(agent.actor, { formId: formOthers, templateId: createdForOwner.templateId }, admin),
      );
      await expectSigningError("template PDF requested under a different form id", "NOT_FOUND", () =>
        loadPlacementTemplatePdfWithActor(adminOnBehalf, { formId: formGlobal, templateId: createdForOwner.templateId }, admin),
      );
      await place(adminOnBehalf, createdForOwner.templateId, {
        fieldType: "SIGNATURE",
        slotKey: "BUYER:1",
        pageNumber: 1,
      });
      await expectSigningError("organization admin editing another user's Personal template", "NOT_FOUND", () =>
        place(orgAdmin.actor, personalV1, { fieldType: "SIGNATURE", slotKey: "BUYER:1", pageNumber: 1 }),
      );
      await expectSigningError("unrelated member opening another user's private Form placements", "NOT_FOUND", () =>
        loadFormPlacementPageWithActor(agent.actor, { formId: formOthers }, admin, {
          sessionClient: agent.session,
        }),
      );
      await expectEditorPdf("Global Admin on behalf, after a placement", adminOnBehalf, formOthers, createdForOwner.templateId);
      ok("Global Admin manages the private Form owner's Personal template on their behalf (owner stays owner; actor attributed)");
      await admin.from("profiles").update({ app_role: "USER" }).eq("id", outsider.actor.userId);
    }

    // The editor PDF loads for every authorized template reader, Global Forms
    // included, and for a brand-new template with no placements.
    {
      const globalPersonal = await createPlacementTemplateWithActor(
        agent.actor,
        { formId: formGlobal, scope: "PERSONAL" },
        admin,
        { sessionClient: agent.session },
      );
      const emptyGlobal = await loadPlacementTemplateEditorWithActor(
        agent.actor,
        { templateId: globalPersonal.templateId },
        admin,
      );
      if (emptyGlobal.model.documents[0]?.fields.length !== 0 || !emptyGlobal.canEdit) {
        fail("a new Global Form Personal template must open editable with 0 placements");
      }
      expectMappedRegions("Global Form Personal", emptyGlobal, ["Global Broker Name"]);
      expectMappedRegions(
        "Organization template, member view",
        await loadPlacementTemplateEditorWithActor(agent.actor, { templateId: orgGlobal }, admin),
        ["Global Broker Name"],
      );
      expectMappedRegions(
        "Organization template, organization admin",
        await loadPlacementTemplateEditorWithActor(orgAdmin.actor, { templateId: orgGlobal }, admin),
        ["Global Broker Name"],
      );
      await expectEditorPdf("Global Form Personal, zero placements", agent.actor, formGlobal, globalPersonal.templateId);
      await expectSigningError("another organization's admin loading a Personal template PDF", "NOT_FOUND", () =>
        loadPlacementTemplatePdfWithActor(outsider.actor, { formId: formGlobal, templateId: globalPersonal.templateId }, admin),
      );
      await expectEditorPdf("Organization template, organization admin", orgAdmin.actor, formGlobal, orgGlobal);
      await expectEditorPdf("Organization template, member (view only)", agent.actor, formGlobal, orgGlobal);
      await expectSigningError("another organization loading an Organization template PDF", "NOT_FOUND", () =>
        loadPlacementTemplatePdfWithActor(outsider.actor, { formId: formGlobal, templateId: orgGlobal }, admin),
      );
      await deletePlacementTemplateWithActor(agent.actor, { templateId: globalPersonal.templateId }, admin);
      ok("editor PDF loads for Global Form Personal and Organization templates; other users and organizations get NOT_FOUND");
    }

    const agentSelect = await agent.session.from("signing_placement_templates").select("id");
    if (agentSelect.error == null && (agentSelect.data ?? []).length > 0) {
      fail("an authenticated browser session can read template rows");
    }
    const agentRpc = await agent.session.rpc("signing_apply_placement_template", {
      p_signing_id: randomUUID(),
      p_signing_document_id: randomUUID(),
      p_template_id: orgGlobal,
      p_request_id: randomUUID(),
      p_actor_user_id: agent.actor.userId,
    });
    if (!agentRpc.error) fail("an authenticated browser session can call the apply transaction");
    ok("browser sessions cannot read template tables or call the apply transaction");

    // -------------------------------------------------------------------
    // Copy from another version
    // -------------------------------------------------------------------
    const pageModel = await loadFormPlacementPageWithActor(agent.actor, { formId: formV2 }, admin, {
      sessionClient: agent.session,
    });
    const suggested = pageModel.personalCopySources.find((row) => row.templateId === personalV1);
    if (!suggested?.sameFamily) fail("same-family source was not suggested");
    if (!pageModel.form.display.includes(`Form #${formV2}`)) fail("page model hides the exact form version");
    ok("Form page suggests the same-family source and shows the exact form version");

    const copy = await copyPlacementTemplateWithActor(
      agent.actor,
      { sourceTemplateId: personalV1, targetFormId: formV2 },
      admin,
      { sessionClient: agent.session },
    );
    if (copy.copied !== 6 || copy.skipped !== 2 || copy.skippedPages.join(",") !== "3") {
      fail(`copy counts wrong: ${JSON.stringify(copy)}`);
    }
    const { data: copiedFields } = await admin
      .from("signing_placement_template_fields")
      .select("id, field_type, linked_template_field_id")
      .eq("template_id", copy.templateId);
    const copiedIds = new Set((copiedFields ?? []).map((row) => row.id as string));
    for (const row of copiedFields ?? []) {
      if (row.field_type === "DATE_SIGNED" && !copiedIds.has(row.linked_template_field_id as string)) {
        fail("copied Date still links into the source template");
      }
    }
    const { data: copyRow } = await admin
      .from("signing_placement_templates")
      .select("scope_type, owner_user_id, form_id, copied_from_template_id")
      .eq("id", copy.templateId)
      .single();
    if (
      copyRow?.scope_type !== "PERSONAL" ||
      copyRow.owner_user_id !== agent.actor.userId ||
      copyRow.form_id !== formV2 ||
      copyRow.copied_from_template_id !== personalV1
    ) {
      fail("copied template has the wrong scope or form");
    }
    ok("copy created an independent Personal template: 6 copied, page 3's 2 placements skipped, Dates relinked");
    expectMappedRegions(
      "copied v1 template opened on v2 (target version only; inactive excluded)",
      await loadPlacementTemplateEditorWithActor(agent.actor, { templateId: copy.templateId }, admin),
      ["V2 Agent Name", "V2 Checkbox"],
    );
    expectMappedRegions(
      "the v1 source template",
      await loadPlacementTemplateEditorWithActor(agent.actor, { templateId: personalV1 }, admin),
      ["V1 Agent Name"],
    );
    await expectSigningError("copying onto a version that already has a template", "CONFLICT", () =>
      copyPlacementTemplateWithActor(agent.actor, { sourceTemplateId: personalV1, targetFormId: formV2 }, admin, {
        sessionClient: agent.session,
      }),
    );
    await expectSigningError("member copying the Organization template", "FORBIDDEN", () =>
      copyPlacementTemplateWithActor(agent.actor, { sourceTemplateId: orgGlobal, targetFormId: formV2 }, admin, {
        sessionClient: agent.session,
      }),
    );
    const personalV2 = copy.templateId;

    // -------------------------------------------------------------------
    // Apply
    // -------------------------------------------------------------------
    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        owner_user_id: agent.actor.userId,
        label: `Placement packet ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(`packet create failed: ${packetError?.message}`);
    packetId = packet.id as number;
    async function packetForm(formId: number | null, label: string) {
      const { data, error } = await admin
        .from("packet_forms")
        .insert({
          packet_id: packetId,
          form_id: formId,
          status: "ACTIVE",
          document_state: "DRAFT",
          availability_state: "AVAILABLE",
          document_name: label,
          document_type: "PDF",
          origin: formId ? "added_internal" : "external_upload",
          sort_order: 1,
          is_required: false,
          field_data: {},
          owner_user_id: agent.actor.userId,
        })
        .select("id")
        .single();
      if (error || !data) fail(`packet form create failed: ${error?.message}`);
      return data.id as number;
    }
    const pfV2 = await packetForm(formV2, "Contract v2");
    const pfGlobal = await packetForm(formGlobal, "Global addendum");
    const pfUpload = await packetForm(null, "Uploaded PDF");

    const signing = await createDraftSigningWithActor(agent.actor, { title: `Placement Signing ${stamp}` }, admin);
    signingIds.push(signing.id);
    {
      const { error } = await admin.from("signings").update({ source_packet_id: packetId }).eq("id", signing.id);
      if (error) fail(`source packet selection failed: ${error.message}`);
    }
    async function addDocument(packetFormId: number, order: number) {
      const { data, error } = await admin
        .from("signing_documents")
        .insert({
          signing_id: signing.id,
          source_packet_form_id: packetFormId,
          display_order: order,
          display_name: `Doc ${order}`,
          included_in_draft: true,
        })
        .select("id")
        .single();
      if (error || !data) fail(`document create failed: ${error?.message}`);
      return data.id as string;
    }
    const docV2 = await addDocument(pfV2, 0);
    const docGlobal = await addDocument(pfGlobal, 1);
    const docUpload = await addDocument(pfUpload, 2);
    async function addParticipant(label: string, roleCode: string | null, displayOrder: number, status = "PENDING") {
      const { data, error } = await admin
        .from("signing_participants")
        .insert({
          signing_id: signing.id,
          full_name: `Placement ${label}`,
          email: `placement-${label.toLowerCase().replace(/\s+/g, "-")}-${stamp}@example.invalid`,
          participant_status: status,
          role_code: roleCode,
          optional_role: roleCode === "BUYER" ? "Seller" : null,
          display_order: displayOrder,
        })
        .select("id")
        .single();
      if (error || !data) fail(`participant insert failed: ${error?.message}`);
      return data.id as string;
    }
    await addParticipant("Removed Buyer", "BUYER", 0, "REMOVED");
    const buyerA = await addParticipant("Buyer A", "BUYER", 1);
    const seller = await addParticipant("Seller", "SELLER", 2);
    const buyerB = await addParticipant("Buyer B", "BUYER", 3);
    const extraAgent = await addParticipant("Extra Agent", "AGENT", 4);
    ok("Draft Signing with a v2 document, a Global document, an upload, and five participants (one removed)");

    const previewOf = async (actor: SigningActor, documentId: string) =>
      loadPlacementTemplateApplyPreviewWithActor(actor, { signingId: signing.id, signingDocumentId: documentId }, admin);
    const available = (preview: PlacementTemplateApplyPreview) => {
      if (!preview.available) fail(`expected a template, got ${preview.reason}`);
      return preview;
    };

    const fullPreview = available(await previewOf(agent.actor, docV2));
    if (
      fullPreview.templateId !== personalV2 ||
      fullPreview.sourceLabel !== "Pat Personal" ||
      fullPreview.placementCount !== 6 ||
      fullPreview.applicableCount !== 6 ||
      fullPreview.skippedCount !== 0
    ) {
      fail(`unexpected preview: ${JSON.stringify(fullPreview)}`);
    }
    const mapping = Object.fromEntries(fullPreview.slots.map((row) => [row.slotKey, row.participantName]));
    if (
      mapping["BUYER:1"] !== "Placement Buyer A" ||
      mapping["BUYER:2"] !== "Placement Buyer B" ||
      mapping["SELLER:1"] !== "Placement Seller"
    ) {
      fail(`slot mapping wrong: ${JSON.stringify(mapping)}`);
    }
    ok("preview maps Buyer 1/Buyer 2 by display order (removed participant ignored, optional_role ignored), Seller 1, source 'Pat Personal'");

    const uploadPreview = await previewOf(agent.actor, docUpload);
    if (uploadPreview.available || uploadPreview.reason !== "NO_FORM") fail("upload offered a template");
    ok("an uploaded document without a form version is never offered a template");

    await admin.from("signing_participants").update({ participant_status: "REMOVED" }).eq("id", buyerB);
    const missingPreview = available(await previewOf(agent.actor, docV2));
    const buyer2 = missingPreview.slots.find((row) => row.slotKey === "BUYER:2");
    if (
      buyer2?.notice !== "Buyer 2 has no matching participant. 2 placements will not be added." ||
      missingPreview.skippedCount !== 2 ||
      missingPreview.applicableCount !== 4
    ) {
      fail(`missing-slot preview wrong: ${JSON.stringify(missingPreview)}`);
    }
    ok("missing slot reported: 'Buyer 2 has no matching participant. 2 placements will not be added.'");

    const requestA = randomUUID();
    const applied = await applyPlacementTemplateWithActor(
      agent.actor,
      { signingId: signing.id, signingDocumentId: docV2, templateId: personalV2, requestId: requestA },
      admin,
    );
    if (applied.created !== 4 || applied.skipped !== 2 || applied.replayed) {
      fail(`apply counts wrong: ${JSON.stringify(applied)}`);
    }
    const { data: draftFields } = await admin
      .from("signing_draft_fields")
      .select("id, field_type, signing_participant_id, linked_signature_draft_field_id, x")
      .eq("signing_id", signing.id)
      .eq("signing_document_id", docV2);
    const { data: prepared } = await admin
      .from("signing_draft_prepared_content")
      .select("content_type, signing_participant_id")
      .eq("signing_id", signing.id)
      .eq("signing_document_id", docV2);
    const appliedSig = (draftFields ?? []).find((row) => row.field_type === "SIGNATURE");
    const appliedDate = (draftFields ?? []).find((row) => row.field_type === "DATE_SIGNED");
    if (
      (draftFields ?? []).length !== 2 ||
      appliedSig?.signing_participant_id !== buyerA ||
      appliedDate?.linked_signature_draft_field_id !== appliedSig?.id ||
      appliedDate?.signing_participant_id !== buyerA
    ) {
      fail(`applied signer fields wrong: ${JSON.stringify(draftFields)}`);
    }
    const printed = (prepared ?? []).find((row) => row.content_type === "PRINTED_NAME");
    const check = (prepared ?? []).find((row) => row.content_type === "CHECKMARK");
    if (printed?.signing_participant_id !== seller || !check || check.signing_participant_id !== null) {
      fail(`applied prepared content wrong: ${JSON.stringify(prepared)}`);
    }
    const everyAssigned = [...(draftFields ?? []), ...(prepared ?? [])].map((row) => row.signing_participant_id);
    if (everyAssigned.includes(extraAgent) || everyAssigned.includes(buyerB)) {
      fail("an extra or removed participant received placements");
    }
    ok("applied 4 placements (2 skipped): Signature then linked Date for Buyer 1, Printed Name for Seller 1, unassigned Checkmark; extra participant got nothing");

    const replay = await applyPlacementTemplateWithActor(
      agent.actor,
      { signingId: signing.id, signingDocumentId: docV2, templateId: personalV2, requestId: requestA },
      admin,
    );
    const { count: afterReplay } = await admin
      .from("signing_draft_fields")
      .select("id", { count: "exact", head: true })
      .eq("signing_document_id", docV2);
    if (!replay.replayed || replay.created !== 4 || afterReplay !== 2) fail("replayed request created placements again");
    ok("repeating the same request id replays the result and adds nothing");
    await expectSigningError("reusing a request id for another document", "IDEMPOTENCY_CONFLICT", () =>
      applyPlacementTemplateWithActor(
        agent.actor,
        { signingId: signing.id, signingDocumentId: docGlobal, templateId: personalV2, requestId: requestA },
        admin,
      ),
    );

    const beforeSecond = available(await previewOf(agent.actor, docV2));
    if (beforeSecond.existingPlacementCount !== 4) fail("preview did not warn about existing placements");
    const concurrentRequest = randomUUID();
    const concurrent = await Promise.all(
      [0, 1].map(() =>
        applyPlacementTemplateWithActor(
          agent.actor,
          { signingId: signing.id, signingDocumentId: docV2, templateId: personalV2, requestId: concurrentRequest },
          admin,
        ),
      ),
    );
    const { count: afterConcurrent } = await admin
      .from("signing_draft_fields")
      .select("id", { count: "exact", head: true })
      .eq("signing_document_id", docV2);
    if (afterConcurrent !== 4 || concurrent.filter((row) => row.replayed).length !== 1) {
      fail(`concurrent double apply was not idempotent (fields ${afterConcurrent})`);
    }
    ok("preview warns about 4 existing placements; a concurrent double apply with one request id adds exactly one more set and never removes manual placements");

    // Applied placements are ordinary Draft fields with no live link.
    await upsertDraftSigningFieldWithActor(
      agent.actor,
      {
        signingId: signing.id,
        fieldId: appliedSig!.id,
        signingDocumentId: docV2,
        signingParticipantId: buyerA,
        fieldType: "SIGNATURE",
        pageNumber: 1,
        x: 300,
        y: 600,
        width: 150,
        height: 24,
      },
      admin,
    );
    const { data: templateSigAfter } = await admin
      .from("signing_placement_template_fields")
      .select("x")
      .eq("template_id", personalV2)
      .eq("field_type", "SIGNATURE")
      .eq("slot_role_code", "BUYER")
      .single();
    if (Number(templateSigAfter?.x) !== 72) fail("editing an applied field changed the template");
    const templateSigId = (
      await admin
        .from("signing_placement_template_fields")
        .select("id")
        .eq("template_id", personalV2)
        .eq("field_type", "SIGNATURE")
        .single()
    ).data?.id as string;
    await place(agent.actor, personalV2, { fieldId: templateSigId, fieldType: "SIGNATURE", slotKey: "BUYER:1", pageNumber: 1, x: 10 });
    const { data: appliedAfter } = await admin
      .from("signing_draft_fields")
      .select("x")
      .eq("id", appliedSig!.id)
      .single();
    if (Number(appliedAfter?.x) !== 300) fail("editing the template changed an applied field");
    ok("applied placements are editable and independent: neither edit reaches the other");

    // Organization template, precedence, and exact version.
    const orgPreview = available(await previewOf(agent.actor, docGlobal));
    if (orgPreview.templateId !== orgGlobal || orgPreview.sourceLabel !== `${orgName} Organization`) {
      fail(`Organization preview wrong: ${JSON.stringify(orgPreview)}`);
    }
    ok("a member is offered the originating organization's template for the Global document");

    await expectSigningError("applying a template for a different form version", "CONFLICT", () =>
      applyPlacementTemplateWithActor(
        agent.actor,
        { signingId: signing.id, signingDocumentId: docGlobal, templateId: personalV2, requestId: randomUUID() },
        admin,
      ),
    );
    const mismatchRpc = await admin.rpc("signing_apply_placement_template", {
      p_signing_id: signing.id,
      p_signing_document_id: docGlobal,
      p_template_id: personalV2,
      p_request_id: randomUUID(),
      p_actor_user_id: agent.actor.userId,
    });
    if (!mismatchRpc.error?.message.includes("PLACEMENT_TEMPLATE_FORM_MISMATCH")) {
      fail("transaction accepted a template for another form version");
    }
    ok("the transaction itself refuses a template for a different form version");

    const personalGlobal = (
      await createPlacementTemplateWithActor(agent.actor, { formId: formGlobal, scope: "PERSONAL" }, admin, {
        sessionClient: agent.session,
      })
    ).templateId;
    await place(agent.actor, personalGlobal, { fieldType: "INITIALS", slotKey: "BUYER:1", pageNumber: 2, width: 40 });
    const winning = available(await previewOf(agent.actor, docGlobal));
    if (winning.templateId !== personalGlobal || winning.placementCount !== 1) {
      fail("Personal template did not fully win over the Organization template");
    }
    ok("Personal template fully wins (1 placement, nothing merged from the Organization template's 3)");
    await expectSigningError("applying the superseded Organization template", "CONFLICT", () =>
      applyPlacementTemplateWithActor(
        agent.actor,
        { signingId: signing.id, signingDocumentId: docGlobal, templateId: orgGlobal, requestId: randomUUID() },
        admin,
      ),
    );
    const supersededRpc = await admin.rpc("signing_apply_placement_template", {
      p_signing_id: signing.id,
      p_signing_document_id: docGlobal,
      p_template_id: orgGlobal,
      p_request_id: randomUUID(),
      p_actor_user_id: agent.actor.userId,
    });
    if (!supersededRpc.error?.message.includes("PLACEMENT_TEMPLATE_SUPERSEDED")) {
      fail("transaction applied an Organization template over a Personal one");
    }
    ok("the transaction itself refuses the Organization template while a Personal one exists");

    const adminView = available(await previewOf(orgAdmin.actor, docGlobal));
    if (adminView.templateId !== orgGlobal) fail("organization admin was not offered the Organization template");
    const adminApplied = await applyPlacementTemplateWithActor(
      orgAdmin.actor,
      { signingId: signing.id, signingDocumentId: docGlobal, templateId: orgGlobal, requestId: randomUUID() },
      admin,
    );
    if (adminApplied.created !== 3) fail(`organization admin apply created ${adminApplied.created}`);
    ok("precedence follows the acting manager: the organization admin (no Personal template) applies the Organization template");

    await expectSigningError("outsider previewing this Signing", ["NOT_FOUND", "FORBIDDEN"], () =>
      previewOf(outsider.actor, docV2),
    );
    await expectSigningError("outsider applying to this Signing", ["NOT_FOUND", "FORBIDDEN"], () =>
      applyPlacementTemplateWithActor(
        outsider.actor,
        { signingId: signing.id, signingDocumentId: docV2, templateId: personalV2, requestId: randomUUID() },
        admin,
      ),
    );
    await expectSigningError("another user's Personal template", "CONFLICT", () =>
      applyPlacementTemplateWithActor(
        orgAdmin.actor,
        { signingId: signing.id, signingDocumentId: docV2, templateId: personalV2, requestId: randomUUID() },
        admin,
      ),
    );

    const otherSigning = await createDraftSigningWithActor(agent.actor, { title: `Placement other ${stamp}` }, admin);
    signingIds.push(otherSigning.id);
    await expectSigningError("a document from another Signing", ["NOT_FOUND", "CONFLICT", "INVALID_INPUT"], () =>
      applyPlacementTemplateWithActor(
        agent.actor,
        { signingId: otherSigning.id, signingDocumentId: docV2, templateId: personalV2, requestId: randomUUID() },
        admin,
      ),
    );
    const forgedRpc = await admin.rpc("signing_apply_placement_template", {
      p_signing_id: otherSigning.id,
      p_signing_document_id: docV2,
      p_template_id: personalV2,
      p_request_id: randomUUID(),
      p_actor_user_id: agent.actor.userId,
    });
    if (!forgedRpc.error?.message.includes("PLACEMENT_TEMPLATE_DOCUMENT_INVALID")) {
      fail("transaction accepted a document from another Signing");
    }
    ok("the transaction itself refuses a document from another Signing");

    const beforeForgedMap = new Set(
      ((await admin.from("signing_draft_fields").select("id").eq("signing_document_id", docGlobal)).data ?? []).map(
        (row) => row.id as string,
      ),
    );
    const forgedMap = await applyPlacementTemplateWithActor(
      agent.actor,
      {
        signingId: signing.id,
        signingDocumentId: docGlobal,
        templateId: personalGlobal,
        requestId: randomUUID(),
        participantMap: { "BUYER:1": seller },
        signingParticipantId: seller,
      } as Parameters<typeof applyPlacementTemplateWithActor>[1],
      admin,
    );
    const { data: forgedRows } = await admin
      .from("signing_draft_fields")
      .select("id, signing_participant_id")
      .eq("signing_document_id", docGlobal);
    const newRows = (forgedRows ?? []).filter((row) => !beforeForgedMap.has(row.id as string));
    if (forgedMap.created !== 1 || newRows.length !== 1 || newRows[0].signing_participant_id !== buyerA) {
      fail(`browser-supplied participant mapping was honored: ${JSON.stringify(newRows)}`);
    }
    ok("browser-supplied participant mapping is ignored: Buyer 1 still maps to Buyer A on the server");

    // Deleting a template keeps applied placements; deleted stays deleted.
    await deletePlacementTemplateWithActor(agent.actor, { templateId: personalV2 }, admin);
    const afterDelete = await previewOf(agent.actor, docV2);
    if (afterDelete.available) fail("deleted template still offered");
    const { count: keptFields } = await admin
      .from("signing_draft_fields")
      .select("id", { count: "exact", head: true })
      .eq("signing_document_id", docV2);
    if (keptFields !== 4) fail("deleting a template changed applied placements");
    await expectDbError("restoring a deleted template", /PLACEMENT_TEMPLATE_DELETED/, () =>
      admin.from("signing_placement_templates").update({ status: "ACTIVE", deleted_at: null }).eq("id", personalV2),
    );
    await expectDbError("adding placements to a deleted template", /PLACEMENT_TEMPLATE_NOT_ACTIVE/, () =>
      admin.from("signing_placement_template_fields").insert({
        template_id: personalV2,
        field_type: "CHECKMARK",
        page_number: 1,
        x: 1,
        y: 1,
        width: 10,
        height: 10,
      }),
    );
    ok("deleted templates are soft-deleted, no longer offered, and leave applied placements untouched");

    const replacement = await createPlacementTemplateWithActor(agent.actor, { formId: formV2, scope: "PERSONAL" }, admin, {
      sessionClient: agent.session,
    });
    if (replacement.templateId === personalV2) fail("replacement reused the deleted template");
    ok("after a soft delete, a new ACTIVE Personal template can be created for the same form version");

    await deletePlacementTemplateWithActor(orgAdmin.actor, { templateId: orgGlobal }, admin);
    const { data: orgDeleted } = await admin
      .from("signing_placement_templates")
      .select("status, deleted_at")
      .eq("id", orgGlobal)
      .single();
    if (orgDeleted?.status !== "DELETED" || !orgDeleted.deleted_at) fail("organization admin delete did not soft-delete");
    ok("the organization admin can delete (soft-delete) the Organization template");

    await admin.from("signings").update({ lifecycle_state: "CANCELLED", cancelled_at: new Date().toISOString() }).eq("id", signing.id);
    await expectSigningError("applying after the Signing left Draft", "FORBIDDEN", () =>
      applyPlacementTemplateWithActor(
        agent.actor,
        { signingId: signing.id, signingDocumentId: docGlobal, templateId: personalGlobal, requestId: randomUUID() },
        admin,
      ),
    );
    const notDraftRpc = await admin.rpc("signing_apply_placement_template", {
      p_signing_id: signing.id,
      p_signing_document_id: docGlobal,
      p_template_id: personalGlobal,
      p_request_id: randomUUID(),
      p_actor_user_id: agent.actor.userId,
    });
    if (!notDraftRpc.error?.message.includes("PLACEMENT_TEMPLATE_NOT_DRAFT")) {
      fail("transaction applied to a non-Draft Signing");
    }
    ok("non-Draft Signings refuse application in both the server and the transaction");

    console.log("\nAll Signing placement template checks passed.");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
