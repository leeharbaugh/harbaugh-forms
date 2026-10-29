# Harbaugh Forms — Post–Native Signing Launch Improvements

**Status:** Active post-launch backlog. Native Signing went live in production on 2026-10-28.

**Purpose:** Capture enhancements and fixes deferred during the Native Signing production rollout.

The credential rotation and security-incident cleanup from October 26 are complete and recorded historically in `project_status.md` and `decisions.md`; they are not part of this backlog.

## 1. Remove the development test title from Create Signing

**Status: COMPLETED (2026-10-28).** Implemented and validated; production promotion is Lee's separate manual step. The Signings page title now starts blank with the placeholder "Enter signing title" and is still required; Create Signing from a Packet keeps its server-derived "Signing — <Packet label>" title. Existing Signings are unchanged. See `project_status.md` "Create Signing default title (2026-10-28; post-launch item 1)".

**Type:** Bug fix — production polish

**Priority:** Highest-priority post-launch application fix.

**Observed behavior before the fix:** The Create Signing form defaults its title to **“DEV QA Test Signing”** (hard-coded initial state in `components/signings/signings-list-page.tsx`). That development/QA text is inappropriate in production, where it can end up on real Signings and in participant emails if not changed.

**Expected behavior**
- Remove the hard-coded development title.
- Prefer a meaningful default derived from the source Packet where one is available (for example, the Packet label).
- Otherwise start with a blank title, a helpful placeholder, and appropriate validation so a title is still required before the Signing is created.
- Do not change how existing Signings or their titles are stored.

**Acceptance criteria:** No production Create Signing workflow automatically populates a development or QA test title.

## 2. Save buttons at both ends of edit screens

**Type:** Usability enhancement

On applicable, non-auto-saving edit screens, provide a **Save** button at both the top and bottom so users do not need to scroll to save their work.

**Expected behavior**
- Both buttons invoke the same save action and validation.
- Both reflect the same saving, success, and error states; prevent duplicate submissions.
- Apply only where a manual Save action is appropriate. Do not add redundant buttons to auto-save workflows (such as Signing field placements).

## 3. Additional Packet transaction statuses

**Type:** Workflow enhancement

Add transaction lifecycle statuses to distinguish completed deals from transactions that do not proceed. Initial candidates:
- **Closed**
- **Did Not Proceed / Abandoned** (final label to be decided)

**Expected behavior**
- Lifecycle status is separate from record visibility and the existing active/soft-delete state.
- Users can identify closed and abandoned transactions without deleting or hiding them.
- Preserve existing Packet data, generated documents, and history when the status changes.
- Decide how these statuses appear in filters, lists, and Packet detail screens before implementation.

## 4. View and restore hidden or inactive Packets

**Type:** Discoverability and recovery enhancement

Provide a straightforward way to find Packets that are hidden from normal active lists and restore them where permitted.

**Expected behavior**
- Offer a clearly labeled view or filter for hidden/inactive/deleted Packets, using terminology consistent with the current data model.
- Permit authorized users to restore eligible Packets to the normal view.
- Respect organization ownership, existing permissions, and soft-delete rules.
- Review existing delete/restore behavior first so this work fills actual gaps rather than duplicating functionality.

## 5. Fix publishing a Form with zero field mappings

**Type:** Bug fix — Form publishing

**Current observed behavior:** When publishing a Form with **0 field mappings**, a confirmation pop-up offers a checkbox labeled **“Publish anyway with not field mappings.”** However, the **Publish Form** button remains grayed out, preventing publication even when the user intends to publish without mappings.

**Expected behavior**
- Users must be able to intentionally publish a Form with **zero field mappings**.
- In the zero-mappings confirmation dialog, checking the override checkbox enables **Publish Form** (assuming no other legitimate publication blocker exists).
- Clicking the enabled button completes the normal publication flow; leaving the override unchecked does not authorize zero-mapping publication.
- Correct the checkbox wording to **“Publish anyway with no field mappings.”**
- Preserve all existing validation and authorization requirements unrelated to the mapping count.

## 6. Scroll to the Edit Form panel when editing a Form

**Type:** Bug fix — Forms navigation / usability

**Steps to reproduce**
1. Open **Forms**.
2. Scroll down the Forms list to a Form farther down the page.
3. Choose **Edit Form** for that Form.

**Current observed behavior:** The Edit Form panel opens near the top of the page, but the page scrolls upward only a little instead of bringing that panel into view. The user must manually scroll to the top to reach the editor.

**Expected behavior**
- After selecting **Edit Form**, automatically scroll to the newly opened editor so its heading and primary controls are visible without manual scrolling.
- The behavior should work regardless of how far down the Forms list the selected Form appears.
- Use a reliable target on the editor panel rather than an arbitrary fixed scroll distance; account for any sticky header so the editor is not obscured.
- Preserve the selected Form and its loaded data. Avoid unnecessary scrolling when the editor is already visible.

## Implementation workflow

Item 1 is completed. Items 2–6 are **not yet implemented**. Reprioritize the remaining items based on actual use; the zero-mapping publishing bug may merit earlier attention if it blocks routine Form publishing.

For each item when work begins, have Cursor:
1. Read `project_status.md` and `decisions.md` to establish the current repository state and existing design decisions.
2. Confirm the current behavior and avoid duplicating functionality that already exists.
3. Implement a focused change with appropriate regression coverage.
4. Update `project_status.md` and `decisions.md` to reflect the implementation and any durable decisions.
5. Follow the established PR, validation, and production-deployment approval process.

Changes that affect Native Signing participants also follow the decision “Material technical changes affecting Native Signing participants follow a manual release procedure”.
