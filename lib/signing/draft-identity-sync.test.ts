import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  brokerSignerIdentityFromSettings,
  contactSignerIdentity,
  isDraftIdentityLive,
  isLinkedParticipant,
  participantIdentitySourceKind,
  userSignerIdentity,
} from "@/lib/signing/draft-participant-sync";
import {
  clampRectToPage,
  dateLinkSourceDisplay,
  newPlacementRect,
  resolveDateLinkSource,
} from "@/lib/signing/draft-field-editor-state";
import type { SigningPreviewField } from "@/lib/signing/preview";
import type { BrokerageSettings } from "@/lib/types/brokerage-settings";
import type { Contact } from "@/lib/types/contact";
import type { Profile } from "@/lib/types/profile";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

const PAGE = { width: 612, height: 792 };

function contact(extra: Partial<Contact> = {}): Contact {
  return {
    id: 7,
    contact_type: "PERSON",
    first_name: "Bea",
    middle_name: null,
    last_name: "Buyer",
    suffix: null,
    preferred_name: null,
    title: null,
    entity_name: null,
    entity_type: null,
    email: " Bea@Example.COM ",
    owner_user_id: "agent-1",
    status: "ACTIVE",
    ...extra,
  } as Contact;
}

function profile(extra: Partial<Profile> = {}): Profile {
  return {
    first_name: "Ann",
    middle_name: null,
    last_name: "Agent",
    preferred_name: null,
    display_name: null,
    email: "profile@example.com",
    ...extra,
  } as Profile;
}

function field(
  id: string,
  fieldType: SigningPreviewField["fieldType"],
  participantId: string,
  extra: Partial<SigningPreviewField> = {},
): SigningPreviewField {
  return {
    id,
    fieldType,
    isRequired: true,
    pageNumber: 1,
    x: 72,
    y: 600,
    width: 160,
    height: 40,
    participantId,
    participantFullName: "Bea Buyer",
    capacityMode: "PERSONAL",
    representedPartyName: null,
    capacityLabel: null,
    capacityWording: null,
    linkedSignatureFieldId: null,
    ...extra,
  };
}

describe("Authoritative Draft participant identity", () => {
  it("classifies the identity source with Contact > User > broker precedence", () => {
    const none = { linked_contact_id: null, linked_user_id: null, linked_brokerage_settings_id: null };
    assert.equal(participantIdentitySourceKind(none), "AD_HOC");
    assert.equal(isLinkedParticipant(none), false);
    assert.equal(participantIdentitySourceKind({ ...none, linked_contact_id: 1 }), "CONTACT");
    assert.equal(participantIdentitySourceKind({ ...none, linked_user_id: "u" }), "USER");
    assert.equal(participantIdentitySourceKind({ ...none, linked_brokerage_settings_id: 3 }), "BROKER");
    assert.equal(
      participantIdentitySourceKind({ linked_contact_id: 1, linked_user_id: "u", linked_brokerage_settings_id: 3 }),
      "CONTACT",
    );
  });

  it("is live only while Draft with no package revision (activation canonizes)", () => {
    assert.equal(isDraftIdentityLive({ lifecycle_state: "DRAFT", current_package_revision_id: null }), true);
    assert.equal(isDraftIdentityLive({ lifecycle_state: "DRAFT", current_package_revision_id: "rev" }), false);
    assert.equal(isDraftIdentityLive({ lifecycle_state: "IN_PROGRESS", current_package_revision_id: "rev" }), false);
    assert.equal(isDraftIdentityLive({ lifecycle_state: "CANCELLED", current_package_revision_id: null }), false);
  });

  it("derives Contact identity from the Contact row and ignores unusable Contacts", () => {
    assert.deepEqual(contactSignerIdentity(contact()), {
      fullName: "Bea Buyer",
      email: "bea@example.com",
    });
    assert.equal(contactSignerIdentity(contact({ preferred_name: "Bee" }))?.fullName, "Bee");
    assert.equal(contactSignerIdentity(contact({ status: "ARCHIVED" })), null);
    assert.equal(contactSignerIdentity(contact({ first_name: null, last_name: null })), null);
    assert.equal(
      contactSignerIdentity(contact({ contact_type: "ENTITY", entity_name: "Acme LLC" }))?.fullName,
      "Acme LLC",
    );
  });

  it("derives Include me identity from the profile, preferring the auth email", () => {
    assert.deepEqual(userSignerIdentity(profile(), "Auth@Example.com"), {
      fullName: "Ann Agent",
      email: "auth@example.com",
    });
    assert.equal(userSignerIdentity(profile(), null)?.email, "profile@example.com");
    assert.equal(userSignerIdentity(profile({ preferred_name: "Annie" }), null)?.fullName, "Annie");
  });

  it("derives Include broker identity from the brokerage profile and requires an email", () => {
    const settings = {
      id: 3,
      broker_first_name: "Bob",
      broker_middle_name: null,
      broker_last_name: "Broker",
      broker_email: "Bob@Brokerage.com",
    } as BrokerageSettings;
    assert.deepEqual(brokerSignerIdentityFromSettings(settings), {
      fullName: "Bob Broker",
      email: "bob@brokerage.com",
    });
    assert.equal(brokerSignerIdentityFromSettings({ ...settings, broker_email: null }), null);
    assert.equal(
      brokerSignerIdentityFromSettings({ ...settings, broker_first_name: null, broker_last_name: null }),
      null,
    );
  });
});

