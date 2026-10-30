# Harbaugh Forms — Post–Native Signing Launch Improvements

**Status:** Active post-launch backlog. Native Signing went live in production on 2026-10-28.

**Purpose:** Capture enhancements and fixes deferred during the Native Signing production rollout.

The credential rotation and security-incident cleanup from October 26 are complete and recorded historically in `project_status.md` and `decisions.md`; they are not part of this backlog.

**Current priorities**
- **Completed:** 1. Remove the development test title from Create Signing (live in production since 2026-10-29).
- **Remaining, in priority order:**
  2. **Critical — Correct multi-agent identity resolution**: live in production, and packet #13's agent fields are remediated. Close-out is pending the related template-footer issue (item 10).
  10. **High — Remove personalized footers from shared PDF templates**: method and development pilot done; production not started.
  3. Help & Getting Started (highest-priority enhancement).
  4. Save buttons at both ends of edit screens.
  5. Additional Packet transaction statuses.
  6. View and restore hidden or inactive Packets.
  7. Zero-mapping Form publishing.
  8. Scroll to the Edit Form panel.
- **Deferred:** 9. Warn users when required agent identity information is incomplete.

Items were renumbered on 2026-10-29 when item 2 was inserted. Help & Getting Started was item 2, and items 4–8 were 3–7.

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

## 2. Critical — Correct multi-agent identity resolution

