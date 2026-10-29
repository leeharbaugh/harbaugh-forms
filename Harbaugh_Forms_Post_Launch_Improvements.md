# Harbaugh Forms — Post–Native Signing Launch Improvements

**Status:** Active post-launch backlog. Native Signing went live in production on 2026-10-28.

**Purpose:** Capture enhancements and fixes deferred during the Native Signing production rollout.

The credential rotation and security-incident cleanup from October 26 are complete and recorded historically in `project_status.md` and `decisions.md`; they are not part of this backlog.

**Current priorities**
- **Completed:** 1. Remove the development test title from Create Signing (live in production since 2026-10-29).
- **Remaining, in priority order:** 2. Help & Getting Started (highest-priority unfinished item); 3. Save buttons at both ends of edit screens; 4. Additional Packet transaction statuses; 5. View and restore hidden or inactive Packets; 6. Zero-mapping Form publishing; 7. Scroll to the Edit Form panel.

## 1. Remove the development test title from Create Signing (COMPLETED)

**Status: COMPLETED and live in production (2026-10-29).** Implemented and validated in [PR #67](https://github.com/leeharbaugh/harbaugh-forms/pull/67); released to production on 2026-10-29 at 03:15 UTC. No further work. The Signings page title now starts blank with the placeholder "Enter signing title" and is still required; Create Signing from a Packet keeps its server-derived "Signing — <Packet label>" title. Existing Signings are unchanged. See `project_status.md` "Create Signing default title (2026-10-28; post-launch item 1)".

**Type:** Bug fix — production polish

**Priority:** Was the highest-priority post-launch application fix; completed.

**Observed behavior before the fix:** The Create Signing form defaults its title to **“DEV QA Test Signing”** (hard-coded initial state in `components/signings/signings-list-page.tsx`). That development/QA text is inappropriate in production, where it can end up on real Signings and in participant emails if not changed.

**Expected behavior**
- Remove the hard-coded development title.
- Prefer a meaningful default derived from the source Packet where one is available (for example, the Packet label).
- Otherwise start with a blank title, a helpful placeholder, and appropriate validation so a title is still required before the Signing is created.
- Do not change how existing Signings or their titles are stored.

**Acceptance criteria:** No production Create Signing workflow automatically populates a development or QA test title.

## 2. Help & Getting Started — New User Walkthrough

**Status:** Planned; not yet implemented. Added 2026-10-28.

**Type:** Onboarding and support enhancement

**Priority:** High. The highest-priority remaining enhancement now that item 1 is completed.

**Purpose:** A first-time agent currently has no in-app explanation of how Harbaugh Forms fits together, or of whom to contact for help. A short, always-available Getting Started guide explains the normal Texas real estate workflow, from Contacts through completed Signings, in plain English. The same Help area gives the support phone number and email.

**Scope**
- An accessible **Help** menu or section in Harbaugh Forms, reachable from the main navigation on every signed-in workspace page.
- A concise, friendly **Getting Started** walkthrough (below).
- Support contact information (below).
- **First release:** a simple walkthrough page with numbered steps. An interactive, page-by-page guided tour may be considered later, but is not required for the first release.
- **Out of scope:** changes to the underlying workflows, participant-facing `/sign` pages, and any change to Native Signing behavior.

**Suggested Getting Started walkthrough**
1. **Create Contacts.** Add buyers, sellers and other relevant people.
2. **Create Properties.** Add the properties associated with your transactions.
3. **Review and Add Forms.** Common forms may already be available. You can add your own forms when necessary (optional).
4. **Review and Create Collections.** Group commonly used forms together, and reuse existing Collections (creating your own is optional).
5. **Create Packets.** Select the right contacts, property and forms for a transaction.
6. **Fill and Review Forms.** Verify the populated information, complete any additional fields and review the documents.
7. **Send for Signatures.** Create a Signing, add participants, assign signature fields and send invitations.
8. **Track and Download.** Monitor each Signing's status and retrieve completed documents and audit evidence.

The current navigation order already follows this sequence (Contacts, Properties, Forms, Collections, Packets, Signings). At implementation, review the live functionality and adjust the steps and terminology to match the application. For example, check where Create Signing starts (the Packet page and the Signings page), and whether Representation Agreements or Settings (agent and brokerage profile) belong in the guide.

**Support information** (readily visible in the Help area)
- Phone: **817-881-4768**
- Email: **lee@harbaughbrothers.com**

**User experience goals**
- Understandable by a first-time real estate agent without technical knowledge.
- Brief, plain-English explanations; no technical details.
- Direct links to the relevant application pages where practical.
- Optional setup steps are clearly labeled, especially creating custom Forms and Collections.
- Available again whenever the user needs it, not only on first sign-in.
- Works well on desktop and mobile.

**Suggested acceptance criteria**
- A clearly labeled **Help** entry is reachable from the main navigation on every signed-in workspace page, on desktop and mobile.
- Help opens a Getting Started page with numbered steps that match the application's actual workflow and current page names.
- Each step has a short, plain-English explanation and, where practical, a working link to the relevant page.
- Creating custom Forms and Collections is marked optional, and the guide explains that common forms and Collections may already exist.
- The support phone number and email are shown in Help; the phone number is a tap-to-call link and the email a mail link.
- The page is readable without horizontal scrolling at common mobile widths, and is keyboard- and screen-reader-accessible (headings, ordered list, descriptive link text).
- Help can be reopened at any time; nothing in it is dismissed permanently.
- No change to existing workflows, data, permissions or Native Signing behavior; participant `/sign` pages are unchanged.

## 3. Save buttons at both ends of edit screens

**Type:** Usability enhancement

On applicable, non-auto-saving edit screens, provide a **Save** button at both the top and bottom so users do not need to scroll to save their work.

**Expected behavior**
- Both buttons invoke the same save action and validation.
- Both reflect the same saving, success, and error states; prevent duplicate submissions.
- Apply only where a manual Save action is appropriate. Do not add redundant buttons to auto-save workflows (such as Signing field placements).

## 4. Additional Packet transaction statuses

**Type:** Workflow enhancement

Add transaction lifecycle statuses to distinguish completed deals from transactions that do not proceed. Initial candidates:
- **Closed**
- **Did Not Proceed / Abandoned** (final label to be decided)

**Expected behavior**
- Lifecycle status is separate from record visibility and the existing active/soft-delete state.
- Users can identify closed and abandoned transactions without deleting or hiding them.
- Preserve existing Packet data, generated documents, and history when the status changes.
- Decide how these statuses appear in filters, lists, and Packet detail screens before implementation.

## 5. View and restore hidden or inactive Packets

**Type:** Discoverability and recovery enhancement

Provide a straightforward way to find Packets that are hidden from normal active lists and restore them where permitted.

**Expected behavior**
- Offer a clearly labeled view or filter for hidden/inactive/deleted Packets, using terminology consistent with the current data model.
- Permit authorized users to restore eligible Packets to the normal view.
- Respect organization ownership, existing permissions, and soft-delete rules.
- Review existing delete/restore behavior first so this work fills actual gaps rather than duplicating functionality.

## 6. Fix publishing a Form with zero field mappings

**Type:** Bug fix — Form publishing

**Current observed behavior:** When publishing a Form with **0 field mappings**, a confirmation pop-up offers a checkbox labeled **“Publish anyway with not field mappings.”** However, the **Publish Form** button remains grayed out, preventing publication even when the user intends to publish without mappings.

**Expected behavior**
- Users must be able to intentionally publish a Form with **zero field mappings**.
- In the zero-mappings confirmation dialog, checking the override checkbox enables **Publish Form** (assuming no other legitimate publication blocker exists).
- Clicking the enabled button completes the normal publication flow; leaving the override unchecked does not authorize zero-mapping publication.
- Correct the checkbox wording to **“Publish anyway with no field mappings.”**
- Preserve all existing validation and authorization requirements unrelated to the mapping count.

## 7. Scroll to the Edit Form panel when editing a Form

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

Item 1 is completed and live in production. Items 2–7 are **not yet implemented**. Item 2, Help & Getting Started, is the highest-priority remaining enhancement (Lee's direction, 2026-10-28). Reprioritize items 3–7 based on actual use; the zero-mapping publishing bug may merit earlier attention if it blocks routine Form publishing.

For each item when work begins, have Cursor:
1. Read `project_status.md` and `decisions.md` to establish the current repository state and existing design decisions.
2. Confirm the current behavior and avoid duplicating functionality that already exists.
3. Implement a focused change with appropriate regression coverage.
4. Update `project_status.md` and `decisions.md` to reflect the implementation and any durable decisions.
5. Follow the established PR, validation, and production-deployment approval process.

Changes that affect Native Signing participants also follow the decision “Material technical changes affecting Native Signing participants follow a manual release procedure”.