describe("Draft identity sync boundaries (source)", () => {
  const sync = read("lib/signing/draft-participant-sync.ts");
  const participants = read("lib/signing/draft-participants.ts");
  const activation = read("lib/signing/activation.ts");
  const dashboard = read("lib/signing/dashboard.ts");
  const preview = read("lib/signing/preview.ts");
  const sourcePacket = read("lib/signing/source-packet.ts");
  const actions = read("lib/signing/stage3-actions.ts");
  const migration = read(
    "supabase/migrations/20261009120000_native_signing_draft_identity_sync.sql",
  );

  it("never syncs after activation and tolerates the freeze trigger", () => {
    assert.match(sync, /if \(!isDraftIdentityLive\(signing\)\) return/);
    assert.match(sync, /SIGNING_PARTICIPANT_IDENTITY_FROZEN/);
  });

  it("only follows Contacts owned by the Signing's sender/creator or Packet owner", () => {
    assert.match(sync, /allowedContactOwnerIds/);
    assert.match(sync, /!owners\.has\(contact\.owner_user_id\)/);
  });

  it("reads the broker profile only from the Signing's originating organization", () => {
    assert.match(sync, /\.eq\("organization_id", signing\.originating_organization_id\)/);
    assert.match(sync, /\.eq\("status", "ACTIVE"\)/);
  });

  it("rejects manual name/email for linked participants; ad hoc stays editable", () => {
    assert.match(participants, /LINKED_IDENTITY_EDIT_MESSAGE\[source\]/);
    assert.match(participants, /source !== "AD_HOC"/);
    assert.match(participants, /Edit the Contact instead/);
  });

  it("takes a linked Contact's name/email from the Contact, never from the browser", () => {
    const add = participants.slice(participants.indexOf("function addDraftSigningParticipantWithActor"));
    const linkedBranch = add.slice(add.indexOf("} else {"), add.indexOf("const displayOrder"));
    assert.match(linkedBranch, /contactSignerIdentity\(contact as Contact\)/);
    assert.match(linkedBranch, /fullName = identity\.fullName/);
    assert.doesNotMatch(linkedBranch, /input\.fullName|input\.email/);
    assert.match(linkedBranch, /contact\.owner_user_id !== actor\.userId/);
  });

  it("Include me is always the signed-in User; Include broker is the org's active profile", () => {
    assert.match(participants, /linkedUserId: actor\.userId/);
    assert.match(participants, /userSignerIdentity\(actor\.profile, actor\.email\)/);
    assert.match(participants, /fetchActiveBrokerageSettings\(\s*admin,\s*signing\.originating_organization_id/);
    assert.doesNotMatch(actions, /linkedUserId|linkedBrokerageSettingsId/);
  });

  it("records a Signing-scoped suppression when a Packet participant is removed", () => {
    const remove = participants.slice(participants.indexOf("function removeDraftSigningParticipantWithActor"));
    const suppressAt = remove.indexOf("suppressDraftPacketParticipant(");
    assert.ok(suppressAt > 0);
    assert.ok(remove.indexOf("requireManageableDraftSigning") < suppressAt);
    const deleteAt = remove.search(/\.from\("signing_participants"\)\s*\.delete\(\)/);
    assert.ok(deleteAt > suppressAt);
  });

  it("auto-adds only in Draft, skips suppressed Contacts, and never runs at activation", () => {
    const autoAdd = sourcePacket.slice(sourcePacket.indexOf("function autoAddDraftPacketParticipants"));
    assert.match(autoAdd, /signing\.lifecycle_state !== "DRAFT"/);
    assert.match(autoAdd, /current_package_revision_id != null/);
    assert.match(autoAdd, /!suppressed\.has\(party\.linked_contact_id\)/);
    assert.match(autoAdd, /ownedSourcePacketId\(actor, admin, signing\)/);
    assert.doesNotMatch(activation, /autoAddDraftPacketParticipants/);
    assert.match(dashboard, /summary\.lifecycleState === "DRAFT" && summary\.canManage/);
    assert.doesNotMatch(preview, /autoAddDraftPacketParticipants/);
  });

  it("syncs identity before readiness at activation and rejects a frozen-identity mismatch", () => {
    const syncAt = activation.indexOf("syncDraftParticipantIdentities(admin, signing)");
    const readinessAt = activation.indexOf("evaluateSigningReadiness(admin, signing.id");
    const promoteAt = activation.indexOf("promotePackageRevisionFromDraftWithActor(");
    assert.ok(syncAt > 0 && syncAt < readinessAt && readinessAt < promoteAt);
    assert.match(activation, /frozen_full_name !== participant\.full_name/);
    assert.match(activation, /Participant details changed during activation/);
  });

  it("locks the suppression table and freezes identity in the database", () => {
    assert.match(migration, /alter table public\.signing_draft_packet_participant_suppressions force row level security/);
    assert.match(migration, /revoke all on table public\.signing_draft_packet_participant_suppressions from authenticated/);
    assert.match(migration, /revoke all on table public\.signing_draft_packet_participant_suppressions from anon/);
    assert.match(migration, /unique \(signing_id, linked_contact_id\)/);
    assert.match(migration, /SIGNING_PARTICIPANT_SUPPRESSION_NOT_DRAFT/);
    assert.match(migration, /signing_draft_packet_participant_suppressions s\s+where s\.signing_id = p_signing_id/);
    assert.match(migration, /new\.full_name is not distinct from old\.full_name/);
    assert.match(migration, /current_package_revision_id is not null then\s+raise exception 'SIGNING_PARTICIPANT_IDENTITY_FROZEN'/);
    assert.match(migration, /before update of full_name, email on public\.signing_participants/);
  });
});

describe("Placement anchor (new fields)", () => {
  const size = { width: 160, height: 40 };

  it("anchors the left edge at the click, vertically centred", () => {
    for (const type of ["SIGNATURE", "INITIALS", "DATE_SIGNED", "PRINTED_NAME"] as const) {
      assert.deepEqual(newPlacementRect(type, { x: 100, y: 300 }, size, PAGE), {
        x: 100,
        y: 280,
        width: 160,
        height: 40,
      });
    }
  });

  it("keeps a Checkmark centred on the click", () => {
    assert.deepEqual(newPlacementRect("CHECKMARK", { x: 100, y: 300 }, { width: 12, height: 12 }, PAGE), {
      x: 94,
      y: 294,
      width: 12,
      height: 12,
    });
  });

  it("shifts left at full size near the right edge (never shrinks)", () => {
    const rect = newPlacementRect("SIGNATURE", { x: 600, y: 300 }, size, PAGE);
    assert.equal(rect.width, 160);
    assert.equal(rect.x, PAGE.width - 160);
    const top = newPlacementRect("PRINTED_NAME", { x: 10, y: 2 }, size, PAGE);
    assert.equal(top.y, 0);
    assert.equal(top.height, 40);
  });

  it("is computed in PDF units, so zoom does not drift the anchor", () => {
    const fitWidth = newPlacementRect("INITIALS", { x: 250.5, y: 400.25 }, size, PAGE);
    const zoomed = newPlacementRect("INITIALS", { x: 250.5, y: 400.25 }, size, PAGE);
    assert.deepEqual(fitWidth, zoomed);
    assert.equal(fitWidth.x, 250.5);
  });

  it("leaves drag clamping unchanged", () => {
    assert.deepEqual(clampRectToPage({ x: 590, y: 10, width: 160, height: 40 }, PAGE), {
      x: 452,
      y: 10,
      width: 160,
      height: 40,
    });
  });
});

describe("Date Signed click-to-link", () => {
  const fields = [
    field("sig", "SIGNATURE", "p1"),
    field("ini", "INITIALS", "p1", { pageNumber: 1 }),
    field("other", "SIGNATURE", "p2"),
    field("date", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "sig" }),
  ];

  it("resolves only an explicit same-participant Signature or Initials", () => {
    assert.equal(resolveDateLinkSource(fields, "p1", "ini")?.id, "ini");
    assert.equal(resolveDateLinkSource(fields, "p1", "sig")?.id, "sig");
    assert.equal(resolveDateLinkSource(fields, "p1", "other"), null);
    assert.equal(resolveDateLinkSource(fields, "p1", "date"), null);
    assert.equal(resolveDateLinkSource(fields, "p1", ""), null);
    assert.equal(resolveDateLinkSource(fields, "", "ini"), null);
  });

  it("labels the armed source the way the manager sees it", () => {
    assert.equal(dateLinkSourceDisplay({ fieldType: "INITIALS", pageNumber: 1 }), "Initials — Page 1");
    assert.equal(dateLinkSourceDisplay({ fieldType: "SIGNATURE", pageNumber: 3 }), "Signature — Page 3");
  });
});