**Status:** Merged to `main` as `1ebbca9` ([PR #70](https://github.com/leeharbaugh/harbaugh-forms/pull/70)). **Live in production** since 2026-10-30 04:29 UTC on `dpl_DhZ5sJg7tL949hdcQEviLAfAAvpz`, validated on both domains. Susan's packet #13 agent fields were remediated and verified on 2026-10-30: all 6 now show her details, with nothing else changed. **Not marked complete:** a related finding needs Lee's decision first. 33 Global form templates have Lee's name or phone printed into the blank PDF (see `project_status.md`). Added 2026-10-29.

**Type:** Bug fix — production correctness

**Priority:** Critical. Ahead of every enhancement, including Help & Getting Started.

**Confirmed root cause:**
- **Where values came from:** agent fields on forms resolved from the brokerage's single shared `brokerage_settings` row, instead of the packet owner's own `user_agent_settings` row. Both the mapped agent fields and the key-based fallback in `lib/field-resolver.ts` did this.
- **What the shared row holds:** one agent's details (Lee's) for the whole brokerage.
- **Settings had the same flaw:** its "Agent Profile" read and saved the shared row, which only app admins may save, so other agents could neither see nor correct their own details.

**Confirmed impact:** Susan P.'s production packet #13 (Draft, 6 forms) has 6 agent field values: full name, license number, email and phone. All 6 are Lee's details, not hers. Lee's own packets are correct, and Signing participant identity is not affected.

**Correction (PR #70, development only):**
- **Resolution:** agent fields resolve from the packet owner's own ACTIVE agent profile, never the viewer's, with no cross-agent fallback. Brokerage fields stay shared.
- **Settings:** "My Agent Profile" edits the signed-in user's own profile, and the Brokerage Profile is read-only for non-admins.
- **No migration or RLS change.**

**Remaining requirements:**
- **Production release:** deploy the fix to production through the established PR, validation and promotion approvals.
- **Remediate packet #13** after release, using the procedure in `project_status.md` "Multi-agent identity fix (2026-10-29; development only)": a read-only snapshot, then Refresh Values only on the forms that carry agent fields, then a read-only check.
- **Preserve history:**
  - No automatic rewrite of saved field values.
  - Manual overrides stay unchanged.
  - Final or Signed forms and historical documents stay unchanged.
- **Verify every changed value:** compare every field instance that changed during remediation with the snapshot, and review any change other than the 6 agent values with Susan before the packet is used.

**Completion criteria:**
- The fix is deployed to production and validated on both domains.
- Production identity resolution is verified: agents resolve their own details, and brokerage details stay shared.
- Susan's packet #13 is corrected, every changed field instance is verified, and the downloaded PDFs show her name, license number, email and phone.

## 3. Help & Getting Started — New User Walkthrough

**Status:** Planned; not yet implemented. Added 2026-10-28.

**Type:** Onboarding and support enhancement

**Priority:** High. The highest-priority enhancement, immediately after the critical multi-agent identity correction (item 2).

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

## 4. Save buttons at both ends of edit screens

**Type:** Usability enhancement

On applicable, non-auto-saving edit screens, provide a **Save** button at both the top and bottom so users do not need to scroll to save their work.

**Expected behavior**
- Both buttons invoke the same save action and validation.
- Both reflect the same saving, success, and error states; prevent duplicate submissions.
- Apply only where a manual Save action is appropriate. Do not add redundant buttons to auto-save workflows (such as Signing field placements).

## 5. Additional Packet transaction statuses

**Type:** Workflow enhancement

Add transaction lifecycle statuses to distinguish completed deals from transactions that do not proceed. Initial candidates:
- **Closed**
- **Did Not Proceed / Abandoned** (final label to be decided)

**Expected behavior**
- Lifecycle status is separate from record visibility and the existing active/soft-delete state.
- Users can identify closed and abandoned transactions without deleting or hiding them.
- Preserve existing Packet data, generated documents, and history when the status changes.
- Decide how these statuses appear in filters, lists, and Packet detail screens before implementation.

## 6. View and restore hidden or inactive Packets

**Type:** Discoverability and recovery enhancement

Provide a straightforward way to find Packets that are hidden from normal active lists and restore them where permitted.

**Expected behavior**
- Offer a clearly labeled view or filter for hidden/inactive/deleted Packets, using terminology consistent with the current data model.
- Permit authorized users to restore eligible Packets to the normal view.
- Respect organization ownership, existing permissions, and soft-delete rules.
- Review existing delete/restore behavior first so this work fills actual gaps rather than duplicating functionality.

## 7. Fix publishing a Form with zero field mappings

**Type:** Bug fix — Form publishing

**Current observed behavior:** When publishing a Form with **0 field mappings**, a confirmation pop-up offers a checkbox labeled **“Publish anyway with not field mappings.”** However, the **Publish Form** button remains grayed out, preventing publication even when the user intends to publish without mappings.

**Expected behavior**
- Users must be able to intentionally publish a Form with **zero field mappings**.
- In the zero-mappings confirmation dialog, checking the override checkbox enables **Publish Form** (assuming no other legitimate publication blocker exists).
- Clicking the enabled button completes the normal publication flow; leaving the override unchecked does not authorize zero-mapping publication.
- Correct the checkbox wording to **“Publish anyway with no field mappings.”**
- Preserve all existing validation and authorization requirements unrelated to the mapping count.

## 8. Scroll to the Edit Form panel when editing a Form

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

## 9. Warn users when required agent identity information is incomplete

**Status:** Deferred; not designed or implemented. Added 2026-10-29.

**Type:** Usability and data-quality enhancement

**Purpose:** After the multi-agent correction (item 2), a missing personal agent detail leaves the matching form field blank rather than borrowing another agent's details. An agent with an incomplete profile could then produce forms that are missing their own name, license number, email or phone without noticing.

**Scope to decide before implementation:**
- Where a warning appears, for example Settings → My Agent Profile, Fill Form, or the Packet page.
- Which details count as required.
- How it is worded.

The warning must stay **non-blocking** unless Lee approves otherwise. It must never fill in another agent's details.

## 10. High — Remove personalized footers from shared PDF templates

**Status:** Removal method implemented and piloted in development on TXR-1501. Production templates not changed. **Not complete.** Added 2026-10-30; Lee approved removing the personalized footer information.

**Type:** Data correctness — shared form templates

**Priority:** High, immediately after item 2: the footer puts one agent's identity on every agent's documents.

**Root cause:** Texas REALTORS® inserts the downloading member's details into a footer when a form is downloaded, so templates downloaded under Lee's membership carry his brokerage address, phone and name.

**PDF structure:** these files are TCPDF wrappers. Each page draws the original form as an imported Form XObject, then two separate top-level text blocks (7 pt, y about 14–34) for the member footer. The form's own wording, revision line, initials line and page number are inside the imported XObject and are not affected.

**Method:** `lib/forms/template-personalization-redaction.ts` plus the local tool `scripts/redact-template-personalization.ts`, with personal-identifier patterns supplied from a private file outside the repository.
- **Removes:** only matching top-level text blocks. Their operators and strings are deleted, the stream is rewritten in place, and a white rectangle fills each removed box.
- **Refuses, writing nothing:** if any match is elsewhere (imported form content, annotations, metadata), on unsupported constructs, or if anything is still extractable afterwards.

**Pilot (TXR-1501, form #1):**
- 12 blocks removed, 2 on each of 6 pages.
- Personal text no longer found by text extraction or in any raw object.
- Geometry, boxes, rotation, imported XObjects, annotations and metadata unchanged.
- Pixels outside the footer boxes identical, and the white fill covers nothing.
- All 55 mappings fill at identical positions.
- In development, the normal Unpublish → Replace PDF → Publish workflow succeeded: a new packet form got the clean copy, Fill Form and Download PDF worked, agent fields showed the packet owner's own details, and Map Fields rendered.

**Inventory (production, read-only):**
- 33 of 49 active templates carry the footer, all Global TXR templates.
- 32 are TCPDF files with the identical structure and are cleanly removable by the same method.
- TXR-1506 (pdf-lib-produced, footer mixed into the page's own content) is refused by the method and needs individual treatment, such as a clean re-download.

**Existing packets:** packet forms keep their own PDF copy, made at creation, so replacing a template changes only packet forms created afterwards.
- 24 existing copies from affected templates still carry the footer: 23 Draft, 1 Final, 0 Signed.
- 5 belong to Susan's packet #13 (Draft); the rest are Lee's own.

**Remaining requirements:**
- Lee approval for production.
- Per-template Unpublish → Replace PDF → Publish, with a backup and a distinct filename.
- Production validation.
- A decision on existing Draft copies, at least Susan's 5. Final copies stay unchanged.

**Completion criteria:**
- Every affected active template is replaced and validated in production.
- New packet forms carry no personalized footer.
- The agreed handling of existing copies is done and verified.

## Implementation workflow

Item 1 is completed and live in production. Items 2–9 are **not complete**.
- **Item 2:** the critical multi-agent identity correction, implemented in development (PR #70) and awaiting production release and packet remediation. It comes before all enhancements.
- **Item 3:** Help & Getting Started, the highest-priority enhancement (Lee's direction, 2026-10-28 and 2026-10-29).
- **Items 4–8:** reprioritize based on actual use. The zero-mapping publishing bug may merit earlier attention if it blocks routine Form publishing.
- **Item 9:** deferred.
- **Item 10:** the template-footer removal, ranked immediately after item 2; production rollout awaits Lee's approval.

For each item when work begins, have Cursor:
1. Read `project_status.md` and `decisions.md` to establish the current repository state and existing design decisions.
2. Confirm the current behavior and avoid duplicating functionality that already exists.
3. Implement a focused change with appropriate regression coverage.
4. Update `project_status.md` and `decisions.md` to reflect the implementation and any durable decisions.
5. Follow the established PR, validation, and production-deployment approval process.

Changes that affect Native Signing participants also follow the decision “Material technical changes affecting Native Signing participants follow a manual release procedure”.