describe("Prepare Documents editor UX (source)", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");
  const place = dialog.slice(
    dialog.indexOf("function placeFieldAt("),
    dialog.indexOf("async function createField("),
  );

  it("pressing an existing field cancels the armed tool and selects; it never arms a Date link", () => {
    const press = dialog.slice(dialog.indexOf("function pressField("), dialog.indexOf("function dragGroup("));
    assert.match(press, /if \(activeTool\) disarmTool\(\);/);
    assert.doesNotMatch(press, /armDateLink|resolveDateLinkSource/);
    assert.doesNotMatch(dialog, /function armDateLink|dateLinkSourceId/);
  });

  it("never silently links a Date to a default Signature", () => {
    assert.doesNotMatch(place, /preferredSignatureForDate/);
    assert.doesNotMatch(dialog, /preferredSignatureForDate/);
    assert.doesNotMatch(dialog, /Signature on the clicked page \(default\)/);
  });

  it("source overlays stay draggable; the armed tool's ghost follows the cursor", () => {
    assert.doesNotMatch(dialog, /disableDragging=\{/);
    assert.match(dialog, /data-date-link-candidate/);
    assert.match(dialog, /data-date-preview/);
    assert.match(dialog, /data-tool-preview=\{activeTool \?\? undefined\}/);
    assert.match(dialog, /toolRectAt\("DATE_SIGNED", anchor\)/);
  });

  it("Esc, participant and document changes cancel the armed tool", () => {
    const escape = dialog.slice(dialog.indexOf('event.key === "Escape"'));
    assert.ok(escape.indexOf("cancelPasteMode()") < escape.indexOf("disarmTool()"));
    assert.ok(escape.indexOf("disarmTool()") < escape.indexOf("setSelectedFieldIds([])"));
    assert.match(dialog, /function goToDocument[\s\S]*?disarmTool\(\)/);
    assert.match(dialog, /cancelPasteMode\(\);\s+disarmTool\(\);\s+setSelectedParticipantId/);
  });

  it("Copy enters paste mode immediately; the clipboard survives a placement", () => {
    const copy = dialog.slice(dialog.indexOf("function copySelection("), dialog.indexOf("function currentDocumentPageSizes("));
    assert.match(copy, /setClipboard\(items\);\s+startPasteMode\(\s*items/);
    const paste = dialog.slice(dialog.indexOf("function pasteAt("), dialog.indexOf("function pastePreviewRects("));
    assert.match(paste, /setPasteMode\(false\)/);
    assert.doesNotMatch(paste, /setClipboard\(/);
    assert.match(dialog, /onClick=\{\(\) => startPasteMode\(\)\}/);
  });

  it("scrolling re-aims the ghost and never places or cancels", () => {
    const scroll = dialog.slice(dialog.indexOf("function onScroll()"), dialog.indexOf('removeEventListener("scroll"'));
    assert.match(scroll, /pointToPageAnchor\(pointer\.x, pointer\.y\)/);
    assert.doesNotMatch(scroll, /pasteAt|placeFieldAt|cancelPasteMode|disarmTool/);
  });

  it("uses the left-edge anchor for new placements", () => {
    assert.match(place, /newPlacementRect\(tool, point, size, page\)/);
    assert.doesNotMatch(place, /point\.x - size\.width \/ 2/);
  });
});

describe("Packet auto-add and activation boundary UI (source)", () => {
  const panel = read("components/signings/signing-draft-prep-panel.tsx");
  const dashboardPage = read("components/signings/signing-dashboard-page.tsx");

  it("has no Add from Packet click; shows auto-added parties and a Restore list", () => {
    assert.doesNotMatch(panel, /Add from Packet/);
    assert.match(panel, /data-testid="packet-auto-added"/);
    assert.match(panel, /data-testid="removed-packet-participants"/);
    assert.match(panel, /restoreDraftPacketParticipantAction/);
  });

  it("offers name/email editing only for ad hoc participants", () => {
    assert.match(panel, /participant\.identitySource === "AD_HOC" &&\s+editingParticipantId !== participant\.id/);
    assert.match(panel, /From Contact/);
  });

  it("explains that identity is locked after activation and offers Cancel Signing", () => {
    assert.match(dashboardPage, /data-testid="participant-identity-locked"/);
    assert.match(dashboardPage, /cancel this Signing\s+and create a new one/);
    assert.match(dashboardPage, /cancelSigningAction/);
    assert.match(dashboardPage, /Cancel Signing/);
    assert.doesNotMatch(dashboardPage, /Revoke Signing(?! link)|revoke this Signing/);
  });
});
