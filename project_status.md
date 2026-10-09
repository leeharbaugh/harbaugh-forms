# Harbaugh Forms — Project Status

**As of:** 2026-10-09 (PR #46 correctness tranche implemented and QA'd in development. Create Signing eligibility now comes from one server helper, and ineligible Packets show a disabled control with the reason. The Packets list and the selector agree: Inactive is listed, and only Deleted waits for Show deleted. Opening a Draft Signing completes Packet auto-add and identity sync before the first paint. Signing rename works in every lifecycle state and records a history event. New dev-only migration `20261009130000`. PR still open and unmerged, Gate A paused, production untouched. Next after Lee's approval: the separate dependency-advisory PR from `main`. See "Correctness tranche" below. Earlier: 2026-10-08, late (PR #46 Draft polish tranche implemented and QA'd in development: Packet parties auto-add while Draft with per-Signing removal suppression and Restore; linked participant identity live from Contact / profile / brokerage profile while Draft and canonized at activation, with Cancel + new Signing as the only post-activation correction; Date Signed click-to-link; Copy enters paste mode immediately; new fields anchor at the click's left edge. New dev-only migration `20261009120000`. PR still open and unmerged, Gate A paused, production untouched. See "Draft polish tranche" below. Earlier the same day: PR #46 Draft-preparation tranche implemented and QA'd in development: additive Add from Packet, participant roles, Include me / Include broker, Initials-linked Date Signed, click-anchored paste, Printed Name and Checkmark prepared content, Quick Fields removed; new dev-only migration `20261008120000`; PR still open and unmerged, Gate A paused, production untouched; see "Draft-preparation tranche" below. Earlier, 2026-10-05: PR #46 document-visible participant ceremony + read-only typed Signature implemented and browser-QA'd in development; ready for Lee's re-QA; PR still open and unmerged, Gate A paused, production untouched; new upstream `npm audit` advisories (source-map-js / postcss, braces) recorded for a separate dependency PR, see "Lee's manual QA findings and document-visible ceremony tranche" below. Earlier, 2026-10-02: PR #46 brought up to date with `main` `7733493` by merge commit `8769993` (Next.js 16.3.6, no conflicts left, full revalidation and ceremony browser regression pass); PR still open, awaiting Lee's manual re-QA, manager completed-document access is a pre-production blocker, see "PR #46 merged with current main" below; Native Signing participant ceremony QA complete on PR #46 at `3f92e48`: four ceremony defects fixed; packet Created/Updated timestamps fixed to Central time with CDT/CST, PR #52 squash-merged to `main` as `7733493`, live in production via hotfix `3e5eaa3` (= `c25e4c3` + PR #52 code only), deployment `dpl_E9HTxf45epr8ckKifivWCPNgpFAU`, rollback `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`; dev-only `brace-expansion` advisories remediated by lockfile-only PR #51, squash-merged to `main` as `edfc5a7`, full lockfile audit clean, not deployed (dev-only, no production effect); admin-page React #418 hydration fix live in production via hotfix `c25e4c3` (= `2a92d82` + fix), deployment `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`, rollback `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf`; PR #50 squash-merged to `main` as `c2a490a` on 2026-10-02; Next.js 16.3.6 security patch for GHSA-vcvr-r3jv-pc5j is live in production via hotfix `2a92d82` (= `a87b1aa` + dependency change only; deployment `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf`); PR #49 squash-merged to `main` as `9f00a80` on 2026-10-02. Earlier, 2026-09-30: Native Signing development and QA remain the active workstream; work paused briefly for the duplicate packet forms hotfix, now live in production. Resume Native Signing development/QA from the state recorded below. Production is running the isolated hotfix, not `main`; production Native Signing remains unavailable.)

## Current State

### Correctness tranche (2026-10-09; PR #46)

**Status:** Implemented and QA'd on [PR #46](https://github.com/leeharbaugh/harbaugh-forms/pull/46) (open, unmerged; started at `f559d5e`). Development only (`ewxsxwzezhkeawnjvigx`): migration `20261009130000_native_signing_draft_auto_add_marker.sql` is applied to dev only. Production Supabase, Vercel, env, email and Cron are untouched. Native Signing is off in production, Gate A is paused, and PR #46 is not merged.

**Root causes and fixes.**

- **Packet #21 had no Create Signing control.** The Packet page hid the button client-side unless `owner_user_id === currentUserId`. #21 is owned by `leeharbaugh@yahoo.com`; `lee@leeharbaugh.com` sees it as an administrator. The existing rule correctly denies a non-owner, but the page hid the control with no explanation.
  - Fix: one helper, `lib/signing/packet-signing-eligibility.ts`, returns `{eligible, reasonCode, message}`. The Packet page now shows the button disabled with "Create Signing unavailable: Only the Packet's owner can create a Signing from it."
  - No new criteria were invented: not Deleted, owner only, originating brokerage required, and multiple Signings per Packet still allowed.
- **Packet #12 was selectable but not listed.** #12 is Inactive. The Packets list queried `status = ACTIVE` (or Active + Deleted with Show deleted), while the selector excluded only Deleted.
  - Fix: the list shows Active and Inactive, with an Inactive badge, and only Deleted waits for Show deleted. The selector and every server path use the same helper.
  - Soft-delete behavior. Before: list Active only; Show deleted added Deleted; Inactive never listed. After: list Active + Inactive; Show deleted adds Deleted; the selector offers Active + Inactive; Deleted is rejected for Create and binding.
- **The Draft was stale on open.** At `f559d5e`, the Signing page rendered an empty shell and loaded in a client `useEffect`. Server actions run one at a time, so the load queued behind the prep panel's mount actions. `cacheComponents` also keeps a visited route mounted, so coming back did not reload. New participants and Contact name/email changes appeared only after a manual reload.
  - Fix: the page and the Signings list render from server data. The page runs authorize, then (if Draft) auto-add, then identity sync, then load, all before rendering. A push navigation adopts the new payload, and Back/Forward refreshes once (`useHistoryRestoreRefresh`: `traverse` event plus unchanged `bfcacheId`). There are no timers, polling or reloads.
  - A render can run more than once (in development an extra render may be discarded), so the "Added from the source Packet" notice was lost whenever another render did the add. Auto-add now sets `signing_participants.auto_added_from_packet_at` in the same transaction as the insert, and the notice lists marked participants still present. This supersedes the per-Signing client accumulation noted in the Draft polish tranche.
- **Signing rename.** Operational metadata, allowed in every lifecycle state:
  - Authority is existing manage authority only. Once finished, that means an eligible brokerage admin, active primary or co-agent, or active TC. No Global Admin bypass, and authorization runs before the write.
  - Only `signings.title` changes. One BUSINESS `SIGNING_TITLE_UPDATED` event records the actor, old and new name, lifecycle state and timestamp, with no links or tokens.
  - UI: an inline **Rename** form in the dashboard header (prefilled, trimmed, required, 200 characters max, Save / Cancel, no navigation). The participant ceremony has none.

**Verification (2026-10-09, development).**

- Browser QA (throwaway tranche script, 38/38) with the real Packets:
  - #21: the control is disabled with the owner reason.
  - #12: listed with an Inactive badge; Create enabled.
  - Sync timings, with the change present on the first render: new Packet participant via link about 2.2 s; Contact name and email change on direct open about 2.3 s; Back refresh about 2.4 s.
  - Rename across Draft, In Progress and Complete: the list updates immediately and persists across reload. The participant link still works after the In Progress rename, and the ceremony completes. There are three history events, carrying the actor, old/new name and timestamp, with no links.
- Committed browser QA passed: Prepare (87 checks, including the auto-add notice after reload), ceremony and link-ops. All had zero console / page / server errors.
- Dev validators passed:
  - draft-prep 75. New checks: Inactive allowed twice; Deleted, another brokerage's admin and outsiders denied; the selector is a subset of the list; Draft rename authority and events; the auto-add marker.
  - completion-delivery 32. New checks: rename In Progress and Complete with an evidence snapshot unchanged; blank and 201-character names rejected.
  - Also: stage1 57, stage2 22, stage3 24, stage4 56, tc-authority 27, ceremony 42, stage6 14, recovery-access 22, production-readiness `--target=dev` (inventory 26).
- Suites 51/53 (draft-prep 161 including the new `manager-correctness.test.ts`, production-readiness 56).
  - Stage 1 / Stage 2 fail under `npm run` on a pre-existing `feature-gate.test.ts` ERR_MODULE_NOT_FOUND (`lib/supabase/project-guard`), reproduced on an untouched `f559d5e` worktree.
  - tsc, changed-path ESLint, `git diff --check` and `build:validate` are clean. Full-tree ESLint has 5 errors and 10 warnings, all in untouched files.
- **Dependency advisories (unchanged, not remediated in this tranche):** `npm audit --omit=dev` 3 high (`next`, `sharp`, `source-map-js`); full audit 12 (10 high, 2 moderate).
- **Dev data hygiene:** the completion-delivery validator cleanup was fixed (FK order). It had been leaking fixtures, and about 90 pre-existing "CompDel" Signings (stamps 1789852865515 to 1791515514425) remain in dev for a separate cleanup. All fixtures from this tranche were removed.
- **Flake noted:** one uninstrumented first Back-navigation run failed once and did not reproduce in three instrumented runs.

**Backlog.** **NEXT, after Lee approves this tranche:** the separate dependency-advisory investigation/remediation PR from current `main`, not another Signing feature tranche. Then the earlier backlog: cancellation emails, ceremony UX, Archive Signing, Placement Templates, findings 4 / 7 / 8 / 9, DAST R11 and Gate A.

**Remaining before merge.** Lee's manual QA covering:
- #21 shows the disabled reason, and #12 is listed;
- Create from an Inactive Packet;
- open a Draft after adding a Packet party or editing a Contact;
- Back navigation;
- rename in Draft, In Progress and Complete, with the history check.

### Draft polish tranche (2026-10-08; PR #46)

**Status:** Implemented and QA'd on [PR #46](https://github.com/leeharbaugh/harbaugh-forms/pull/46) (open, unmerged; started at `ef43894`). Addresses Lee's QA of the Draft-preparation tranche. Development only (`ewxsxwzezhkeawnjvigx`): migration `20261009120000_native_signing_draft_identity_sync.sql` applied to dev only. Production Supabase, Vercel, env, email and Cron are untouched; Native Signing is off in production; Gate A is paused; PR #46 is not merged.

- **Packet auto-add.** While Draft (no package revision) with an owned source Packet, eligible Packet parties not yet linked are added when the dashboard loads. There is no popup or click, matching is by Contact id only, and ad hoc / agent / broker participants are preserved with no duplicates. Authority is checked before elevation, and nothing syncs after activation. A notice names who was added. The **Add from Packet** button and notice are gone.
- **Removal suppression.** Removing a Contact-linked participant records a Signing-scoped suppression (`signing_draft_packet_participant_suppressions`: Draft-only trigger, forced RLS with deny policies, no client grants). Auto-add skips that Contact until **Restore**, which re-adds them once. The Contact and Packet are untouched. Switching Packets clears the suppressions. The same Packet on another Signing imports normally.
- **Live identity while Draft.** Contact-linked rows follow the Contact (only the sender's, the creator's or the Packet owner's Contacts). **Include me** follows the agent profile and auth email, and **Include broker** follows the organization's active brokerage profile. Sync runs on the dashboard, Prepare Documents and activation loads. Rows show "From Contact" / "From your profile" / "From brokerage profile" / "Entered here".
- **No overrides for linked rows.** The server rejects linked name/email edits, and a linked add ignores browser identity and refuses a duplicate Contact. Ad hoc rows have **Edit details** (name / email). Role stays editable.
- **Activation canonizes identity.** Send / Begin In-Person syncs, freezes the identity into the revision and re-checks the live row against it (mismatch rolls back). The trigger `signing_participants_freeze_identity` rejects any later name or email change. Printed Name and labels show the current name in Draft and are baked at activation.
- **Post-activation correction = Cancel + new Signing.** The In Progress dashboard shows a "Participant details are locked…" note and a **Cancel Signing** button (confirmation, "Keep Signing"). After cancelling it says "Signing cancelled. Create a new Signing to send corrected documents." The old pre-first-mark identity correction path no longer exists for name/email.
- **Date Signed click-to-link.** Root cause: with the Date tool, clicking a Signature/Initials only selected it, and the Date was placed unlinked or on a guessed source. Now the click arms "Linked to: Initials — Page 1", an amber Date ghost follows the pointer, and the next page click places the linked Date. Esc, a type / participant / document change cancels; another participant's field fails visibly; the Link to select converges on the same state.
- **Copy enters paste mode.** Root cause: Copy only filled the clipboard, so a second Paste step was needed. Copy now arms paste mode at once. The ghost follows the pointer across scrolls without placing or cancelling. One click places the copy once; the clipboard remains for Paste / Ctrl+V; Esc cancels.
- **Left-edge anchor.** A new field's left edge sits at the click x and its vertical centre at the click y. It is clamped by sliding, never shrinking. Checkmark stays centred on its box; paste keeps its centre anchor. This is zoom-independent.

**Verification (2026-10-08, development).**

- Browser QA `scripts/qa-signing-prepare-browser.ts` passed with zero console / page / hydration / server errors. Covered: auto-add on reload (no click, no popup, no duplicate on a second reload); remove → not re-added, Contact untouched → Restore once; identity labels, with no edit UI on linked rows and an ad hoc email edit; agent profile and broker profile changes flowing; left-edge anchor (Signature, Initials, Date, Printed Name, the printed lines) at fit and at 125% zoom; right-edge clamp at full width; Copy entering paste mode; Esc keeping the clipboard; Ctrl+V and Paste re-entering; the ghost moving to page 2 on wheel scroll without placing; one click = one group; linked pairs kept; Lee's exact Date flow (Date Signed → click Initials → "Linked to: Initials — Page 1" → ghost follows → click places a linked Date at the click); Esc / ineligible source / participant change / type change / Link to select; Contact rename + email flowing to the participant, the Printed Name and the Signature preview label.
- Ceremony browser QA passed, including the new Signing D: a Contact rename flows while Draft; after Send the locked note shows, there is no edit UI, and a Contact change does not reach the participant; Cancel Signing (Keep Signing keeps it, confirm → CANCELLED). Zero noise. Link-ops browser QA passed.
- Dev validators passed: draft-prep (auto-add, outsider rejection, suppression and Restore authorization, browser-key insert rejected, Contact / profile / broker sync, override rejection, cancelled-Signing writes rejected by action and database), completion-delivery (Contact-linked Printed Name baked as renamed, then frozen against Contact edits, direct DB updates and the action), stage1, stage2, stage3 (suppressions table browser-denied), stage4, stage6, ceremony, tc-authority, recovery-access, production-readiness `--target=dev` (inventory 25).
- Suites: draft-prep 138, ceremony 87 (includes client-boundary), stage3 11, stage4 50, stage6 30, tc-authority 31, completion-delivery 12, recovery-access 7, production-readiness 56. Stage 1 / 2 pass under tsx (24/24); the plain-node runner still hits the known extensionless-import issue. tsc, changed-path ESLint, `git diff --check` and `build:validate` are clean.
- **Dependency advisories (unchanged, not remediated):** `npm audit --omit=dev` 3 high (`next` 16.0.0–16.3.7, `sharp` <0.35.5, `source-map-js` ≤1.2.1); full audit 12 (10 high, 2 moderate, adds `postcss-selector-parser` / `postcss-nested`). For the separate dependency PR.
- Fixed during QA: in development, React Strict Mode runs the dashboard's first load twice, so the load that auto-added a party could be discarded and the notice lost. The notice now accumulates per Signing (and lists only participants still present).

**Known gaps / backlog.**

- **Cancellation:** participants are not emailed when a Signing is cancelled from the dashboard.
- **Ceremony UX:** fixed prepared initials / adoption simplification, a larger Fill-Form-style viewer, first-field auto-scroll and guidance, Finish and done-page wording, Your Fields Remove / Replace navigation, and Lee's manual QA of remote Exit / Decline.
- **Signing list:** Archive Signing.
- **Templates:** Signing Placement Templates.
- **Completed Signing:** the copy-recipient message (finding 7), the pending/failed work explanation (finding 8), and manager View / Download (finding 9).
- **Pre-production:** legal disclosure text (finding 4), dependency advisories, a broader pre-first-mark amendment manager UI if still wanted for non-identity changes, DAST R11, and Gate A.

**Remaining before merge.** Lee's manual QA of this tranche: auto-add / remove / Restore; a Contact rename while Draft; Include me / broker; the Date click flow; Copy → click; anchors; Send, then a Contact edit (it must not change), then Cancel Signing.

### Draft-preparation tranche (2026-10-08; PR #46)

**Status:** Implemented and QA'd on [PR #46](https://github.com/leeharbaugh/harbaugh-forms/pull/46) (open, unmerged; started at `2f8d3f2`). Closes Lee's QA findings 1, 2 and 3 (backlog table below). Development only (`ewxsxwzezhkeawnjvigx`): migration `20261008120000_native_signing_draft_prep_roles_prepared_content.sql` applied to dev only; production Supabase, Vercel, env, email and Cron untouched; Native Signing off in production; Gate A paused; PR #46 not merged.

- **Add from Packet (finding 1).** While Draft, parties added to the source Packet later show a notice ("The source Packet has N new participant(s)") and are added only with **Add from Packet**. Additive, matched by linked Contact; never deletes, merges or overwrites participants (manual names, roles, capacity and wording kept); only the actor's own contacts; idempotent; nothing syncs after activation.
- **Quick Fields removed (finding 2).** No more fixed-coordinate **Add default fields**; placement is visual only.
- **Participant roles.** `role_code` Buyer / Seller / Tenant / Landlord / Agent / Broker / Other plus the optional label; required when adding, editable in Draft, Packet roles mapped (unmapped → Other), frozen at activation into `frozen_role_code`. Option labels read "Name — Role · label". Role is never identity proof or authority.
- **Include me / Include broker.** Real participants (Agent / Broker) from the server session profile or the organization's active brokerage profile; deduped by unique indexes; broker option hidden without a broker name + email; never another organization's broker; no inferred authority.
- **Initials-linked Date Signed.** A deliberately added Date Signed may link to a same-participant Initials (Signature still auto-pairs, Initials never do). Remove / reassign / type-change rules follow the source; the ceremony applies the date with the Initials (sender-local), removal takes it out of effect, reapply gives a fresh date. Database triggers enforce the link in Draft and revision fields.
- **Click-anchored paste.** Paste (button or Ctrl/⌘+V) enters a paste mode with a ghost preview; the click anchors the group (geometry kept, clamped to the page). Esc, a tool change or a participant change cancels; a rejected paste stays in the mode; no extra field is created.
- **Printed Name and Checkmark (finding 3).** Manager-prepared content in `signing_draft_prepared_content` (forced RLS, deny policies, Draft-only trigger), baked into the prepared document version at activation; the final PDF derives from it. Never fields, adopted marks, placements or progress.
- **Readiness.** New blockers: `DATE_SIGNED_NOT_LINKED`, `DATE_SIGNED_PARTICIPANT_MISMATCH` (Signature or Initials source), `PREPARED_CONTENT_DOCUMENT_NOT_INCLUDED`, `PREPARED_CONTENT_PARTICIPANT_UNKNOWN`. Prepared content adds no requirement; every participant still needs a Signature or Initials.
- **Security fix found during the tranche.** Manual participant add accepted a browser-supplied `linkedUserId`; it is now ignored and the link is server-derived only (details in local `security.md`).

**Verification (2026-10-08, development).**

- Browser QA `scripts/qa-signing-prepare-browser.ts` passed: Quick Fields absent; role required; Packet roles; Add from Packet adds only the new party; Include me / Include broker dedupe and disable; role edit persists; paste mode (Esc / button / tool change cancel, Ctrl+V ghosts, click pastes exactly the group, orphan Date rejected); single Initials paste centred on the click; Date linked to Initials; Printed Name follows a rename until activation; Checkmark has no participant; zero console / page / server errors.
- Browser QA `scripts/qa-signing-ceremony-browser.ts` passed (second run): new checks for the Initials-linked Date (apply, remove, reapply) and for Printed Name + Checkmark inside their boxes in the prepared and completed contract with no extra actionable fields; all prior ceremony, finalization, completed-package, link and in-person checks; zero noise. The first run hit one dev-server "The destination stream closed early" line (a client aborting a streamed response mid-navigation, no stack, not reproduced).
- Link-ops browser QA passed.
- Dev validators passed: stage1, stage2, stage3, stage4, ceremony, tc-authority, stage6, completion-delivery (new Draft-prep section: Initials + linked Date + Printed Name + Checkmark through Send, ceremony and final PDF; post-activation prepared write rejected by the action and the database), recovery-access, draft-prep (new: roles, refresh, quick-add, Date→Initials, prepared-content authorization), production-readiness `--target=dev` (inventory 24).
- Validator fixes: the draft-prep and ceremony cleanups now delete `signing_event_chain_state` / `signing_operator_associations` / prepared content (an FK on the event-chain state leaked Signings before); stage3's corrupted-version check now tampers an unchanged document (it was order-dependent: the contract changes in Revision 3, so its old version is correctly not a reuse candidate).
- Suites: draft-prep 106, ceremony 87, stage3 11, stage4 50, tc-authority 31, stage6 30, completion-delivery 12, recovery-access 7, production-readiness 56; stage1 16/16 and stage2 34/34 under tsx (the plain-node runner still hits the known extensionless-import issue). tsc, changed-path ESLint (37 files), `git diff --check`, `build:validate` clean. No leftover QA data.
- **Dependency advisories (upstream, lockfile unchanged):** `npm audit --omit=dev` now 3 high (adds `sharp` / librsvg CVE-2026-96889 to `source-map-js`); full audit 12 (10 high, 2 moderate). Still for the separate dependency PR.

**Follow-ups / backlog (not implemented here).** Ceremony adoption simplification; larger ceremony viewer; auto-scroll; Finish wording; Your Fields navigation; Placement Templates; copy-recipient message (finding 7); pending/failed work explanation (finding 8); manager completed-document View / Download (finding 9, pre-production blocker); production legal / disclosure text (finding 4); dependency remediation PR; Gate A; DAST R11. New: the Add from Packet notice re-offers a Packet participant the manager removed (explicit click still required); consider suppressing removed contacts.

**Remaining before merge.** Lee's manual QA of this tranche (Add from Packet, roles, Include me / broker, Initials + Date, paste mode, Printed Name / Checkmark through a real Send) and of the ceremony; Lee's call on finding 9 timing. Production remains untouched.

### Lee's manual QA findings and document-visible ceremony tranche (2026-10-05; PR #46)

**Status:** Findings 5 and 6 implemented and QA'd on [PR #46](https://github.com/leeharbaugh/harbaugh-forms/pull/46) (open, unmerged; started at `46b5cbc`); ready for Lee's manual re-QA of the participant ceremony. Development only; production untouched, Native Signing off there, Gate A paused, PR #46 not merged. Remaining findings are handled one focused tranche at a time.

**QA backlog from Lee's manual QA:**

| # | Finding | Disposition |
|---|---------|-------------|
| 1 | A Draft Signing does not pick up a contact added to its source Packet after the Signing was created | Done 2026-10-08: Add from Packet (Draft-preparation tranche); now automatic with removal suppression (Draft polish tranche) |
| 2 | Quick Fields / Add default fields in Prepare Documents places fixed-coordinate fields, which is not useful production behavior | Done 2026-10-08: control removed |
| 3 | Prepare Documents cannot add an agent-prepared checkmark (e.g. Wire Fraud Warning Buyer / Seller choice beside signature lines) | Done 2026-10-08: Checkmark and Printed Name prepared content baked into the prepared version |
| 4 | Production electronic-signature consent / disclosure copy is still pending from Lee / legal review | Open: the development placeholder is acceptable only in development; production keeps failing closed on a non-production-ready disclosure |
| 5 | Typed Signature adoption looks like an empty field to fill in | This tranche: pre-populated, read-only exact Signing name; exact-match server rule unchanged |
| 6 | The participant cannot see or read the actual documents while signing | This tranche: document-visible ceremony |
| 7 | Completed Signing Copy Recipients panel says "You cannot manage copy recipients for this Signing." although adding a recipient appeared to work | Investigate later |
| 8 | Completed Signing Operations shows "Pending/failed work: 3" with no explanation | Investigate later |
| 9 | Manager has no View / Download for completed signed documents | Known pre-production blocker; separate focused PR after PR #46 |

**Tranche: document-visible ceremony + read-only typed Signature (findings 5 and 6).**

- **Document-visible ceremony.** After consent, the participant sees the actual prepared PDFs of the frozen/current package revision (`signing_document_versions` in the `versions/` namespace, never Draft snapshots, live `packet_forms`, Fill Form or manager prep state). Every document in the Signing is listed and readable, including documents with none of the participant's fields; free scrolling across all pages; zoom (Fit / 125 / 150 / 200%); "Document i of n · N pages". The participant's own Signature / Initials fields are drawn on the page at their stored PDF coordinates as "Sign here" / "Initial here" targets; clicking one (or focusing it and pressing Enter) calls the existing trusted placement action. Applied marks show in Caveat on the page; Date Signed is a non-interactive system box that fills in with the Signature. A side "Your fields" list shows remaining required fields, Applied / dated status, Show on page, Replace and Remove; "Go to next field" and auto-advance after each placement move focus to the next open field (switching documents when needed). No reading timers or forced scrolling. Other participants' fields are never sent to the browser.
- **Viewer implementation.** `components/sign/ceremony-document-viewer.tsx` (react-pdf, client-only through `next/dynamic` with `ssr: false`, `isEvalSupported: false` so pdf.js never probes eval under the `/sign` CSP); geometry, ordering, next-field and accessible-name helpers in `lib/signing/ceremony-field-view.ts`. Bytes only via the existing session-authorized route `/sign/ceremony/document/{revisionDocumentId}` (no-store, no-referrer, noindex, nosniff; bare 404 on every failure).
- **Typed Signature.** "Your signature" is pre-populated with the exact Signing name and read-only, with help text ("This is set by your Signing and cannot be edited. If it is wrong, exit and contact your agent before signing."). The participant still clicks Adopt signature; the server exact-match rule (`adopted-marks.ts`) is unchanged and still rejects any other value. Initials unchanged: suggested, editable before first use, locked after.
- **Defects found and fixed during this tranche's QA.** (1) The proxy matcher gated `/pdf.worker.min.mjs` behind workspace login, so a participant (no workspace session) could not load the pdf.js worker; the worker file is now excluded from the proxy (test added). (2) A background overview refresh could overwrite initials the participant had just edited (pre-existing race in the shell); edits are now never overwritten (test added). (3) Auto-advance focus was lost because targets are disabled while a placement is pending; focus now lands after the placement settles.
- **Route logging.** Routine document-route denials (ended / superseded / foreign session, wrong Signing, malformed id) no longer log server errors; integrity and infrastructure failures still do (`isRoutineCeremonyDocumentDenial`). Response shape unchanged.
- **Durable ceremony rules preserved.** No participant login; own fields only; server Date Signed; no contractual editing; review every document; server-authoritative marks; first mark freezes the package; Finish / Decline / Exit landings; one active session per participant; 60-minute meaningful-activity inactivity; isolation; private server-mediated bytes (0 browser requests to Supabase / Storage in browser QA).

**Verification (2026-10-05, development `ewxsxwzezhkeawnjvigx`).**

- Browser QA `scripts/qa-signing-ceremony-browser.ts` (2-page contract + 1-page addendum, two remote participants, copy recipient; Signing B Resend / Replace / Revoke / Decline; Signing C in person): all checks passed. Highlights: read-only typed Signature (typing does not change it; server rejects other participant's name, lowercase and doubled name with VALIDATION_FAILED); PDF canvases render real text; wheel scrolling page 1 ↔ 2; overlays within 0.91px of stored geometry at Fit and 125% and at phone 390px / tablet 820px (no page-level horizontal scroll); contract ↔ addendum navigation; Sign here → linked Date Signed on the page; keyboard Enter on the auto-advanced Initials target (accessible name "Initial here: Initials, page 1 of Ceremony QA Contract, required", visible focus ring); page-2 optional Initials Remove from list / reapply on page; Signature Replace / Remove / double-click re-sign (one ACCEPTED placement); reload persistence; Finish → `/sign/done?outcome=finished`; P2 sees only its own fields and none of P1's marks, auto-advances to the addendum Initials; document route 200 = prepared version sha256, 404 for no cookie / forged cookie / unknown id / non-UUID, the old cookie after Finish / Exit / Decline, sessions from replaced or revoked links, and cross-Signing ids; finalization VERIFIED with 2 completed documents (marks inside their field boxes on contract pages 1–2 and the addendum), certificate, completed package (both documents byte-identical), event chains verify; in-person Finish → Return to agent with lock intact → unlock returns to the Signing; secrets never in URLs or logs; zero console / page / hydration errors and zero new server ERROR / WARN lines.
- Link-ops browser QA passed. Ceremony validator passed (new: malformed id INVALID_INPUT, unknown id and cross-Signing CEREMONY_FORBIDDEN, superseded session SESSION_SUPERSEDED, post-Decline session SESSION_EXPIRED). Stage 4, Stage 6 and completion-delivery validators passed. Suites: ceremony 87/87 (now includes `ceremony-document-view.test.ts` and `client-boundary.test.ts`), stage3 11, stage4 50, tc-authority 31, stage6 30, completion-delivery 12, recovery-access 7, draft-prep 64, production-readiness 56; stage1 16/16 and stage2 56/56 under tsx (the npm scripts' plain-node runner still hits the known extensionless-import resolution issue). tsc, changed-path ESLint, `git diff --check`, `build:validate` clean. No leftover QA data.
- **New dependency advisories (not introduced by this tranche; lockfile unchanged since `edfc5a7`):** `npm audit --omit=dev` reports 1 high (`source-map-js` ≤1.2.1 via `postcss`, GHSA-68fv-2mgg-jv7q, build-time CSS tooling); the full lockfile audit reports 10 (8 high, 2 moderate, including `braces` and `postcss-selector-parser`). Recommend a separate lockfile-only dependency PR; not fixed here to keep the tranche scoped.

**Remaining blockers / next.** Lee's manual re-QA of the participant ceremony; production disclosure copy (finding 4); manager completed-document View / Download (finding 9, pre-production blocker); dependency advisory PR; findings 1, 2, 3, 7, 8 as later focused tranches. Gate A remains paused; production untouched.

### PR #46 merged with current main (2026-10-02; PR #46)

**Status:** [PR #46](https://github.com/leeharbaugh/harbaugh-forms/pull/46) is open, unmerged, and no longer conflicting. `origin/main` `7733493` was merged into `feat/native-signing-manager-qa` (`3f92e48` → merge commit `8769993`, history kept, no rebase). Ready for Lee's manual re-QA. Production untouched (`dpl_E9HTxf45epr8ckKifivWCPNgpFAU`), Native Signing off there, no production Supabase / migration / email / Cron / secret change, Gate A paused.

| Item | Result |
|------|--------|
| Conflicts | `package.json`, `decisions.md`, `project_status.md` (`package-lock.json` merged cleanly) |
| `package.json` | Union of scripts (PR #46 Signing scripts and its superset `test:native-signing-production-readiness`; main's `test:packet-forms-duplicate`, `validate:duplicate-packet-forms-dev`, timestamp tests); dependencies exactly `main` (`next` `^16.3.6`). No upgrades |
| `package-lock.json` | Identical to `main`: Next 16.3.6; `brace-expansion` only 1.1.21 and 5.0.12 |
| Docs | Union of both histories; `main`-side entries carry their current merged / deployed status; no duplicate sections or decisions |
| Fixes A–D | Date Signed beside Signature, remove → reapply, Finish / Decline / Exit server redirects (`/sign/done`, Return to agent), unlock page without lock cookie: all present after the merge, guarded by `test:native-signing-ceremony` (63) |
| Dependencies | Clean `npm ci`; `npm audit --omit=dev` 0; full lockfile audit 0 |
| Unit suites | stage3 11, stage4 50, ceremony 63, TC authority 31, stage6 30, completion delivery 12, recovery access 7, draft prep 64, production readiness 56, duplicate packet forms 18, format-timestamp 6, packet timestamps 3; stage1 16 / stage2 34 / participant-link-qa + draft-multiselect 22 under `tsx` (the plain-`node` stage1 / stage2 scripts still fail on `@/` resolution, pre-existing). All 0 fail |
| Dev validators | stage4, stage6, completion delivery, ceremony, duplicate packet forms pass |
| Browser regression | Ceremony QA (remote P1 / P2 with isolation and Finish → `/sign/done?outcome=finished`, finalization to VERIFIED / COMPLETE, completed package, Decline → "You declined to sign", refused links, in-person Finish → Return to agent with lock intact → password unlock → the Signing) and link-ops QA pass; 0 console errors / warnings, 0 page errors, 0 hydration errors, 0 dev-server ERROR / WARN; no QA fixtures left on dev |
| Admin hydration (from `main`) | `qa-admin-hydration-browser.ts` passes on the merged build (local production server, `TZ=UTC`, browser Chicago). Under `next dev` only, `/admin/audit` and `/admin/users/[id]` log Next's "runtime data during prerendering" (blocking-route) dev message; those pages are identical to `main`, so this is not from the merge |
| Static | `tsc`, ESLint on the 85 changed files, `git diff --check`, `build:validate` pass |

**Manager completed-document access (pre-production blocker, not implemented here):** COMPLETED_DOCUMENT, AUDIT_CERTIFICATE and the optional COMBINED_PACKAGE live in the private `signing-artifacts` bucket (`signings/{id}/artifacts/{completed|certificate|combined}/{artifactId}.pdf`, sha256 + `verified_at` in `signing_artifacts`). The only download path is the recipient route `/sign/package/artifact/[artifactId]` behind a completed-package session (credentials issued only after Complete, access-logged). `canReadCompletedSigningArtifacts()` exists but is unused; the manager Signing page shows delivery rows but no view / download. decisions.md expects authorized agents to view / download completed artifacts through server mediation. Proposed separate PR: a manager-authenticated route (`requireSigningActor` + `canReadCompletedSigningArtifacts`, verified artifacts of the frozen revision only, sha256 readback with a clear integrity-failure label, `no-store`) plus View / Download links on the Complete manager view and tests; no bearer links, no Storage URLs, no RLS change.

**Remaining before merge:** Lee's manual re-QA (remote Finish, Decline, in-person hand-back, Date Signed / remove-reapply spot check); Lee's call on whether the access gap lands before PR #46 merges or as the next PR before production enablement.

### Packet Created/Updated timestamps in Central time (2026-10-02)

**Status:** [PR #52](https://github.com/leeharbaugh/harbaugh-forms/pull/52) (`fix/packet-timestamps-central`, `f1a9a24`, from `main` `edfc5a7`) squash-merged to `main` as `7733493` on 2026-10-02 17:39 UTC (Lee approved); merged tree identical to the PR head; not deployed. Post-merge on `main`: packet-timestamps 3/3, format-timestamp 6/6, packet / UI / admin suites, `tsc`, ESLint, diff check, `build:validate` pass; `npm audit --omit=dev` 0, full lockfile audit 0. Vercel's automatic Git build of `main` (`dpl_5327xDSo5a3YZpg5r3bDfFy4MmTg`) was not promoted; production received the fix through the hotfix lineage instead (see Production rollout below). Lee chose fixed Central time with an explicit zone label (not viewer-local). Independent of Native Signing PR #46.

**Fix:** `formatDateTime()` (`lib/types/packet.ts`) now delegates to the shared `formatTimestamp()` (`lib/format-timestamp.ts`), so date and time both come from the same instant in `America/Chicago` with `CDT`/`CST` (e.g. `10/2/2026, 7:30:00 PM CDT`, previously `10/03/2026 7:30 PM` for a Chicago viewer). Empty input still `-`; unparseable input still falls back to `formatDate()`. No component changes, so the three call sites (also present on PR #46) are untouched.

| Item | Result |
|------|--------|
| Unit tests | New `test:packet-timestamps` (3 tests: evening / next-UTC-day case, CST case, identical output under runtime `TZ` UTC / Chicago / Tokyo / Los Angeles, fallbacks); fails on the previous helper with `10/03/2026 7:30 PM`. `test:format-timestamp` now also bans `toLocale*String(` in `lib/types/packet.ts`, `components/packets`, `components/contacts` (6 tests) |
| Regression | `tsc` pass; ESLint on changed files clean; `git diff --check` clean; packet-forms-duplicate 18, packet-tenant-names 14, packet-form-lifecycle 7, form-controls 23, ui-lists 29, admin-audit 20 pass; `build:validate` pass |
| Browser QA | Production build, server `TZ=UTC`, disposable dev data (cleaned up); browsers UTC / `America/Chicago` / `Asia/Tokyo`: all three routes show identical Central text on hard load, reload, direct URL, client navigation, back/forward; 0 console errors/warnings, 0 page errors, 0 React #418; server log clean |

**Production rollout (2026-10-02, Lee approved):** fixed in production. Not deployed from `main`; Native Signing code and other `main`-only changes excluded.

| Item | Result |
|------|--------|
| Starting point | Production lineage `c25e4c3` (`hotfix/admin-hydration-prod`), deployment `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo` |
| Hotfix | `hotfix/packet-timestamps-prod` `3e5eaa3`: cherry-pick of PR #52 head `f1a9a24`, code and tests only (`lib/types/packet.ts`, `lib/types/packet-datetime.test.ts`, `lib/format-timestamp.test.ts`, `package.json`); rollout record `581a7f4` (docs only, not deployed). Branch pushed and retained |
| Validation | `npm ci` (446 packages, Next.js 16.3.6); packet-timestamps 3/3, format-timestamp 6/6, packet-forms-duplicate 18, packet-tenant-names 14, packet-form-lifecycle 7, ui-lists 29, form-controls 23, admin-audit 20; `tsc`, changed-path ESLint, `git diff --check` pass; `npm audit --omit=dev` 0; full lockfile audit 1 High (dev-only `brace-expansion`, fixed on `main` by PR #51, intentionally not in this hotfix); `build:validate` with `NATIVE_SIGNING_ENABLED=false` pass, 37 routes, no signing routes, pre-existing warnings only |
| Candidate | `vercel deploy --prod --skip-domain` from a clean detached checkout of `3e5eaa3`: `dpl_E9HTxf45epr8ckKifivWCPNgpFAU` (`harbaugh-forms-od5uyq8rp-lee-harbaugh-s-projects.vercel.app`), Next.js 16.3.6, build warning only npm install-scripts notice for `unrs-resolver` |
| Unique URL (before promotion) | Signed in as Lee (one-time link, session revoked after). Packet #12 created `2026-08-11T03:44:45Z` shows `8/10/2026, 10:44:45 PM CDT` on Packets list (and reload), Packet detail, Contact detail (`Updated` / `Created`), identical in `America/Chicago` and `Asia/Tokyo` browsers; old `08/11/2026 10:44 PM` absent. Core smoke (dashboard, Contacts, Properties, Forms, Settings, `/packets`, admin users / organizations / audit) read-only pass; Native Signing routes unavailable; 0 console errors/warnings, 0 page errors, 0 React #418, 0 5xx; runtime logs 0 error / warning / fatal / 5xx |
| Promotion | `vercel promote dpl_E9HTxf45epr8ckKifivWCPNgpFAU`; `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` both inspect to it |
| Post-verify | Same smoke on both domains: HTTPS, login, all three packet views Central with CDT, no rollover, 0 console / hydration / page errors, 0 5xx (58/58 checks each); runtime logs clean |
| Settings / data | `autoAssignCustomDomains=false` re-confirmed after promotion; production Supabase untouched; no migrations; no env var changes; Native Signing off |
| Rollback | `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo` retained (`vercel promote dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo --yes`) |

### Packet-page `formatDateTime` audit (2026-10-02; read-only)

**Status:** Hydration risk disproven. The separate, non-hydration display defect found here is fixed in PR #52 (see section above). Audited on `main` `edfc5a7`; production untouched.

**Helper:** `lib/types/packet.ts` `formatDateTime(date: string | null | undefined)`. `null` / empty returns `—`; unparseable input returns `formatDate(date)`. Otherwise it returns `formatDate(date)` (`lib/types/buyer-rep-agreement.ts`: slices the ISO string's calendar part to `MM/DD/YYYY`, i.e. the **UTC** date for Supabase `timestamptz` values such as `2026-10-03T00:30:00+00:00`) plus `toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })` (runtime locale and **runtime time zone**; no zone label). Used only by packet-facing UI.

**Call sites (all `"use client"`, all data fetched in the browser in `useEffect`, initial render is a loading state):**

| Route | Component | Text |
|-------|-----------|------|
| `/` (Packets list) | `components/packets/packets-page.tsx` | `packet.create_date` |
| `/packets/[id]` | `components/packets/packet-detail.tsx` (via `packet-detail-page.tsx`) | `packet.create_date` |
| `/contacts/[id]` | `components/contacts/contact-detail.tsx` | associated packet `Updated` / `Created` |

**Hydration result:** Safe by architecture. The timestamps never exist in the server HTML or initial RSC payload; they are computed only in the browser after hydration. Reproduction on a production build (`next start`, server `TZ=UTC`, same env as build) with a disposable dev user/contact/packet (`create_date` 00:30 UTC), browsers UTC (control), `America/Chicago`, `Asia/Tokyo`: for all three routes, server HTML contained the loading state and no packet label or timestamp; hard load, reload, direct URL, client navigation (soft, `/` → packet), and back/forward produced 0 console errors/warnings, 0 page errors, 0 React #418; server log clean. Disposable data removed.

**Display defect (not hydration):** The date half is the UTC calendar date while the time half is viewer-local, so evening timestamps in the Americas show the next day: Chicago viewer saw `10/03/2026 7:30 PM` for a packet created 2026-10-02 7:30 PM CDT (00:30 UTC). Tokyo viewer saw `10/02/2026 2:15 AM` for 2026-10-03 2:15 AM JST. Affects every packet created/updated after 7 PM CDT (6 PM CST) for Central viewers, in production today. No time-zone label. No documented display-time-zone rule exists for packet timestamps (the Central-time rule in `decisions.md` covers SSR-visible admin timestamps).

**Remediation options considered (Lee chose fixed Central; implemented in PR #52):** derive date and time from the same instant in one zone. Either viewer-local (consistent with current time-of-day behavior; still client-only, so hydration-safe) or fixed Central with a `CDT`/`CST` label via the shared `formatTimestamp()` (consistent with admin pages and Signing defaults). Small, packet-only change plus unit tests either way.

### Dev-only `brace-expansion` advisories remediated (2026-10-02)

**Status:** Lockfile-only [PR #51](https://github.com/leeharbaugh/harbaugh-forms/pull/51) (`security/brace-expansion-dev-tooling`, `13ffdbe`, from `main` `c2a490a`) squash-merged to `main` as `edfc5a7` on 2026-10-02 17:01 UTC (Lee approved); merged tree identical to the PR head. Post-merge clean `npm ci` on `main`: installed 1.1.21 / 5.0.12 only (hidden lockfile consistent), `npm audit --omit=dev` 0, full lockfile audit 0, `tsc` / source ESLint (unchanged baseline) / 10 test suites / `build:validate` pass. No production action: Vercel's automatic Git build of `main` (`dpl_24CPSQ7JsB2YZDjjPTHqJ2RsaCjL`) was not promoted; production stays on `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`. Closes the reviewed R1 exception carried since the Next.js 16.3.6 patch. Independent of Native Signing PR #46 and of any production rollout.

**Finding:** The full lockfile audit (R1, `npm audit --package-lock-only`) reported one High in `brace-expansion`, present only through ESLint tooling. Advisories (checked 2026-10-02 against the GitHub Advisory Database and the npm registry):

| Advisory | Severity | Affected (relevant lines) | Patched |
|----------|----------|---------------------------|---------|
| GHSA-qhr7-859c-m2p7 / CVE-2026-102278 - uncontrolled recursion on nested brace groups (stack exhaustion) | High (7.5) | `< 1.1.20`; `>= 4.0.0 < 5.0.11` | 1.1.20 / 5.0.11 |
| GHSA-6j4f-fj2g-mc7p / CVE-2026-102276 - uncontrolled recursion in `parseCommaParts` | High (7.5) | `< 1.1.19`; `>= 4.0.0 < 5.0.10` | 1.1.19 / 5.0.10 |
| GHSA-q2hr-2g5m-vwhr / CVE-2026-102277 - quadratic `{a},b}` rewrite (CPU DoS) | Moderate (5.3) | `< 1.1.21`; `>= 4.0.0 < 5.0.12` | 1.1.21 / 5.0.12 |

Both installed major lines were affected (1.1.18 and 5.0.9). Exploitation needs an attacker-controlled glob/brace pattern; here the pattern sources are ESLint config and CLI arguments on developer machines.

**Dependency chains (all `dev: true`):**
- `brace-expansion@1.1.18` <- `minimatch@3.1.5` (`^1.1.7`) <- `@eslint/eslintrc@3.3.5` (direct devDependency, used by `eslint.config.mjs` `FlatCompat`), `@eslint/config-array` (<- `eslint@9.39.4`), `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react` (<- `eslint-config-next@15.3.1`).
- `brace-expansion@5.0.9` <- `minimatch@10.2.5` (`^5.0.5`) <- `@typescript-eslint/typescript-estree@8.63.0` <- `@typescript-eslint/parser` / `type-utils` / `utils` <- `eslint-config-next@15.3.1`.

**Remediation:** In-range transitive refresh, `npm update brace-expansion --package-lock-only`. Both patched versions already satisfy the parents' declared ranges, so no `package.json` change, no `overrides`, and no ESLint package bump. The lockfile diff is exactly the two `brace-expansion` entries (version / resolved / integrity: 1.1.18 -> 1.1.21, 5.0.9 -> 5.0.12); npm's rewrite of the lockfile `name` to the worktree folder was reverted. The existing nested `balanced-match@4.0.4` satisfies 5.0.12's `^4.0.2`.

| Item | Result |
|------|--------|
| `npm ci` (clean `node_modules`) | Pass, 446 packages; installed 1.1.21 / 5.0.12 |
| `npm audit --omit=dev` | 0 vulnerabilities (unchanged) |
| R1 lockfile audit / installed-tree `npm audit` | Before: 1 High (`brace-expansion`). After: 0 of every severity |
| `npm ls` / `npm explain brace-expansion` | Only 1.1.21 and 5.0.12, both `dev`; `npm ls brace-expansion --omit=dev` empty |
| ESLint | Source lint (`app`, `components`, `lib`, `proxy.ts`, `next.config.ts`; 526 files, both `minimatch` paths exercised): 2 errors / 10 warnings, identical file-by-file and line-by-line to a baseline run with 1.1.18 / 5.0.9 swapped back in. Full `npm run lint` still fails on pre-existing `.next` / `_audit_tmp` pollution (out of scope). Brace globs (`**/*.{ts,tsx}`, `file{1..3}.md`) match identically through both `minimatch` versions; 5,000-deep nested braces return without stack exhaustion |
| Type check / diff check | `npx tsc --noEmit --incremental false` pass; `git diff --check` clean |
| Tests | 15 suites, 351 tests, 0 failures (format-timestamp, admin audit / orgs / user lifecycle / invite, auth confirm / bootstrap, Supabase guard, library permissions, secure publish, selective production, UI lists, form controls, form lifecycle, storage paths) |
| Build | `npm run build:validate` pass (Next 16.3.6, dev target `ewxsxwzezhkeawnjvigx`) |

**Production impact:** None. Both packages are `dev: true` in the lockfile and absent from `npm ls --omit=dev`; none of the 57 `.next/**/*.nft.json` server traces reference `brace-expansion`, `minimatch`, or `eslint`; no file under `.next/server` or `.next/static` mentions either package. `next build` (Next 16) does not run ESLint, so the packages are not executed during the Vercel build either. Production (`dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`) is unchanged and needs no redeploy for this.

### Admin pages React #418 hydration fix (2026-10-02)

**Status:** Live in production since 2026-10-02 (Lee approved) via `hotfix/admin-hydration-prod` (`c25e4c3` = `2a92d82` + the fix), deployment `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`. PR #50 (`fix/admin-hydration-errors` from `main` `9f00a80`, head `90ad65f`) squash-merged to `main` as `c2a490a` on 2026-10-02 16:42 UTC (Lee approved); merged tree identical to the PR head. The merge involved no production action: Vercel's automatic Git build of `main` (`dpl_GiZXineDEwVnoxrJH4KGYnD69pdF`) was not promoted, and production stays on `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo` with automatic domain assignment off. Independent of Native Signing PR #46.

**Symptom:** Production showed minified React error #418 (hydration mismatch) on hard load / refresh of `/admin/users` (2×), `/admin/organizations` (1×), and `/admin/audit` (1×), identically on Next 16.3.5 and 16.3.6. Client-side navigation between admin pages was clean; non-admin pages were clean. React recovered by client-rendering the affected boundary, so users saw browser-local times.

**Root cause (shared):** The `"use client"` admin components (`admin-users-page`, `admin-organizations-page`, `admin-audit-page`, and the nearby `admin-user-detail-page`) formatted timestamps with bare `new Date(value).toLocaleString()`. That uses the runtime's locale and time zone: the Vercel server renders in UTC, the browser in the agent's zone (America/Chicago), so the SSR text differed from the initial client render. It never reproduced in local dev because server and browser shared a time zone.

**Reproduction (unchanged `main`, production build, disposable dev admin):** `next start` with `TZ=UTC` + Playwright browser `America/Chicago` → `#418` (`args[]=text`) on hard load and reload of all three routes and direct `/admin`; client nav and back/forward clean. Control with server and browser both in `America/Chicago` → no text mismatch. `next dev` with matching zones → no hydration error (only the known dev-only "runtime data outside `<Suspense>`" diagnostic on `/admin/audit`). `next-themes` is not involved.

**Local-only artifact (not a production cause):** a build made with `NATIVE_SIGNING_ENABLED=false` but served with the dev `.env.local` value `true` adds an `#418` (`args[]=HTML`) on every page: `SigningsNavLink` reads the flag during prerender of the static nav shell, so the request-time render disagrees with the baked shell. Production builds and serves with the same env. Local production-mode QA must run `next start` with the same `NATIVE_SIGNING_ENABLED` value used for the build. Not changed (Native Signing scope).

**Fix:** New shared deterministic formatter `lib/format-timestamp.ts` (`formatTimestamp`): fixed `America/Chicago` zone with an explicit zone label, assembled from `Intl.DateTimeFormat.formatToParts` so ICU spacing differences between Node and browsers cannot leak (e.g. `10/1/2026, 9:16:05 PM CDT`). Empty → `—` (unchanged); the audit page keeps showing the raw value for unparseable timestamps. The four admin components use it; no `suppressHydrationWarning`, no client-only rendering, no effects or `ssr: false`.

**Date/time decision:** Admin timestamps display in Central time (CST/CDT) with the zone label, matching the brokerage's market and the Native Signing audit-certificate default. Before, users effectively saw their browser's local time after React's recovery re-render (unlabeled); for Central-time users the value is unchanged, now with a `CDT`/`CST` suffix.

| Item | Result |
|------|--------|
| Regression (unit) | `npm run test:format-timestamp`: exact Central output (DST / standard / midnight), ASCII-only spacing, fallbacks, identical output under process `TZ` UTC / Chicago / Tokyo, and a source check banning `toLocale*String(` in `components/admin`. Source check fails on unchanged `main`; 5/5 pass after |
| Regression (browser) | `scripts/qa-admin-hydration-browser.ts` (disposable dev admin, local production server): fails on unchanged `main` (7 failing phases); passes after the fix with server `TZ=UTC` and browser Chicago, browser Tokyo, and Chicago with 400 ms network latency — hard load, reload, direct `/admin`, `/admin/users/[id]`, client nav, back/forward: no `#418`, no console error/warning, no page error; user detail shows `… CDT/CST` timestamps |
| R5 / F6 HTML + RSC role matrix (local) | Unauthenticated, ordinary, disabled, inactive-organization, and admin sessions × `/admin`, `/admin/users`, `/admin/organizations`, `/admin/audit`, `/admin/users/[id]`: no privileged marker in any non-admin HTML or RSC body; admin HTML and RSC contain it (positive control) |
| Unit tests | `test:admin-audit` 20, `test:admin-orgs` 4, `test:admin-user-lifecycle` 23, `test:admin-invite` 37, `test:auth-confirm` 30, `test:auth-bootstrap` 7 — all pass |
| Validators / checks | `validate:account-state-dev` pass; `npm audit --omit=dev` 0; `tsc` pass; changed-path ESLint clean; `git diff --check` clean; `build:validate` pass (Next 16.3.6, `NATIVE_SIGNING_ENABLED` off; only pre-existing `MODULE_TYPELESS_PACKAGE_JSON` / npm `devdir` warnings) |
| Unchanged | Auth guards (`requireAppAdmin`, `requireAppAdminPage`), privileged readers, account-state, org authorization, audit access; no schema, migration, env, Native Signing, brace-expansion, or production change |

**Not in scope (noted):** `lib/types/packet.ts` `formatDateTime` uses `toLocaleTimeString(undefined, …)` on packet pages — same class of risk; not changed here. Audited 2026-10-02: not a hydration risk (client-only after data load); separate UTC-date / local-time display defect recorded in the packet-page `formatDateTime` audit section.

**Production rollout (2026-10-02, Lee approved):** Production ran `hotfix/next-16.3.6-prod` (`2a92d82`), not `main` (which carries unreleased Native Signing), so the candidate was `hotfix/admin-hydration-prod` = `2a92d82` + `2e22ea9` cherry-picked with its documentation hunks omitted (commit `c25e4c3`; code patch-id identical to `2e22ea9`; 8 files: the formatter, its test, the four admin components, the browser QA script, one `package.json` test script).

| Item | Result |
|------|--------|
| Hotfix validation | `npm ci` (Next 16.3.6); `npm audit --omit=dev` 0; `test:format-timestamp` 5, `test:admin-audit` 20, `test:admin-orgs` 4, `test:admin-user-lifecycle` 23, `test:admin-invite` 37, `test:auth-confirm` 30, `test:auth-bootstrap` 7 — all pass; `tsc` pass; changed-path ESLint clean; `git diff --check` clean; `build:validate` pass with `NATIVE_SIGNING_ENABLED` off (37 routes, no `/sign` / `/signings`; only pre-existing warnings); local production server (`TZ=UTC`, browser Chicago) hydration QA pass; local R5 HTML/RSC role matrix pass; `validate:account-state-dev` pass |
| Candidate | `vercel deploy --prod --skip-domain` from a clean detached worktree of `c25e4c3` (no env files / `node_modules` / `security.md`): `dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`, `https://harbaugh-forms-1sbmqsmbu-lee-harbaugh-s-projects.vercel.app`, Ready, target production, meta `gitCommitSha` `c25e4c3`, `autoAssignCustomDomains: false`, "Detected Next.js version: 16.3.6". Custom domains stayed on `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf` until promotion |
| Control on previous deployment | Same read-only smoke against `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf`'s unique URL: exactly one `#418` (`args[]=text`) per hard load / reload of each admin page; timestamps unlabeled. The earlier "2× on `/admin/users`" was the smoke loading `/admin` (redirects to `/admin/users`) and then `/admin/users`, with issues tagged by final path — two loads of the same mismatch, not a second cause |
| Unique-URL validation (before promotion) | Read-only, as the existing production admin via a one-time sign-in link, browser `America/Chicago`; session revoked afterwards (local scope). `/admin/users` (hard load + 2 reloads), `/admin/organizations`, `/admin/audit` (hard load + reload), `/admin/users/[id]`, direct `/admin`, client nav Users → Organizations → Audit → Users, back/forward: 0 `#418`, 0 page errors, 0 console errors/warnings. Every timestamp carries `CDT`/`CST` (e.g. `7/31/2026, 2:01:38 PM CDT`) and appears verbatim in the server HTML. Login, logged-out redirects, dashboard / Contacts / Properties / Packets / Forms / Settings, client RSC navigation, client Next 16.3.6, Native Signing routes unavailable. 0 HTTP 5xx; Vercel runtime logs 0 error / warning / fatal |
| Promotion | `vercel promote dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`. `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` both serve it (HTTPS 200, HSTS); project production target = it at `c25e4c3` |
| Post-promotion | Same smoke on both custom domains: all checks pass, 0 `#418`, Central timestamps with labels, 0 console issues, 0 5xx. Runtime logs: 0 warning / fatal / 5xx; one `auth_confirm:token_hash:expired_or_invalid` (307) from a smoke run started in parallel on both domains (the second one-time link invalidated the first; harness race, correct handling); rerun alone passed |
| Auto domain assignment | `autoAssignCustomDomains` = `false` before deploy, on the candidate, after promotion, and on final re-check |
| Rollback target | `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf` (`2a92d82`, Next 16.3.6) retained, Ready |
| Unchanged | No Supabase change, no migrations, production `eetonalyyyssvkyfdoxh` data untouched (only the smoke sign-in events and revoked sessions); Native Signing off (no flag or Signing secrets in production env; Native Signing code absent from the hotfix lineage); no auth / authorization change |

**Follow-ups:** PR #50 merged to `main` (`c2a490a`), done; `main` now contains the fix running in production. Dev-only `brace-expansion` lockfile PR #51 merged to `main` (`edfc5a7`), done (see section above). Packet-page `formatDateTime` audited 2026-10-02: hydration risk disproven; display-zone defect fixed in PR #52, merged to `main` as `7733493` (Central time with CDT/CST; see section above); live in production via hotfix `3e5eaa3` / `dpl_E9HTxf45epr8ckKifivWCPNgpFAU` (2026-10-02), done.

### Next.js 16.3.6 security patch — GHSA-vcvr-r3jv-pc5j (2026-10-01)

**Status:** Deployed to production on 2026-10-01 (Lee approved) from `hotfix/next-16.3.6-prod` (`2a92d82`); PR #49 (`security/next-16.3.6-ghsa-vcvr-r3jv-pc5j`) squash-merged to `main` as `9f00a80` on 2026-10-02 03:35 UTC (Lee approved), so `main` now pins Next 16.3.6; the merge involved no production action and production stays on `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf`. Independent of the Native Signing PR #46 and of the Native Signing rollout. `hotfix/next-16.3.6-prod` is retained as the exact production lineage (`a87b1aa` → `2a92d82`) until `main` becomes the production release baseline.

**Advisory (checked 2026-10-01 against the Vercel repository advisory and the GitHub Advisory Database):** GHSA-vcvr-r3jv-pc5j / CVE-2026-94545, critical. "Remote Code Execution in next/og ImageResponse": a Node.js-runtime `ImageResponse` from `next/og` that passes attacker-controlled values into SVG content, attributes, or styles can lead to RCE (root cause: improper escaping in Satori, GHSA-wx4j-mvgx-mqwp). Affected `next >= 16.2.0 < 16.3.6`; patched `16.3.6` (fix commit `868fad3`, "Harden next/og SVG serialization"; v16.3.5...v16.3.6 changes only the compiled `@vercel/og` bundles plus version bumps). Workaround: do not pass attacker-controlled values to `ImageResponse`.

**Applicability:** The installed version was affected — `main` and the live production deployment (`dpl_4eXrZwG8hJC3UgmPKgRVGDHMpMWX`, hotfix commit `a87b1aa`) both resolve `next@16.3.5`. The application code does not appear to exercise the vulnerable feature: no `next/og`, `ImageResponse`, `@vercel/og`, `satori`, `generateImageMetadata`, or code-generated metadata image routes (`opengraph-image` / `twitter-image` / `icon` / `apple-icon` `.tsx|.ts|.js`) anywhere in source; no route returns generated image content. The build route table's `/opengraph-image.png` and `/twitter-image.png` are static PNG files (`app/opengraph-image.png`, `app/twitter-image.png`, unchanged since the initial commit) served as static file-based metadata, not rendered through `ImageResponse`. Only starter-kit URLs in `README.md` / `components/deploy-button.tsx` mention OG images. Patched anyway because the vulnerable code ships in the production dependency.

| Item | Result |
|------|--------|
| Dependency change | `package.json` `next` `^16.3.5` → `^16.3.6`; lockfile changes only `next`, `@next/env`, and the eight `@next/swc-*` platform binaries (16.3.5 → 16.3.6). No React or other package changes; no `npm audit fix` |
| `npm audit --omit=dev` | Before: 1 critical (`next`, GHSA-vcvr-r3jv-pc5j). After: 0 vulnerabilities |
| R1 lockfile audit | Before: 1 critical (`next`) + 1 high (`brace-expansion`). After: 1 high (`brace-expansion`) — dev-only ESLint tooling (`@eslint/eslintrc` → `minimatch@3` → `brace-expansion@1.1.18`; `eslint-config-next` → `@typescript-eslint/typescript-estree` → `minimatch@10` → `brace-expansion@5.0.9`); ReDoS/stack-exhaustion on crafted brace patterns; not in the production bundle. Reviewed exception; to be fixed in a separate small lockfile PR (patched 1.1.21 / 5.0.12) |
| Type check / diff check | `npx tsc --noEmit --incremental false` pass; `git diff --check` clean |
| Lint | Targeted ESLint (app, components, lib, scripts): 5 errors / 10 warnings, all pre-existing in unchanged files (this change touches only `package.json` / `package-lock.json`) |
| Build | `npm run build:validate` passes on Next 16.3.6 with `NATIVE_SIGNING_ENABLED` off (production parity). Only pre-existing warnings (`MODULE_TYPELESS_PACKAGE_JSON`, npm `devdir`). With the dev `.env.local` flag on, `main` fails to prerender `/sign/[publicId]` (pre-existing; fixed on PR #46 with `instant = false` + `connection()`) |
| Unit / contract tests | All 50 `test:*` scripts pass — 1,117 tests, 0 failures (auth, admin, audit, orgs, storage, secure publish, packet/form lifecycle, duplicate packet forms, user preferences, UI lists, Native Signing stages 1–6 / ceremony / TC authority / completion delivery / recovery access / production readiness) |
| Dev security validators | R2–R8 + duplicate packet forms: all pass (secure publish, account state, final-document immutability, annotation auth, packet-reference ownership, atomic audit logging, brokerage settings by organization). Native Signing dev validators: stage1, stage2, ceremony, TC authority, recovery access pass; stage3, stage4, stage6, completion delivery fail only because the dev database already carries PR #46's Native Signing migrations (`SOURCE_PACKET_DOCUMENT_MISMATCH` comes from that schema and does not exist in `main`'s code); the same validators pass from the PR #46 checkout. Not a Next.js effect (the validators do not load Next) |
| Runtime smoke | Local `next dev` on 16.3.6 with a disposable dev user: unauthenticated redirects to login; password login; dashboard, Contacts, Properties, Packets (redirects to dashboard by design), Forms, Settings render; client-side RSC navigation without document reloads; non-admin denied `/admin`; admin Users / Organizations / Audit render; cleared session redirects to login. No server ERROR/WARN log lines from the run; no hydration errors. One dev-only console diagnostic on `/admin/audit` (runtime data outside `<Suspense>` for instant navigation) reproduces identically on 16.3.5 — pre-existing |

**Production rollout (2026-10-01, Lee approved):** Production ran `hotfix/duplicate-packet-forms-prod` (`a87b1aa`), not `main`, and `main` still carries unreleased Native Signing code, so the production candidate was `hotfix/next-16.3.6-prod` = `a87b1aa` + only the PR #49 `package.json` / `package-lock.json` change (commit `2a92d82`; lockfile byte-identical to PR #49's; no application-code diff). Production Next.js 16.3.5 → 16.3.6.

| Item | Result |
|------|--------|
| Hotfix validation | `npm ci` (Next / `@next/env` / `@next/swc-*` 16.3.6); `npm audit --omit=dev` 0; R1 only the reviewed dev-only `brace-expansion` High; `tsc` pass; `git diff --check` clean; `build:validate` pass with `NATIVE_SIGNING_ENABLED` off (37 routes, no `/sign` / `/signings` — Native Signing code is not in this baseline; only pre-existing warnings); all 40 `test:*` scripts at this baseline 829/0; dev validators R2–R8 + duplicate packet forms pass; local dev smoke incl. non-admin denied `/admin` |
| Candidate | `vercel deploy --prod --skip-domain` from a clean detached worktree of `2a92d82` (no local env files); `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf`, `https://harbaugh-forms-a7scsg8rh-lee-harbaugh-s-projects.vercel.app`, Ready, target production; deployment meta `gitCommitSha` `2a92d82fc9e45e511755850ab94e780ac6b4a74f`, not dirty, `autoAssignCustomDomains: false`; Vercel build log "Detected Next.js version: 16.3.6". Custom domains stayed on `dpl_4eXrZwG8hJC3UgmPKgRVGDHMpMWX` until promotion |
| Unique-URL validation (before promotion) | Read-only, as the existing production admin via a one-time sign-in link; smoke session revoked afterwards (local scope only). Login page (HTTPS 200), sign-in, unauthenticated redirects, dashboard / Contacts / Properties / Packets / Forms / Settings, client RSC navigation without reloads, admin Users / Organizations / Audit, cleared-session redirect, client Next.js 16.3.6, Native Signing routes unavailable. 0 HTTP 5xx; Vercel runtime logs 0 error / warning / fatal. No production business records created or changed |
| Known pre-existing | React #418 hydration text mismatch on `/admin/users` (2×), `/admin/organizations`, `/admin/audit` — identical on the previous 16.3.5 production deployment; core pages clean. Follow-up, not a 16.3.6 regression. Fixed in production 2026-10-02 (`dpl_4ys2PciJMmfdg4QkhZr7dHHeSjyo`; see admin hydration section) |
| Promotion | `vercel promote dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf` after validation. `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` both serve `dpl_DBUMG2wVXxXvzQvhgtf65khSUpWf` (HTTPS 200, HSTS); project production target = that deployment at `2a92d82` |
| Post-promotion | Same read-only smoke on both custom domains: all functional checks pass; 0 5xx; runtime logs 0 error / warning / fatal |
| Auto domain assignment | `autoAssignCustomDomains` = `false` before deploy, on the candidate, after promotion, and on final re-check |
| Rollback target | `dpl_4eXrZwG8hJC3UgmPKgRVGDHMpMWX` (`a87b1aa`, Next 16.3.5) retained, Ready |
| Unchanged | No Supabase change, no migrations, production `eetonalyyyssvkyfdoxh` untouched; Native Signing off (no flag or Signing secrets in production env; Native Signing code absent from the hotfix baseline); no Signing email / Cron / secret change |

**Follow-ups:** PR #49 merged to `main` (`9f00a80`), done. Admin React #418 hydration mismatch fixed in PR #50 and live in production since 2026-10-02 (see section above; PR #50 merged to `main` as `c2a490a`); then a separate small lockfile PR for dev-only `brace-expansion` (PR #51, merged to `main` as `edfc5a7`).

### Duplicate packet forms allowed (2026-09-30; emergency fix)

**Status:** Deployed to production on 2026-09-30. Migration `20260930120000` is applied to development (`ewxsxwzezhkeawnjvigx`) and production (`eetonalyyyssvkyfdoxh`); the production smoke test passed. This was a brief interruption to Native Signing development, which continues from the QA state below. No Native Signing code or schema was promoted with this hotfix.

**Production app and rollback:** PR #47 was squash-merged to `main` as `15e4b7a`; PR #48 recorded the rollout on `main` as `cd7e0f4`. The live app was built from `hotfix/duplicate-packet-forms-prod` at `a87b1aa`: prior live commit `348d309` plus only the duplicate-forms fix, with fix code byte-identical to `main`. `main` has not been deployed. Both production domains (`forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app`) run Vercel deployment `dpl_4eXrZwG8hJC3UgmPKgRVGDHMpMWX`; the prior deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` is the rollback target. Keep the hotfix branch as a record of the exact deployed source until a later `main` release replaces it.

**Production migration:** Applied only `20260930120000_packet_forms_allow_duplicate_forms.sql`, using a temporary migrations directory with the 110 migrations production already had plus this file; the dry run listed only the new file. The unique index is gone; production has 111 applied migrations with no drift. Pre-existing packets, packet forms, field instances, and annotations were byte-identical before and after the rollout. The 20 older Native Signing migrations remain pending in production. Their future rollout must use `supabase db push --include-all` after a dry run, because production already has the later duplicate-forms migration.

**Production smoke and domain behavior:** A temporary packet confirmed first add without a dialog, an already-present form remaining selectable, Cancel creating nothing, and Add Another creating an independent second copy with its own PDF and 38 field instances. A field value and Date Signed annotation on that copy did not alter the original; removing it soft-deleted only the copy. The temporary packet was cleaned up, and the rollout report recorded no production 5xx errors. A second Amendment to Contract was subsequently added to live packet #12. Although automatic domain assignment was disabled for Git-triggered production builds, `vercel redeploy --target production` assigned both domains when Ready; the isolated-URL login check therefore ran after assignment. Future CLI production builds should skip domain assignment, validate the deployment URL, then promote domains explicitly.

**Durable rule:** A packet may contain multiple independent instances of the same form. Form presence in a packet must never make that form unavailable for addition. Duplicate instances are identified and managed by `packet_form.id`, not by assuming `packet_id + form_id` is unique. The UI may warn before adding duplicates but must allow the user to proceed.

| Item | Result |
|------|--------|
| Root cause | Two layers. DB: partial unique index `packet_forms_packet_form_internal_active_uidx` on `(packet_id, form_id) WHERE status='ACTIVE' AND form_id IS NOT NULL` (from `20250610190000`). App: Add Forms disabled forms already present ("In packet"); `addInternalFormToPacket` threw "This form is already in the packet." after a `.maybeSingle()` lookup; `createPacketFromCollection` and the draft editor rejected repeated / collection-overlapping additional forms |
| Migration | `20260930120000_packet_forms_allow_duplicate_forms.sql` — `drop index if exists public.packet_forms_packet_form_internal_active_uidx;` only. Forward-only; no data rewrite. Dev: 356 packet forms / 1,516 field instances hashed before and after — identical |
| UX | Search results always selectable; forms already present show "In packet" (or "In packet (N)" when N ≥ 2 copies exist) and stay selectable. Selecting one opens "This form is already in the packet. Add another copy?" listing the form and count, with Cancel / Add Another (Cancel focused). Non-duplicates add immediately with no dialog. Same behavior in the packet-creation draft editor (entries now removed/keyed by position) |
| New copy | New `packet_forms` row via the normal path: own id, own copied PDF, own field instances on first open (normal defaults, nothing cloned), own lifecycle/annotations/deletion/Signing inclusion |
| Other assumptions checked | Field instances, storage paths, annotations, Signing documents, pending-publication activation, packet-level field-instance ensure, PDF download: all keyed by `packet_form.id` — no change needed. No other `.single()` / `maybeSingle()` / map keyed by `packet_id + form_id` found |
| Coverage | `npm run test:packet-forms-duplicate` (18 unit/contract tests); `npm run validate:duplicate-packet-forms-dev` (real creation / field-instance / soft-delete paths under RLS: normal add, duplicate flagged, cancel creates nothing, distinct second ACTIVE copy with own PDF and 27 own field instances, no value cloning, original row + instances byte-identical at every stage, mixed A-duplicate + B-new, delete one copy leaves others). Pre-migration run failed on the unique index as expected; post-migration run passes. Browser QA on dev: dialog, Cancel (no row), Add Another (second ACTIVE copy), Fill form on the copy |
| Isolation | Shipped from `main` on `fix/duplicate-packet-forms`, independent of the open Native Signing PR #46 branch; no signing/annotation files in the diff |
| Regression | field-instance-sync 17, form/packet-form lifecycle 47, packet-custom + dialogs 19, F5 final-document immutability dev, packet-form annotation auth dev — all pass; `tsc --noEmit`, targeted ESLint, `build:validate` pass |

### Native Signing participant ceremony QA (2026-10-02; PR #46)

**Status:** Development-only. [PR #46](https://github.com/leeharbaugh/harbaugh-forms/pull/46) stays open and unmerged; head moved `4bb2800` → `3f92e48` (four commits: ceremony fixes `0b5b432`, ceremony browser QA `b7e622e`, unlock fix `8fbd588`, in-person QA `3f92e48`). Production untouched (`dpl_E9HTxf45epr8ckKifivWCPNgpFAU`), Native Signing off there, Gate A paused. Dev Supabase `ewxsxwzezhkeawnjvigx` only; email sandboxed; links from the development Copy signing link helper. A random development-only `SIGNING_EVENT_CHAIN_KEY` / `_ID` was added to the gitignored `.env.local` (Lee approved) because finalization requires it.

**QA run:** `scripts/qa-signing-ceremony-browser.ts` (new), all checks pass on the final code, with disposable fixtures cleaned up afterwards. Signing A: P1 "Avery Jordan Stone" (Signature + linked Date, required Initials, optional Initials), P2 "Blake Rivera" (Signature + linked Date, Initials), and one copy recipient. Signing B: Resend / Replace / Revoke, then Decline. Signing C: one in-person participant.

| Area | Result |
|------|--------|
| Entry | Copied link → POST exchange (secret only in the body) → `/sign/continue` without workspace login; HttpOnly entry cookie holds no secret; pre-affirmation shows name / agent / brokerage / title only |
| Affirmation | "I am [Name]" (attestation only) → one ACTIVE ceremony session (60-minute inactivity), presence lease, HttpOnly ceremony cookie; the ceremony is refused without it |
| Consent | Development placeholder disclosure (`dev-placeholder-2026-09-17`, sha256 `a09d0114…`) shown with the dev-copy badge; no marks or Finish before acceptance; reload keeps it unaccepted; acceptance records version id + fingerprint; no re-prompt after reload or Exit |
| Signature | Another participant's name and a wrong-case name are rejected with the exact-match message; the exact name is adopted (unlocked until first use). Caveat appears only in the completed PDF; the ceremony has no rendered mark preview (observation, not a defect) |
| Initials | Suggested "AJS" / "BR"; editable before first use (edited to "AJX", server re-adoption to "AJS" accepted); adopt card hidden after adoption; first use locks it, after which re-adoption returns `MARK_LOCKED` |
| Placement / Date Signed | Sign / Initial here creates ACCEPTED placements on the participant's own fields only; linked Date Signed is a separate placement with the sender-local date (America/Chicago); the completed PDF draws each mark inside its assigned box |
| Remove / Replace | Optional Initials apply → Remove (REMOVED, survives reload) → reapply; Signature Replace (old REPLACED, new ACCEPTED, new Date) and Remove (Date follows) → re-sign; exactly one ACCEPTED per field |
| Freeze | First accepted mark sets `frozen_package_revision_id`; manager Draft field write and amendment lock return `CONFLICT`; document versions unchanged; no preparation controls |
| Finish | Disabled until required fields are done (optional Initials can stay empty); P1 Finish → FINISHED, Signing stays In Progress, no finalization work; reload / return link show no controls; post-Finish writes refused |
| P2 + isolation | P2 sees only its 2 fields (no P1 field ids in the page); P2 session acting on P1 fields → `CEREMONY_FORBIDDEN`; P1 placements unchanged. Exit lands on `/sign/done?outcome=exited`; reopening the link + "I am" resumes with consent and marks kept |
| Finalization | Last Finish → READY, one `FINALIZE_SIGNING` → request-driven worker → VERIFIED / COMPLETE in ~8 s; 1 COMPLETED_DOCUMENT + 1 AUDIT_CERTIFICATE, bytes match sha256, verified before `completed_at`; protected event chain verifies; combined package and three completed-package deliveries SUCCEEDED (sandbox) |
| Completed PDF | HarbaughCaveat embedded; both names, "BR", 2× "AJS", 2× the date inside the assigned boxes; no stale marks; audit certificate names both participants |
| Completed review | Package credentials only after Complete (2 participants + copy recipient); account-free package link lists both artifacts and downloads byte-identical files. Manager: COMPLETE, Finalization VERIFIED, delivery rows, no participant link controls; old invitation link refused |
| Decline | Two-step confirmation with reason; Signing and participant DECLINED; no artifacts / finalization; `PARTICIPANT_DECLINED` by the participant; chain verifies; lands on "You declined to sign"; link refused afterwards; manager sees DECLINED with no completed-package operations |
| Link ops | Resend keeps the link; Replace refuses the old link and the new one reaches affirmation; Revoke refuses. `qa-signing-link-ops-browser.ts` also passes |
| In person | Begin In-Person → hand device → sign → Finish lands on Return to agent with the device lock intact; `/signings` stays locked; password unlock returns to the Signing; finalized to COMPLETE |
| Runtime | 0 unexpected console errors / warnings, 0 page errors, 0 hydration errors, 0 new dev-server ERROR / WARN lines. Expected refusals (replaced / revoked / declined / post-Complete links → 503 unavailable) are classified explicitly |
| Secrets | 7 raw secrets never appeared in ~630 participant request URLs or the dev server log |

**Defects found and fixed (each with regression tests that fail on the old code):**

| Defect | Root cause | Fix |
|--------|-----------|-----|
| Applied Signature never showed its Date Signed | Shell read `renderedSenderLocalDate` from the Signature row, but the date lives on the linked DATE_SIGNED placement | `linkedDateSignedBySignatureField()` (`lib/signing/ceremony-field-view.ts`) |
| A removed field could not be applied again (silent no-op) | Apply used the fixed request id `accept:{field}:new`; the server correctly replayed the earlier (removed) placement | Fresh request id per click, like Replace / Remove |
| Finish / Decline / Exit landed on "Signing access is currently unavailable"; in person this could also clear the device-handoff lock (see security.md R29) | Clearing a cookie in a Server Action re-renders the page; `/sign/ceremony` without its cookie redirected to `/sign/unavailable`, which clears every Signing cookie | Actions redirect server-side: remote → static `/sign/done?outcome=…`, in person → `/sign/return-to-agent` |
| Password unlock landed on `/sign/unavailable` instead of the Signing (lock already released; fail-safe) | Same re-render: Return to agent with no lock cookie redirected before the form's hard navigation ran | With no lock cookie the page renders an "Agent workspace unlocked" notice; unlock keeps its hard navigation (a client-side move would keep the strict `/sign` CSP) |

**Found, not fixed here:**

- **Manager completed-document access gap (pre-existing):** the manager Signing page has no view or download of the completed document or audit certificate. `canReadCompletedSigningArtifacts` is used only in tests, while decisions.md ("Signing artifacts use private immutable storage and server-mediated downloads") expects authorized agents to download. Needs a separate focused PR; likely a production-enablement blocker.
- **Minor wording:** "N of M of your fields complete" counts Date Signed fields.
- **Pre-existing:** `test:native-signing-stage1` / `stage2` run `feature-gate.test.ts` under plain `node --experimental-strip-types`, which cannot resolve `@/lib/supabase/project-guard`. The same files pass 24/24 under `tsx`.

**Validation (QA worktree at `3f92e48`; PR #46's own schema on dev):**

- Unit suites: stage3 11, stage4 50, ceremony 63, TC authority 31, stage6 30, completion delivery 12, recovery access 7, draft prep 64, production readiness 56 (includes bearer transport). Stage1 / stage2 / authority / participant-link-qa / draft-multiselect pass under `tsx`: 64 tests. All 0 fail.
- Dev validators: stage4, ceremony, stage6, completion delivery pass.
- Browser QA: ceremony and link-ops pass.
- `tsc`, changed-path ESLint (10 files), `git diff --check` and `build:validate` pass.
- `npm audit --omit=dev`: 1 critical, GHSA-vcvr-r3jv-pc5j (Next 16.3.5 on this branch; `main` has 16.3.6).

**Merge readiness: do not merge yet.** Remaining blockers:

1. ~~PR #46 conflicts with `main`~~ Resolved 2026-10-02 by merge commit `8769993` (Next 16.3.6, audit clean, full revalidation passed); see "PR #46 merged with current main".
2. Lee's own re-QA of the ceremony, including the new `/sign/done` landing and the in-person hand-back.
3. Lee's decision on the manager completed-document access gap: before merge, or as a tracked follow-up before production enablement.

### Development Copy / Open signing link for participant QA (2026-10-01; PR #46)

**Status:** Development-only QA helper. Production remains OFF/untouched; PR #46 stays open.

| Item | Result |
|------|--------|
| Purpose | Signing email is sandboxed locally, so no invitation arrives. Managers can copy or open the real participant link to QA the ceremony |
| UI | In Progress participant access card, after Resend / Replace / Revoke: **Copy signing link** ("Signing link copied.") and **Open signing link** (new tab, `noopener,noreferrer`). Shown only while the participant has an active link and the helper is enabled. Card note: "Email delivery is sandboxed in development. Use Copy signing link to test the participant ceremony." |
| Gate | `isParticipantLinkQaHelperEnabled()`: `SIGNING_EMAIL_SANDBOX=true`, `VERCEL_ENV` ≠ `production`, and Supabase URL not the production project. The dashboard flag and the server action both use it; the action denies (`FORBIDDEN`) before any lookup |
| Authority / link | Same checks as Resend/Replace/Revoke (`requireInProgressManageableParticipant`: manage authority, In Progress, remote, participant on this Signing); current unrevoked credential only; URL from `buildParticipantInviteUrl` (`/sign/{credential id}#{secret}`), identical to the invitation email |
| Secret handling | Unwrapped only on click; not logged, persisted, evented, or rendered; held only in the click handler |
| Replace / Resend / Revoke | Replace → new link, old refused; Resend → same link; Revoke → controls hidden, action `CONFLICT` |
| Coverage | `lib/signing/participant-link-qa.test.ts` (gate matrix, production denial with no DB access, UI gating, no link in markup/state); Stage 4 dev validator (exact URL, nothing logged, same-org non-manager / other org / Global Admin / other-Signing participant denied, production denial + production dashboard flag off, Resend / Replace / Revoke, no secret in events / work items / instructions); `scripts/qa-signing-link-ops-browser.ts` (copy → participant reaches identity affirmation without login, Open in new tab, Replace → old refused / new works, Resend unchanged, Revoke hides controls; secrets never printed; zero console/server noise; cleanup now also removes ceremony sessions and presence leases) |
| Migration | None |

### Native Signing quality/efficiency closeout (2026-09-30; PR #46)

**Status:** Development-only. Production remains OFF/untouched. PR #46 stays open — technically ready for Lee's final participant-ceremony QA and merge decision; do not merge before that.

| Item | Result |
|------|--------|
| DOMMatrix root cause | `pdfjs-dist/build/pdf.mjs` runs `new DOMMatrix()` at module top level. The Signing dashboard (a Client Component, still server-rendered per request) statically imported the Prepare Documents dialog → `react-pdf` / `lib/pdfjs-setup` → `pdfjs-dist`, so every `/signings/[id]` request failed server rendering (500 + "Please use the legacy build" warning) and the browser recovered by client-rendering |
| Fix | The dashboard loads the dialog with `next/dynamic(..., { ssr: false })` and mounts it only after Prepare Documents is first opened (kept mounted afterwards). No DOMMatrix polyfill; server PDF generation (pdf-lib / fontkit) untouched |
| Script-tag warning | "Encountered a script tag while rendering React component" came from the `next-themes` inline script during that client-side recovery render; gone with the fix |
| Participant routes | `lib/supabase/proxy.ts` redirected `/sign/*` and `/api/sign/*` to workspace login, contradicting "Login is never required to sign". These routes now bypass the workspace-login redirect (device-handoff lock still first); they authenticate with Signing credentials/sessions |
| Dev CSP | `/sign/*` CSP adds `'unsafe-eval'` only when `NODE_ENV=development` (Next dev tooling needs it); production CSP unchanged |
| Lazy viewer | Browser QA: pdf.js is not evaluated on dashboard load, loads on first Prepare Documents open, and reopening reuses the same module instance |
| Boundary guard | `lib/signing/client-boundary.test.ts` walks static imports from every `app/**/page|layout|route` and fails if any reaches `react-pdf`, `pdfjs-dist`, or `lib/pdfjs-setup` |
| Runtime noise | `scripts/qa-runtime-noise.ts` fails both browser QA scripts on any browser console error/warning, page error, or new dev-server ERROR/WARN log line (no allowlist). Link-ops QA now sends through the Draft page Send confirmation and visits the Signings list |
| Batch writes | Not added: group move / multi-delete / paste stay per-field trusted writes on the ordered queue (small selections; each write fully authorized; failures reconcile to server state) |
| Build | `next build` emits no warnings. Remaining non-Next output: Node `MODULE_TYPELESS_PACKAGE_JSON` from the pre-build env guard (repo-wide module type; backlog) and an npm `devdir` env warning from the local shell environment |
| Migration | None |
| Gate A | Remains paused |

### Native Signing manager QA pass 8 (2026-09-28; PR #46)

**Status:** Development-only. Production remains OFF/untouched. PR #46 stays open — do not merge until Lee re-QAs multi-select / group move / copy / paste / delete, Replace signing link feedback, and the remaining Send / In Progress / participant-ceremony flows.

| Item | Result |
|------|--------|
| Multi-select | Click selects one placement; Ctrl-click (Windows/Linux) or ⌘-click (macOS) toggles; Escape or a click on empty page area clears the selection (that click does not place a field); new placements are not auto-selected. Selected placements get a sky ring/fill; the sidebar shows "N placements selected" with Copy / Paste / Remove selected. No marquee |
| Group move | Dragging any selected placement moves the selected placements **on that page** together by one PDF-point delta, clamped as a group to the page so relative geometry is preserved; selected placements on other pages stay put (sidebar says so). No cross-page moves. Followers track live; each moved row persists through the trusted draft-field upsert; no reload, remount, or scroll reset |
| Multi-delete | Delete / Backspace removes the selection via the trusted remove action (a Signature takes its linked Date Signed; Initials and Date Signed remove alone). Ignored while focus is in an input, select, textarea, or contenteditable |
| Copy / paste | Ctrl/⌘+C and Ctrl/⌘+V (plus sidebar buttons) use an in-memory editor clipboard — never the OS clipboard. Paste keeps participant, type, required state, page, size, and relative offsets, shifted 12 pt per successive paste and clamped per page; target is the current document. New rows persist through trusted writes in order (Signatures before Dates) |
| Signature/Date on paste | Copied pair → new linked pair; Signature alone → new paired Date Signed; Date alone → links to its original Signature if still present, else to an undated same-participant Signature on that page, else rejected: "Date Signed needs a Signature for {name}. Copy the Signature with its Date Signed, or place a Signature for {name} first." Never links across participants |
| Geometry | All moves/pastes computed in PDF points via the existing render↔PDF helpers; zoom-independent; browser QA verifies group drag, paste, delete, and close/reopen geometry |
| Replace semantics (audit) | Resend: same credential, new invitation instruction + work item. Replace: prior credential superseded (`is_current=false`, `revoked_at`, `REPLACED_BY_MANAGER`, `replaced_by_credential_id`), new credential in the current access epoch, invitation queued and sent inline; old entry and ceremony sessions fail validation, and old entry sessions are now also explicitly revoked. Revoke: credential revoked + entry sessions revoked, no replacement |
| Replace fix | `replaceParticipantInvitationWithActor` now runs the same In Progress / REMOTE_SEND / active participant / email checks as Resend and Revoke **before** touching credentials (previously a participant without email was revoked and reissued before the enqueue failed) |
| Why Lee saw nothing | The success notice rendered at the page top, away from the participant panel. Now: confirmation dialogs for Replace ("Replace signing link?" — "The participant’s current link will stop working and a new signing link will be sent.") and Revoke; inline status in the participant card ("Signing link replaced." / "The previous link no longer works. A new link has been queued for delivery." / "Email delivery is sandboxed in development."); the panel reloads immediately |
| Access status | Participant card shows Active link / Revoked / No active link, current link issued time, link replaced / revoked times, last invitation queued, last send attempt. Invitation labels are honest: queued, accepted by the email service, accepted by the development sandbox (not sent), failed — never "delivered". No credential ids, tokens, links, or provider references reach the browser |
| Coverage | `lib/signing/draft-multiselect.test.ts` (17); Stage 4 dev validator adds Resend / Replace / Revoke / dashboard-status checks (44 OK); browser QA `scripts/qa-signing-prepare-browser.ts` (multi-select, group drag, paste, typing guard, multi-delete, pair paste, orphan Date rejection, reopen) and new `scripts/qa-signing-link-ops-browser.ts` (Replace/Resend/Revoke UI + DB) |
| Send pending label | Final polish (2026-09-30): the Send confirmation shows "Sending…" while the Send is in progress (was "Activating…", internal lifecycle wording); Begin In-Person keeps its own label. Copy only — activation code and behavior unchanged |
| Migration | None |
| Gate A | Remains paused |

#### Signing Placement Templates — design (not implemented in PR #46)

Audit findings (code/migrations only):

* **Form identity.** `forms` rows are immutable per version once Published; a new revision is a new row (`version_label`, same `form_family_key`, normalized upper-case from `form_code`). Signing documents trace `signing_documents.source_packet_form_id → packet_forms.form_id → forms.id`. Ad hoc uploads have `packet_forms.form_id = null` (and ad hoc Signing documents have no Packet Form).
* **Participant roles.** Packet parties carry `PacketContactRole` (`BUYER`, `SELLER`, `TENANT`, `LANDLORD`, `PRIMARY`, `CO_CLIENT`, `SPOUSE`, `POWER_OF_ATTORNEY`, `OTHER`) from `packet_contacts.packet_role`, or from the representation agreement (BUYER_REP → Buyer, LISTING → Seller), ordered by `sort_order`. Agents/brokers/TCs are never ceremony participants. `signing_participants` keeps only `linked_contact_id` and a human `optional_role` label, not the role code or ordinal.
* **Scope precedent.** `field_defaults` uses PRIVATE (owner) / ORGANIZATION (org) with Private overriding Organization, resolved via `primary_organization_id`.

Recommended design (schema and slot names not locked):

* **Key:** exact `forms.id` (the version row). `form_family_key` is used only to *suggest* a template from an older version ("Template saved for 2024 version — review before applying"), never to auto-apply across versions.
* **Scope / precedence:** Organization templates (org admins) and Personal templates (owner); for a given form version Personal wins over Organization; the manager can choose either explicitly. No Global scope initially.
* **Stored instructions:** per placement — participant slot, field type, page, x/y/width/height (PDF pt), required, linked-Date relationship (template-local id), optional display order. No Contact/User/participant ids, no names, no evidence.
* **Slots:** derived from Packet roles plus ordinal — e.g. Buyer 1 / Buyer 2, Seller 1 / Seller 2, Tenant 1 / 2, Landlord 1 / 2, Client 1 / 2 (PRIMARY/CO_CLIENT). Needs participant role code + ordinal captured at Packet import (new nullable columns on `signing_participants`) so slots resolve without re-reading the live Packet.
* **Save:** from Prepare Documents for a document with a Form version; manager names the template, picks scope, reviews the slot for each participant (defaulted from role + ordinal; unresolved/ad hoc participants must be mapped or excluded).
* **Apply:** explicit "Apply template" per document; mapping dialog shows every slot → participant, highlights unresolved slots, never assigns silently; creates ordinary editable Draft placements through the trusted draft-field writes (Signature + linked Date preserved). No evidence, revisions, or Revision 1 effects. Auto-apply may come later as a suggestion once explicit Apply is proven.
* **Ad hoc PDFs:** out of scope initially (no stable identity); revisit with a content fingerprint later.
* **Next PR:** "Signing Placement Templates (explicit Save/Apply)": migration for `signing_placement_templates` + `signing_placement_template_fields` (deny-by-default RLS, service-role writes) and participant role/ordinal capture; trusted Save/Apply/list/delete actions with `requireSigningActor` + scope checks; Prepare Documents Save/Apply UI with slot mapping; unit, dev validator, and browser QA coverage.

### Native Signing manager QA pass 7 (2026-09-28; PR #46)

**Status:** Development-only. Production remains OFF/untouched. PR #46 stays open — do not merge until Lee re-QAs the content-sized placements.

| Item | Result |
|------|--------|
| Content-driven sizing | New placements are sized from the mark the completed-PDF renderer will draw: expected text (personal signing name, frozen representative `capacity_wording`, shared suggested initials, or the en-CA finalization date) measured with the renderer's font metrics at a target size, plus modest padding, clamped per type; long representative wording caps and shrinks to fit like the renderer. Still resizable |
| Metrics | `lib/signing/mark-metrics-data.ts` generated by `scripts/generate-signing-mark-metrics.ts` from the embedded Caveat font and Helvetica; tests verify it against pdf-lib |
| Canvas labels | Signature/Initials show the expected text in Caveat at the renderer's fitted size and baseline; Date shows "Date"; details in tooltip/aria/sidebar |
| Linked Date | Uses the content-sized Date box; right of the Signature on the same bottom edge when it fits, otherwise below |
| Preview Signing | Standalone Draft-page buttons and "Open Preview Signing…" copy removed. Read-only renderer, route, and dialog mode kept. Readiness stays derived; no preview acknowledgment; Send confirmation unchanged |
| Canonical review | Prepare Documents renders the same selected Draft source snapshot that activation consumes |
| Coverage | `lib/signing/draft-prep-editor.test.ts` (sizing, no-clip against pdf-lib, geometry round trip); browser QA `scripts/qa-signing-prepare-browser.ts` (printed Buyer Rep-style lines, short vs long names, no Preview button, reopen round trip); draft-prep dev validator uses the computed sizes |
| Migration | None |
| Gate A | Remains paused |
### Native Signing manager QA pass 6 (2026-09-28; PR #46)

**Status:** Development-only. Production remains OFF/untouched. PR #46 stays open — do not merge until Lee re-QAs Packet selection / participant population and the new placement defaults.

| Item | Result |
|------|--------|
| Participant-import root cause | Lee's Packet #2 is a Buyer Rep Packet whose parties live in `representation_agreement_clients` (agreement #1); it has no `packet_contacts`. `deriveSigningParticipantsFromPacket` read only `packet_contacts`, derived zero parties, and the bind still committed → "Packet selected, participants missing". Validator fixtures used `packet_contacts`, so they passed |
| Derivation | Now reads ACTIVE `packet_contacts` plus ACTIVE clients of the Packet's representation agreement (BUYER_REP → Buyer, LISTING → Seller); dedupe by contact id; contacts must be ACTIVE and owned by the actor (others skipped with a note) |
| Bind + import | One transaction: parties derived/validated first, then `signing_select_source_packet` RPC (service role only) locks the Signing row, compare-and-sets `source_packet_id` against the value read, and inserts missing parties. Returns the refreshed participant list; the UI reloads before showing the notice |
| Concurrency | Competing selections: exactly one wins; the loser gets CONFLICT/INVALID_PACKET; participants always match the bound Packet. Trigger `signing_documents_enforce_source_packet` rejects inserting/re-including a Packet document from any other Packet in a Draft |
| Participants layout | One **Participants** section in Prepare Signing: Add participant card, then the participant list (role, representative capacity, email or "No email", field warning, Remove participant). The separate bottom Participants card is hidden for a manageable Draft |
| Placement defaults | Signature 150×28, Initials 40×20, Date Signed 72×18 PDF pt (was 160×40 / 80×40 / 100×24), sized from the completed-PDF renderer (Caveat typed marks, Helvetica `YYYY-MM-DD`); linked Date sits right of the Signature on its baseline |
| Labels | Initials show the ceremony's suggested initials (`LH`) via the shared `suggestTypedInitialsFromDisplayName` (moved to pure `lib/signing/initials-suggestion.ts`, re-exported from `adopted-marks.ts`); Signature shows the human signer name; Date shows "Date"; full detail in tooltip/aria/sidebar. Overlays render exact geometry (no minimum inflation) |
| Coverage | `npm run test:native-signing-draft-prep`; `npm run validate:native-signing-draft-prep-dev` (26 checks incl. legacy agreement Packet, races, trigger); browser QA `scripts/qa-signing-prepare-browser.ts` on an agreement-backed Packet |
| Migration | `20260928120000_native_signing_source_packet_selection.sql` (dev only; also binds legacy unbound Drafts whose Packet documents come from one Packet) |
| Known gap | Existing Drafts already bound with Packet documents (e.g. Lee's two Packet #2 Drafts) are not back-filled; add participants manually or start a new Draft |
| Gate A | Remains paused |

### Native Signing manager QA pass 5 (2026-09-28; PR #46)

**Status:** Development-only. Production remains OFF/untouched. PR #46 stays open — do not merge until Lee re-QAs the Draft preparation workflow.

| Item | Result |
|------|--------|
| Prepare Documents layout | Full-viewport workspace reusing the Packet form editor pattern: header with document navigation, zoom / Fit Width / Fit Page toolbar, stacked scrollable pages sized by `computePdfPageWidth` + ResizeObserver, 360px sidebar (participant, field type, selected field, field list) |
| Refresh root cause | Every edit awaited `load()` (set `loading` → unmounted the PDF, reset page/size/selection) then reloaded the dashboard; Rnd reported a drag stop on every click, so selecting persisted + reloaded; the busy re-render disabled **Remove** before its click fired |
| Refresh fix | Local optimistic model + ordered trusted server queue; reconcile from server only on failure; no remount, no page/scroll reset; no-movement drag stops ignored; Remove excluded from drag (`cancel`) and never disabled; press that starts on a field never places a new one |
| Field rules | Removing a Signature removes its paired Date Signed (server + local); Initials / Date Signed remove independently; reassigning a Signature moves its Date Signed to the same participant |
| Dead controls | Decorative Signature / Initials / Date Signed toolbar badges and page-step buttons removed; Participant + Field type dropdowns kept |
| Adoption copy | Only: "Place signing fields for each participant. Participants adopt their signatures and initials when they sign." No Adopt feature in prep |
| One source Packet | Selecting a Packet binds `signings.source_packet_id` (compare-and-set); picker / Add all scoped to it; second Packet rejected server-side; switch allowed only with no Packet documents or Packet-linked participants; first Packet document also binds an unbound Signing; ad hoc PDFs always allowed |
| Participant import | Selecting a Packet imports ACTIVE transaction parties via `deriveSigningParticipantsFromPacket` (dedupe by contact id, missing email allowed, PERSONAL capacity, no agents/brokers/TCs); existing/ad hoc participants never deleted or merged; no live sync |
| Coverage | `npm run test:native-signing-draft-prep`; `npm run validate:native-signing-draft-prep-dev`; browser QA `scripts/qa-signing-prepare-browser.ts` (disposable fixtures) |
| Migration | None |
| In Progress amendment | Still out of scope — no manager UI; never mutate Revision 1 |
| Gate A | Remains paused |

### Native Signing manager QA pass 4 (2026-09-23; PR #46)

**Status:** Development-only. Production remains OFF/untouched. Do not merge until Lee QAs the full Draft document-preparation workflow.

| Item | Result |
|------|--------|
| Ad hoc PDF upload | Draft-only Upload PDF → Signing-owned `AD_HOC_PDF` + `draft-ad-hoc/` snapshot; no Packet/Form/evidence/revision |
| Visual Prepare Documents | Same workspace as Preview; place/move/resize/remove Signature/Initials/Date Signed via `signing_draft_fields` |
| Preview Signing | Remains read-only view of the same Draft source + fields |
| Add default fields | Demoted to optional quick fixture only (removed 2026-10-08) |
| Copy recipients | Configurable in Draft / In Progress / Complete; credentials + delivery only after Complete; fan-out includes preconfigured ACTIVE recipients |
| Migration | `20260923200000_native_signing_ad_hoc_documents.sql` (dev only) |
| In Progress amendment | Still missing manager UI — backend locks exist; do not mutate Revision 1 |
| Gate A | Remains paused |

### Native Signing manager QA pass 3 (2026-09-23; PR #46)

**Status:** Development-only. Production remains OFF/untouched. Do not merge until Lee re-QAs Preview Signing.

| Item | Result |
|------|--------|
| Preview Signing | Manager action near header + Readiness; renders selected Draft source snapshots with Signature/Initials/Date Signed overlays |
| Preview evidence | Non-evidentiary — no revision/version/credential/work item created |
| Field placement edit | Backend upsert/remove exist; manager UI still only **Add default fields** (fixed coords) — visual place/move/resize remains a pre-production gap (visual placement shipped 2026-09-23; Add default fields removed 2026-10-08) |
| Banner copy | Removed general representative-support and typed-adoption banners from Signings list/detail |
| Gate A | Remains paused |

### Native Signing manager QA pass 2 (2026-09-22; PR #46)

**Status:** Development-only UX/product reconciliation. Production remains OFF/untouched. Do not merge until Lee re-QAs.

| Item | Result |
|------|--------|
| Product terminology | User-facing UI uses Signing/Signings; “Native Signing” reserved for internal architecture. Admin → **Signings enabled**. |
| Packet → Create Signing | Owner-only retained. Create action shown only when `packets.owner_user_id` matches the current user (avoids predictable FORBIDDEN). |
| Documents section | Add documents + picker + current Documents list are one continuous Draft section; **Remove document** via Draft path. |
| Add entire packet | Remaining eligible Packet Forms via existing Draft snapshot path; no duplicates; source-packet and standalone modes. |
| Readiness / Send copy | Direct ready/not-ready status language; concise Send confirmation (no representative prose). |
| In Progress ops | Manager panel: delivery status, Resend / Replace / Revoke signing link (no bearer secrets). |
| Copy recipients | Still COMPLETE-only (architectural: add issues completed-package credential + delivery). Pre-Complete config deferred. |
| Pre-first-mark amendment | Backend locks exist; manager amendment UI still missing — next focused PR before production. |
| Gate A | Remains paused |

### Native Signing manager QA follow-up (2026-09-21; in progress on feat/native-signing-manager-qa)


**Status:** Development-only UX/product reconciliation before Gate A. Production remains OFF/untouched.

| Item | Result |
|------|--------|
| Representative signing | Restored as first-class initial-release model (stated capacity; no authority validation). Removed incorrect personal-capacity-only notice. |
| Migration | `20260921200000_native_signing_representative_capacity.sql` applied on **dev** only (21 Native Signing migrations total). |
| Packet → Create Signing | Packet detail **Create Signing** imports eligible Packet Forms + transaction parties |
| Participant removal | Draft **Remove participant** via existing Stage 3 delete path |
| Activated pre-freeze removal | Still unsupported end-to-end (document as follow-up UX gap) |
| Add document | Root cause: picker filtered `packet_forms.status='AVAILABLE'` instead of `ACTIVE` + `availability_state='AVAILABLE'` — fixed |
| Complete list visibility | List now also includes `original_sender_user_id` candidates |
| Signing Controls | Plain-language posture + worker recovery copy |
| User-facing Draft wording | Primary actions say **Create Signing** / **Prepare Signing**; lifecycle badge may still say Draft |
| Gate A | Remains paused pending Lee re-QA |

### Native Signing local development QA enablement (2026-09-21)

**Status:** Local/dev only. `.env.local` sets `NATIVE_SIGNING_ENABLED=true` and `SIGNING_EMAIL_SANDBOX=true` (gitignored). Production remains OFF/untouched.

| Item | Result |
|------|--------|
| Manager entry | Feature-gated **Signings** nav → `/signings` list + Create Draft |
| Detail | `/signings/[signingId]` dashboard + Draft prep panel + Send / Begin In-Person |
| Admin | `/admin/signing-controls` remains system visibility + Run Worker Now |
| Email | Sandbox on — no real Resend delivery from local Send |
| Production | Untouched |

**Recommended next:** Lee visual/functional Native Signing walkthrough in development before Gate A.

Harbaugh Forms is **live** for controlled **Lee-only** production use on `https://forms.harbaughrealestate.com`.

### Native Signing production rollout checkpoint (2026-09-21; audit only)


**Status:** Read-only checkpoint on `main` `fa669c4` (PR #45 squash `01ce26d`). **No production mutation.** **No code blocker remains** before Gate A.

| Item | Result |
|------|--------|
| Code blocker | **None** — bearer transport, Cron `*/2`, manual worker, readiness/migrate-plan helpers are merged |
| Prod readiness `--target=prod` | Refuses when local env points at dev (`ewxsxwzezhkeawnjvigx` ≠ `eetonalyyyssvkyfdoxh`) — correct fail-closed; does not mutate |
| Migrate helper | Dry-run planning OK; `--execute` intentionally refused |
| Remaining blockers | CONFIGURATION + LEGAL/CONTENT + OPERATIONAL (migrations, suspend+bump, secrets, Cron, Resend/DNS/From, site URL, disclosure, backup, security pass, synthetic Signing, deliberate enablement) |
| In-person residual | Classification B retained (not a production enablement blocker) |
| Production | Untouched |

**Gates:** A backup/preflight → B migrate+suspend+bump → C secrets/deploy/email/disclosure → D synthetic Signing → E first real client (Lee approval).

### Native Signing bearer-link transport + Pro Cron recovery (2026-09-21; merged)

**Status:** **Code merged to `main`.** Development code only. **Default-off feature gate still required.** **No production enablement, migrations, secrets, Cron activation, Resend, disclosure, or domain promotion.**

| Item | Result |
|------|--------|
| PR | [#45](https://github.com/leeharbaugh/harbaugh-forms/pull/45) squash-merged `2026-09-21T21:02:51Z` → `main` `01ce26d` (from reviewed `6c9f813`) |
| Feature branch | `feat/native-signing-bearer-transport` deleted after merge |
| Invitation URL | `{base}/sign/{credentialUuid}#{rawSecret}` — path is nonsecret public UUID only |
| Completed-package URL | `{base}/sign/completed/{credentialUuid}#{rawSecret}` |
| Exchange | Client fragment bootstrap → `POST /api/sign/entry-exchange` or `POST /api/sign/completed-package-exchange` → existing HttpOnly sessions → clean `/sign/continue` or `/sign/package` |
| GET landings | Minimal bootstrap pages; **never** authenticate from path alone |
| Legacy path bearers | Old `/sign/<43-char-token>` links fail closed (not a UUID); re-issue invitations/package links in dev after deploy |
| Cron declaration | `vercel.json` schedule `*/2 * * * *` (Pro; **recovery sweep ≤2 min**; primary path remains inline invite + `kickSigningWorkProcessing`) |
| Run Worker Now | Global Admin only on `/admin/signing-controls` → `processSigningWorkBatch` (batch 5); honors feature/work suspension; admin audit `signing_worker_manual_run` |
| Bearer-path logging (emailed links) | **Closed** for participant and completed-package email links — path/query UUID-only; secrets in fragment + POST body; Vercel Runtime/Drains do not auto-log POST bodies |
| Residual | `/sign/in-person/[token]` path-bearer — **acceptable controlled residual / classification B** (supervised, ~15 min, not emailed; not a production blocker) |
| Production migrations | **Not applied**; production `eetonalyyyssvkyfdoxh` remains unlinked/untouched |
| Production Native Signing | **OFF**; no secrets/Cron env/Resend/disclosure enablement from this merge |
| Production Vercel | Merge Ready deployment `dpl_57Rq5QCAkxnasy9tgzScY2BSHcPL` / `3bgi907yf` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` / `oh3z3x7r5`; Auto-assign Custom Production Domains remains disabled |

**Hard production blockers (enablement) remaining:** 20 migrations + suspend/bump; secrets; counsel disclosure; Resend/site URL; feature remains OFF until deliberate enablement. Emailed bearer-path logging mitigation is done for invitation/package links.

**Recommended next:** Begin **Gate A** production rollout preparation (backup/checkpoint verification and final production migration preflight). Do **not** execute migrations until Lee explicitly approves.

### Native Signing production-readiness scaffolding (2026-09-21; merged)

**Status:** **Code merged to `main`.** Development-only scaffolding. **Default-off feature gate still required.** **No production enablement, migrations, secrets, Cron activation, Resend, or disclosure rollout.** Emailed bearer-path logging was a hard enablement blocker at merge time; transport hardening is the follow-on stage above.

| Item | Result |
|------|--------|
| PR | [#44](https://github.com/leeharbaugh/harbaugh-forms/pull/44) squash-merged `2026-09-21T19:01:16Z` → `main` `3ac16c9` (from reviewed `345fed3`) |
| Feature branch | `feat/native-signing-production-readiness` deleted after merge |
| Cron route | `GET /api/internal/cron/signing-worker` — `Authorization: Bearer CRON_SECRET` → `processSigningWorkBatch` (batch 5) |
| Cron declaration (at merge) | `vercel.json` schedule `0 14 * * *` (Hobby daily **sweep**); superseded on transport branch by Pro `*/2 * * * *` |
| Request-driven kick | Finish / Retry Finalization / Resend / Replace / Add Copy → `after()` → same batch processor (kick limit 10); durable queue remains authoritative if kick fails |
| Invitation latency | Send/Begin still delivers invitations **inline** via `deliverEnqueuedParticipantInvitations` |
| Worker feature-OFF | `FEATURE_DISABLED` — no claim/process; queue intact |
| Controls remain distinct | feature / work_suspended / access_suspended+epoch |
| Readiness validator | `validate:native-signing-production-readiness --target=dev\|prod` (read-only; ref-guarded; `vercel.json` ≠ live Cron proof) |
| Migrate helper | `plan:native-signing-production-migrate` dry-run; execute unimplemented |
| Ops UI | Completed-package panel only on COMPLETE (or failed-finalization retry); `/admin/signing-controls` read-only at merge (transport branch adds Run Worker Now) |
| DRAWN | Server reject `DRAWN_MARK_UNSUPPORTED` at adopt |
| Capacity notice | Personal-capacity / typed-only on Draft + Send confirm (warning only; no entity participant type) |
| Bearer path logging (at merge) | Hard production-enablement blocker for emailed links — addressed by transport stage above |
| Production migrations | **Not applied**; production `eetonalyyyssvkyfdoxh` remains unlinked/untouched |
| Production Vercel | Merge Ready deployment `dpl_8oWzhXn8qYfQvgErsMQfk8hoL8Z6` / `606elo9tg` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` / `oh3z3x7r5`; Auto-assign Custom Production Domains remains disabled |

**Hard production blockers (enablement):** 20 migrations + suspend/bump; secrets; counsel disclosure; Resend/site URL; feature remains OFF until deliberate enablement.

**Recommended next:** See bearer-link transport stage above.

### Native Signing production-readiness design audit (2026-09-21, read-only)

**Status:** Audit complete — findings incorporated into scaffolding above. Baseline `main` bookkeeping `b074d7f`; recovery-access squash `cd63d26`.

**Migration inventory (authoritative):** **20** `native_signing*.sql` files (prior “19” estimate superseded). Stage 2 has no migration. First unapplied on production (once linked): `20260914200000_native_signing_stage1_foundation.sql`. Last pre-Signing migration: `20260913200000_scope_brokerage_settings_to_organization.sql`. No post-recovery unrelated migrations.

**Safe post-migrate controls posture (before feature on):** `work_suspended=true` + `access_suspended=true` + fresh bumped production access epoch. Do **not** rely on `20260920180000` existing-row seed (`access_suspended=false`); immediately suspend+bump after that migration applies.

**Control roles (durable):**
| Control | Responsibility |
|---------|----------------|
| `NATIVE_SIGNING_ENABLED` | Product creation / workspace Signing UI / `/sign/*` route entry / worker permission (exact `"true"`) |
| `work_suspended` / `SIGNING_WORK_SUSPENDED` | Parks finalization, combined, invitation, completed-package workers |
| `access_suspended` / `SIGNING_ACCESS_SUSPENDED` + `access_epoch` | Denies external bearer/session auth; parks invitation/package email |

**Hard blockers before production enablement:**
1. Apply all 21 Native Signing migrations to production (with immediate recovery suspend+bump).
2. Install secrets: event-chain HMAC, participant wrap, completed-package wrap, worker secret, `CRON_SECRET`; set `NEXT_PUBLIC_SITE_URL`; Resend From/domain.
3. Counsel-approved disclosure with `is_production_ready=true`.
4. ~~Resolve emailed bearer-path platform logging~~ — closed on transport branch (UUID path + fragment secret); residual in-person path-bearer remains documented.
5. Focused manual security pass; unique Vercel URL then promote (auto-assign custom domains stays disabled).

**Genuine Lee decisions remaining:** (1) Signing email From/domain identity; (2) disclosure approval source/process; (3) confirm typed-only / personal-capacity-only first rollout.

### Native Signing recovery credential/session access gate (2026-09-20; merged 2026-09-21)

**Status:** **Code merged to `main`.** Development migrations applied to `harbaugh-forms-dev` only. **Default-off feature gate still required.** **No production enablement, Cron, secrets, Resend, or disclosure rollout.** Completes the non-authorizing half of the approved recovery decision (work suspension already existed).

| Item | Result |
|------|--------|
| PR | [#43](https://github.com/leeharbaugh/harbaugh-forms/pull/43) squash-merged `2026-09-21T15:02:08Z` → `main` `cd63d26` (from reviewed `bd613a3`) |
| Feature branch | `feat/native-signing-recovery-access` deleted after merge |
| Migrations (dev) | `20260920180000_native_signing_recovery_access.sql` + `20260920190000_native_signing_recovery_access_controls_guard.sql` applied to `ewxsxwzezhkeawnjvigx` |
| Production migrations | **Not applied**; production remains unlinked/untouched |
| Access gate | `signing_system_controls.access_suspended` **OR** `SIGNING_ACCESS_SUSPENDED=true`; missing controls row = deny |
| Access epoch | Stamped onto credentials/sessions/handoffs at issuance; immutable on those rows; bump invalidates prior bearers |
| Epoch anti-rollback | Retired epochs in `signing_access_epoch_history`; controls epoch cannot be restored to a retired value; controls row cannot be deleted |
| Pre-migration rows | Backfilled to sentinel `pre-recovery-access-v0` (fail closed) |
| Dev seed caveat | `20260920180000` sets existing default row `access_suspended=false` for active development; **production apply must immediately suspend + bump epoch before any enablement** |
| Email workers | Invitation + completed-package park/requeue on access suspension; finalization/combined do **not** block on access suspension alone |
| Device-lock recovery | `/sign/unavailable` clears entry/ceremony/handoff/package/device-lock cookies; return-to-agent/ceremony forbidden → unavailable |
| Work suspension | Unchanged (`work_suspended` / `SIGNING_WORK_SUSPENDED`) |
| Production Vercel | Merge Ready deployment `dpl_9NBku1spZRNznq9Be63BAQCzaB4Y` / `ozc8enchb` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment; Auto-assign Custom Production Domains remains disabled |
| Validators | `validate:native-signing-recovery-access-dev`; `test:native-signing-recovery-access` |

**Deferred:** production enablement; production worker cron/secrets/Resend; production recovery migrations; drawn evidence v2; representative signing; polished delivery UI; provider webhooks; DAST.

**Recommended next:** Re-baseline the merged recovery-access repository and prepare the production-readiness implementation/design stage. Do not apply production migrations or configure production Native Signing yet.

### Native Signing completion delivery + copy recipients (2026-09-19; merged 2026-09-20)

**Status:** **Code merged to `main`.** Development migration applied to `harbaugh-forms-dev` only. **Default-off feature gate still required.** **No production enablement, drawn UI, or polished manager delivery UX.** Completed-package delivery (account-free links), copy recipients, purpose-separated credentials/sessions, durable worker dispatch, and recovery work suspension are implemented on development.

| Item | Result |
|------|--------|
| PR | [#42](https://github.com/leeharbaugh/harbaugh-forms/pull/42) squash-merged `2026-09-20T15:29:44Z` → `main` `f68d8bb` (from reviewed `4275ae8`) |
| Feature branch | `feat/native-signing-completion-delivery` deleted after merge |
| Migration (dev) | `20260919180000_native_signing_completion_delivery.sql` applied to `ewxsxwzezhkeawnjvigx` |
| Production migrations | **Not applied**; production remains unlinked/untouched |
| Delivery policy (v1) | Account-free **links only** (attachments deferred; channel column reserved) |
| Credentials | `signing_completed_package_credentials` — hash auth + purpose-separated wrap for same-link resend; soft-remove copy recipient revokes access |
| Sessions | Bearer → HttpOnly `hf_signing_completed_package` (Path `/sign/package`, 60 min) → `/sign/package` |
| Copy recipients | `signing_copy_recipients` soft-remove; post-Complete manage via `canManageCompletedSigningOperations` |
| Fan-out | After Complete: enqueue `DELIVER_COMPLETED_PACKAGE` (never blocks Complete) |
| Worker | POST `/api/internal/signing-worker` + `x-signing-worker-secret`; batch claim for finalize/combined/delivery/invitation |
| Recovery gate | `signing_system_controls.work_suspended` or `SIGNING_WORK_SUSPENDED=true` (workers); credential/session access gate implemented separately (see recovery access section above) |
| Drawn | Still typed-only UI; finalizer fail-closed on DRAWN |
| Production Cron/keys/Resend | **Not configured** |
| Production Vercel | Merge created Ready deployment `dpl_3PJ1TFZdC8YbhGwF85BDDh4Dda6H` / `l1xx1uw19` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment; Auto-assign Custom Production Domains remains disabled |
| Validators | `validate:native-signing-completion-delivery-dev`; `test:native-signing-completion-delivery` |

**Deferred:** production enablement; production worker cron/secret/completed-package wrap keys/Resend; email attachments; drawn evidence v2; representative signing; polished delivery UI; provider webhooks; DAST.

**Recommended next:** After recovery access gate merge, production readiness scaffolding — do not begin production enablement until an explicit prompt is issued.

### Native Signing Stage 6 — finalization (2026-09-18; merged 2026-09-19)

**Status:** **Code merged to `main`.** Development migrations applied to `harbaugh-forms-dev` only. **Default-off feature gate still required.** **No production enablement or polished TC UX.** Completed-PDF finalization, one immutable audit certificate, protected event chain, and optional combined package are implemented on development. Completion delivery is separately merged (see above).

| Item | Result |
|------|--------|
| PR | [#41](https://github.com/leeharbaugh/harbaugh-forms/pull/41) squash-merged `2026-09-19T18:06:20Z` → `main` `1b86aa8` (from reviewed `4c89cc5`) |
| Feature branch | `feat/native-signing-stage-6-finalization` deleted after merge |
| Migrations (dev) | `20260918160000_native_signing_stage6_finalization.sql`; `20260919120000_native_signing_stage6_completed_at_immutability.sql` applied to `ewxsxwzezhkeawnjvigx` |
| Production migrations | **Not applied**; production remains unlinked/untouched |
| Work-item lease | `claimed_by` / `claimed_until` / `processing_started_at` on `signing_work_items` |
| Finalization | `FINALIZE_SIGNING` worker: READY/FAILED → IN_PROGRESS → VERIFIED + lifecycle `COMPLETE`; Complete-then-`SIGNING_COMPLETED` with idempotent repair |
| Completed PDFs | Signing-specific renderer from prepared versions + ACCEPTED placements only; DRAWN fail-closed until richer evidence schema |
| Audit certificate | Exactly one verified `AUDIT_CERTIFICATE` per Signing + frozen revision; sequence boundary before Complete |
| Event chain | HMAC-SHA-256 keyring (`SIGNING_EVENT_CHAIN_KEY_*`); genesis/checkpoint; protected append; MAC-covered `eventOccurredAt` |
| Artifact reads | `canReadCompletedSigningArtifacts` is COMPLETE-only (not Cancelled/Declined) |
| Combined PDF | Optional `GENERATE_COMBINED_PACKAGE` after Complete; failure cannot block Complete |
| Retry | Primary / co-agent / TC / ORG_ADMIN via `requestFinalizationRetryWithActor` |
| Production Vercel | Merge created Ready deployment `dpl_F9h6ybtjXVMeJ4LjbiUDvkbryyHE` / `iyxfqjpn3` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` (`oh3z3x7r5`); Auto-assign Custom Production Domains remains disabled |
| Validators | `validate:native-signing-stage6-dev`; `test:native-signing-stage6` |

**Deferred after Stage 6 (partially addressed by completion-delivery merge):** production rollout/enablement; reminders; representative signing model; drawn-mark evidence schema upgrade (UI remains typed-only; server DRAWN accept + finalizer fail-closed); polished TC UI; admin artifact remediation; authenticated DAST; external timestamp anchoring; full restore credential/session gate; durable production worker scheduling/secrets.

**Recommended next:** Re-baseline after recovery-access merge and prepare production-readiness scaffolding (keys/cron/Resend/docs + recovery suspend+bump checklist). Do not begin production enablement or drawn-signature implementation until an explicit prompt is issued.

### Native Signing pre-production blocker audit (2026-09-20, read-only)

**Status:** Audit only — no schema/code/production changes. Current `main` bookkeeping HEAD `5a841ff`; completion-delivery squash `f68d8bb`.

**Hard blockers before any production Native Signing enablement:**

1. ~~Recovery **credential/session access gate**~~ — merged to `main` `cd63d26` (reviewed `bd613a3`); still must be included in production migration plan with immediate suspend+bump after apply.
2. Production Native Signing migrations (Stages 1–6 + TC + completion delivery + recovery access) not applied.
3. Production secrets/config: event-chain HMAC, participant wrap, completed-package wrap, worker secret, `NEXT_PUBLIC_SITE_URL`, Resend, feature gate still off.
4. Production worker scheduling (no `vercel.json` cron; worker route is POST-only so Cron needs an authenticated GET→batch adapter).
5. Counsel-approved electronic-signing disclosure marked `is_production_ready` (seeded text is explicit development placeholder; production runtime fails closed).

**Hard blockers before external participant use (after schema/keys exist):** production Resend From/domain; synthetic then Lee-owned email smoke; feature-on with work still deliberately controlled; first controlled Signing plan.

**Strong pre-production requirements:** minimal delivery/ops UI or documented ops path for copy/resend/replace/revoke after Complete; stuck-work visibility; backup + restore runbook tying suspension + access epoch; focused manual security pass; Vercel unique-URL then promote pattern.

**Can follow controlled rollout:** provider webhooks (ACCEPTED ≠ inbox); polished TC Settings UI; DAST breadth; package Close UX; attachments; delivery-contact override; monitoring polish.

**Optional later / case-specific:** drawn v2 (typed-only ships); representative signing (product-approved model exists, unimplemented — blocks representative cases only); external timestamping.

**Recommended next implementation stage:** **B — Production-readiness scaffolding** (cron adapter, secrets inventory, disclosure publication path, ops checklist including recovery suspend+bump after migrate). Do not apply production Native Signing migrations or enable the feature until an explicit prompt.

**Recommended full sequence:** ~~recovery access gate~~ → production readiness scaffolding (cron adapter, secrets inventory, disclosure publication path, ops checklist) → focused pre-production security → controlled Lee-only production enablement → representative signing as needed → drawn v2 later.

### Transaction Coordinator / operator authority foundation (2026-09-18)

**Status:** **Code merged to `main`.** Hybrid `signing_operator_delegations` + `signing_operator_associations`; create-on-behalf splits creator vs responsible PRIMARY; honest `TRANSACTION_COORDINATOR` event attribution; Cancel; historical read after revoke; provenance immutability; revoke releases TC amendment locks. Development migrations applied to `harbaugh-forms-dev` only. **Default-off feature gate still required.** Stage 6 finalization is separately merged (see above). Production Native Signing remains unavailable (no Native Signing schema there).

| Item | Result |
|------|--------|
| PR | [#40](https://github.com/leeharbaugh/harbaugh-forms/pull/40) squash-merged `2026-09-19T01:14:28Z` → `main` `5ec0b97` (from reviewed `df32ab5`) |
| Feature branch | `feat/native-signing-tc-authority` deleted after merge |
| Migrations (dev) | `20260917150000_native_signing_tc_operator_authority.sql`; `20260918120000_native_signing_tc_provenance_immutability.sql` applied to `ewxsxwzezhkeawnjvigx` |
| Production migrations | **Not applied**; prod still has no Native Signing schema |
| TC model | Persistent many-to-many delegations + Signing-scoped operator associations; `signing_agent_associations` remain PRIMARY/CO_AGENT only |
| Create-on-behalf | Creator = TC; PRIMARY/`original_sender_*` = responsible User; operator association = TC |
| Actor precedence | PRIMARY → CO_AGENT → TRANSACTION_COORDINATOR → ORG_ADMIN |
| Ceremony | TC manage never authorizes participant ceremony writes |
| Production Vercel | Merge created Ready deployment for `5ec0b97` (`harbaugh-forms-74yck7g2v…`) — **not promoted** to custom domains |
| Live domains | Remain on previously approved production deployment (auto-assign custom production domains disabled) |

**Deferred:** polished TC Settings/team UI; production Native Signing enablement.

### Native Signing Stage 5 — participant ceremony (2026-09-17)

**Status:** **Code merged to `main`.** Development migrations applied to `harbaugh-forms-dev` only. **Default-off feature gate still required.** **No completed-PDF finalization, audit certificate, reminders, copy recipients, or production enablement.** Production Native Signing remains unavailable (no Stage 1–5 schema there).

| Item | Result |
|------|--------|
| PR | [#39](https://github.com/leeharbaugh/harbaugh-forms/pull/39) squash-merged `2026-09-17T21:13:11Z` → `main` `8c18c7d` (from reviewed `d950f6b`) |
| Feature branch | `feat/native-signing-ceremony` deleted after merge |
| Migrations (dev) | `20260917120000_native_signing_ceremony_foundation.sql`; `20260917130000_native_signing_ceremony_disclosure_fingerprint.sql`; `20260917140000_native_signing_ceremony_device_handoff_lock.sql` applied to `ewxsxwzezhkeawnjvigx` |
| Production migrations | **Not applied**; prod still has no Stage 5 ceremony tables / no production Native Signing enablement |
| Session model | **Model B** — Stage 4 `hf_signing_entry` is pre-ceremony only; after **I am [Name]** authority is `hf_signing_ceremony` / `signing_browser_sessions` |
| One-active-session | Unique partial index + transactional supersession; old tab gets `SESSION_SUPERSEDED` |
| Presence | `signing_participant_presence_leases` begin only after affirmation; heartbeat renews lease only |
| Inactivity | 60 minutes from last meaningful activity; heartbeat does not extend inactivity |
| Pre–I am UI | Participant name, sending agent, brokerage, optional Signing title; no docs/PDF/progress |
| Consent evidence | `signing_consent_disclosure_versions` + participant `consent_disclosure_version_id` / `consent_content_sha256`; timeout does not re-prompt when version unchanged |
| Full names | Free-form display name (no first/middle/last schema); multi-middle, hyphenated, apostrophe, prefix/suffix supported |
| Mark locking | Per participant + mark type; typed Signature exact match; typed Initials suggested and editable until first use; package freeze remains global on first accepted mark |
| Date Signed | Linked automatic date follows Signature remove/replace with fresh acceptance time |
| Finish vs Complete | Last Finish sets `finalization_condition=READY` + enqueues `FINALIZE_SIGNING` work item; lifecycle stays `IN_PROGRESS` (not `COMPLETE`) |
| Decline | Whole-Signing terminal `DECLINED` with confirmation; ends sessions/leases |
| In-person | `signing_in_person_handoffs` + `/sign/in-person/{token}` → same pre-affirm / ceremony model |
| Shared-device isolation | HttpOnly `hf_device_handoff_lock` + proxy redirect; readable companion `hf_device_handoff_active`; private workspace `Cache-Control: no-store`; `pageshow`/bfcache guard → `/sign/return-to-agent`; handoff/unlock use `location.replace`; path allowlist uses `/sign` segment boundaries so `/signings` stays blocked |
| Device-lock scope | **Browser/device cookie scoped** (not account-global); second independent device remains usable |
| Browser/RLS | All new ceremony tables deny-by-default + FORCE RLS |
| Production Vercel | Merge created Ready deployment `dpl_D4CZgESYkyiVkxQoghgnXgtvHy4o` / `9i5ao5ynn` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` (`oh3z3x7r5`); Auto-assign Custom Production Domains remains disabled |
| Tests | Pre-merge on `d950f6b`: `test:native-signing-ceremony` 60/60; Stage 1–4 green; `validate:native-signing-ceremony-dev` green on `ewxsxwzezhkeawnjvigx`; audit 0; tsc; ESLint; `git diff --check`; `build:validate` |

**Settled ceremony decisions (documented before implement):** Model B sessions; one active ceremony session; presence after I am; pre-affirmation disclosure; meaningful-activity inactivity; consent resume after timeout; mark-type locking; Date Signed follows Signature; typed **Signature** exact match without OCR; typed **Initials** suggested and editable until first use; multi-participant names without truncation; in-person **device handoff lock** + **Return-to-Agent** unlock (password re-verify; not finalization); production refuses non-`is_production_ready` disclosure via `assertProductionDisclosureReady`; consent version+fingerprint evidence; shared-device Back/bfcache isolation via no-store + lifecycle guard.

**Return-to-Agent / shared-device residual limitations:** Not OS kiosk mode; does not disable browser chrome or prevent a determined local attacker with physical access; bfcache/history isolation relies on no-store headers, history.replace on handoff/unlock, and a client `pageshow` guard that leaves restored workspace pages when the companion flag is set (HttpOnly lock remains authoritative on fresh requests). Unlock requires the issuing agent session + password re-verify. Device-lock TTL is **240 minutes** (independent of the shorter handoff entry-token TTL).

**Still deferred after this stage:** completed signed PDFs, audit certificate generation, finalization worker beyond pending/enqueue, reminders, overdue, copy recipients, completed-package delivery, admin integrity remediation, production migrations/enablement, drawn-mark UI surface (server accepts drawn paths; typed path is the shipping UI).

**Recommended next:** Await an explicit Native Signing finalization design/implementation prompt. Do not begin finalization or production enablement. Do not promote Vercel.


### Native Signing Stage 4 — Draft source snapshots + activation foundation (2026-09-16)

**Status:** **Code merged to `main`.** Development migrations applied to `harbaugh-forms-dev` only. **Default-off feature gate still required.** **No participant signature/initials ceremony, Finish Signing, finalization, or production enablement.** Production Native Signing remains unavailable (no Stage 1–4 schema there).

| Item | Result |
|------|--------|
| PR | [#38](https://github.com/leeharbaugh/harbaugh-forms/pull/38) squash-merged `2026-09-16T22:17:02Z` → `main` `751dde6` (from reviewed `b10a38d`) |
| Feature branch | `feat/native-signing-stage-4` deleted after merge |
| Migrations (dev) | `20260915160000_native_signing_stage4_draft_snapshots_activation.sql`; `20260915161000_native_signing_stage4_credential_wrap.sql`; `20260915162000_native_signing_stage4_wrap_key_version.sql`; `20260915163000_native_signing_stage4_entry_sessions.sql` applied to `ewxsxwzezhkeawnjvigx` |
| Production migrations | **Not applied**; prod still has no `signing_*` tables / no `signing-artifacts` / no `NATIVE_SIGNING_ENABLED` / no wrap keys |
| Draft source snapshots | `signing_draft_source_snapshots`: exact source PDF in `signing-artifacts` + `field_views_json` + `annotations_json` + `content_fingerprint`; selected via `signing_documents.selected_draft_source_snapshot_id`. Immutable preparation history — **not** evidentiary `signing_document_versions` |
| Drift | Server fingerprint of live render inputs vs selected snapshot; `CURRENT` / `SOURCE_CHANGED` / `SOURCE_UNAVAILABLE`; Keep Current acknowledges one live fingerprint; Update to Latest inserts a **new** snapshot |
| Re-include | Preserves selected Draft snapshot; surfaces Source Changed if live drifted; no silent refresh |
| Prepared PDF | Promotion/activation renders from selected Draft snapshot (not live `packet_form`); snapshot bytes are hash-verified before rendering and fail closed |
| Dashboard / readiness | `/signings/[signingId]` + derived preflight (never a Ready lifecycle state) |
| Activation | Common `activateSigningWithActor` (`REMOTE_SEND` \| `IN_PERSON`); idempotency via `signing_operation_idempotency`; Revision 1 + credentials then Draft → In Progress |
| Credentials | `signing_participant_credentials`: `token_hash` verifier (authentication never decrypts) + server-only `token_wrapped` for invitation retry, AAD-bound to `credentialId\|signingId\|participantId\|wrapKeyId` and stamped with `wrap_key_id`; unusable until In Progress |
| Credential wrap key | **Dedicated and required:** `SIGNING_CREDENTIAL_WRAP_KEY_ID` + `SIGNING_CREDENTIAL_WRAP_KEY`, optional decrypt-only `SIGNING_CREDENTIAL_WRAP_PREVIOUS_KEYS`; **no Supabase-key fallback**; missing/malformed fails closed. Not configured in production |
| Delivery | Outbox `signing_work_items` + instructions/attempts; email failure does not undo activation; IN_PERSON skips invitation emails |
| Entry exchange | `/sign/{token}` Route Handler validates the credential, creates a `signing_entry_sessions` row, sets `hf_signing_entry` (HttpOnly, Secure, SameSite=Lax, Path=/sign, 30 min), 303 → `/sign/continue`; all failures are a bare 404 |
| Entry shell | `/sign/continue` re-validates the cookie session (unexpired, unrevoked, In Progress, credential still current); “I am [Name]” disabled; ceremony pending |
| Referrer / caching | `/sign/:path*` sends `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` |
| Object-key namespaces | Preparation history `.../draft-snapshots/{id}/source.pdf` vs evidence `.../versions/{id}.pdf`, with `isDraftSourceObjectKey()` / `isPreparedVersionObjectKey()` predicates |
| Browser/RLS | Stage 4 tables (including `signing_entry_sessions`) deny-by-default + FORCE RLS; grants revoked |
| Production Vercel | Merge created Ready deployment `dpl_TCezQbmLTEhnYVdkqUGJxq3n6SyZ` / `3ngjvvg09` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` (`oh3z3x7r5`); Auto-assign Custom Production Domains remains disabled |
| Tests | Pre-merge: `test:native-signing-stage4` 50/50; Stage 1 13; Stage 3 11; validators Stage 1–4 green on reviewed `b10a38d` |

**Architecture/security review fixes (included in merge via `b10a38d`):**

1. **Dedicated wrapping key.** Credential wrapping no longer falls back to `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. Purpose-separated key + `wrap_key_id` + previous decrypt-only keys for rotation.
2. **AAD row binding.** Ciphertext bound to `credentialId|signingId|participantId|wrapKeyId`. Envelope `v2.`.
3. **Draft snapshot vs evidence.** Immutable snapshot bytes are preparation history, not evidentiary versions. Distinct Storage namespaces.
4. **Token exchange.** `/sign/{token}` → HttpOnly entry session → `/sign/continue`.
5. **Retention.** Superseded Draft snapshots retained as preparation history until a later policy; evidence-free document hard-delete cleans snapshot rows/objects.
6. **Stage 3 validator Stage 4-aware.** Update to Latest before version-change promotion; cleanup clears Stage 4 snapshot pointers/objects.

**Still absent (next stage / later):** participant Signature/Initials ceremony, Finish Signing, Decline UX, amendment lock UI, reminders, completed PDFs/audit certificate, completion emails, copy recipients, admin integrity UI, protected-key event chain, Draft-snapshot retention policy, production enablement.

**Recommended next:** Await an explicit participant-ceremony design/implementation prompt. Do not begin that stage. Any environment that activates a Signing must set `SIGNING_CREDENTIAL_WRAP_KEY_ID` and `SIGNING_CREDENTIAL_WRAP_KEY` before enablement.

### Native Signing Stage 3 — Draft preparation + activation-snapshot primitives (2026-09-15)

**Status:** **Code merged to `main`.** Development migrations applied to `harbaugh-forms-dev` only. **Default-off feature gate still required.** **No Send / Begin In-Person Signing / ceremony UI / credentials / email / production enablement.** Production Native Signing remains unavailable (no Stage 1 schema there).

| Item | Result |
|------|--------|
| PR | [#36](https://github.com/leeharbaugh/harbaugh-forms/pull/36) squash-merged `2026-09-15T19:02:58Z` → `main` `cbc593c` (from reviewed `bf949a1`) |
| Feature branch | `feat/native-signing-stage-3` deleted after merge |
| Migrations (dev) | `20260915120000_native_signing_stage3_draft_preparation.sql`; `20260915130000_native_signing_stage3_draft_document_inclusion.sql`; `20260915140000_native_signing_stage3_draft_display_order_partial.sql` applied to `ewxsxwzezhkeawnjvigx` |
| Production migrations | **Not applied**; prod still has no `signing_*` tables / no `signing-artifacts` / no `NATIVE_SIGNING_ENABLED` |
| Draft model | Mutable `signing_documents` (+ display metadata + `included_in_draft`), `signing_participants`, and new `signing_draft_fields`; revision-scoped `signing_fields` remain immutable evidence |
| Draft ops | Trusted server document add/remove/reorder/metadata; participant add/update/remove; Signature/Initials/DATE_SIGNED draft fields; Stage 3 server actions authorize-then-elevate |
| Prepared PDF | `renderPreparedPacketFormPdf` reuses `getFilledPacketFormPdfBytes` / Fill Form pipeline; stale `update_date` guard; ceremony marks not applied |
| Document versions | `ensurePreparedDocumentVersion`: render → SHA-256 → opaque Storage key → upload/verify → insert; same-document reuse only; mismatch fails closed |
| Package promotion | Internal `promotePackageRevisionFromDraftWithActor` only (not browser-exported): prepare versions first, draft fingerprint TOCTOU checks, complete revision snapshot, advance `current_package_revision_id` last; incomplete revision abandoned; pointer rollback is CAS-scoped to this promotion only |
| Browser/RLS | Stage 1 deny-by-default preserved; `signing_draft_fields` deny + FORCE RLS + grants revoked |
| Production Vercel | Merge created Ready deployment `dpl_7csiAdX8pP61MBR6AyB6vJkw7j4P` / `13rpdi82n` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` (`oh3z3x7r5`); Auto-assign Custom Production Domains remains disabled |
| Tests | Pre-merge review on `bf949a1`: `test:native-signing-stage3` 11/11; `validate:native-signing-stage3-dev`; Stage 1–2 tests/validators; R3/R5/R7/R8/R9/R10 + annotation-auth + secure-publish + PDF regressions; `npm audit --omit=dev` 0; `tsc`; Stage 3 ESLint; `git diff --check`; `build:validate` |

**Draft preparation representation:**

* Logical documents: `signing_documents` (mutable Draft inclusion via `included_in_draft`; soft-exclude after versions/revision history exist).
* Participants: `signing_participants` (Signing-owned name/email/role; optional User/Contact links).
* Signer fields: **`signing_draft_fields`** (additive) — not `signing_fields`.
* Ordinary Draft editing creates **no** `signing_document_versions` and **no** `signing_package_revisions`.
* **Approved product model (documentation 2026-09-15):** adding a document selects a Signing-owned **Draft source snapshot** that must remain stable if the live `packet_form` later changes; Keep Current / Update to Latest is explicit; activation renders the selected Draft snapshot, not live form drift. That Draft source snapshot is preparation state—not a `signing_document_version`, not a package revision, and not Revision 1.

**Stage 3 implementation gap vs approved Draft source-snapshot model:**

* **Closed by Stage 4 (merged to `main` via PR #38).** Stage 3 historically stored only live `source_packet_form_id` and rendered the current `packet_form` at promotion. Stage 4 adds reproducible Draft source snapshots, drift detection, Keep Current / Update to Latest, and snapshot-based promotion/activation.

**Immutable activation-snapshot machinery (internal only):**

* Exact prepared PDF bytes + SHA-256 fingerprint + private `signing-artifacts` objects.
* Same-logical-document version reuse; no cross-document hash dedupe.
* Integrity verification preserves expected hash and fails closed for promotion/reuse.
* Complete package revision freeze (documents/versions, participants, evidence `signing_fields`, pointer advance).

**Explicitly still unavailable on `main` (Stage 4+):** reproducible Draft document source snapshots; source-change detection + Keep Current / Update to Latest; Signing dashboard readiness/preflight; common activation; participant credentials + dedicated credential wrap key; delivery outbox; `/sign` entry exchange and shell; ceremony; production enablement. See Stage 4 section above for the feature-branch implementation.

**Recommended next:** Review/merge Stage 4 when ready; do not begin the ceremony stage until an explicit prompt.

### Native Signing Stage 2 trusted server authority (2026-09-14)


**Status:** **Code merged to `main`.** **Default-off feature gate still required.** **No ceremony UI, credentials, PDF preparation, email, or production rollout.** Production Native Signing remains unavailable (no Stage 1 schema there).

| Item | Result |
|------|--------|
| PR | [#34](https://github.com/leeharbaugh/harbaugh-forms/pull/34) squash-merged `2026-09-14T23:27:50Z` → `main` `18adfb7` (from reviewed `4729d19`) |
| Feature branch | `feat/native-signing-stage-2` deleted after merge |
| Migration | **None** — Stage 1 schema sufficient; no Stage 2 migration |
| Server layer | `lib/signing/actor.ts`, `eligibility.ts`, `authority.ts`, `operations.ts`, `actions.ts` |
| Operations | `createDraftSigningAction` / `createDraftSigningWithActor`; `getSigningAction` / `getSigningForActor`; `updateDraftSigningTitleAction` / `updateDraftSigningTitleForActor` (Draft title only) |
| Feature gate | Every operation calls `assertNativeSigningEnabled()`; production remains unset/off |
| Authority | Current management = eligible primary/co-agent association or originating `ORG_ADMIN`; historical read retained for former associated agents; UUID possession alone is insufficient |
| Originating org (create) | `profiles.primary_organization_id` when among ACTIVE memberships; else sole ACTIVE membership; else fail closed — never browser-chosen, never arbitrary multi-org pick. Read/update do not re-derive create-time org. |
| Browser/RLS | Stage 1 deny-by-default unchanged; service-role used only after `requireSigningActor` |
| Production Vercel | Merge created Ready deployment `dpl_6AM37WRqM7h6Mwh7bRpw6Vf6ArB3` / `766sx3lox` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` (`oh3z3x7r5`); Auto-assign Custom Production Domains remains disabled |
| Tests | Pre-merge review: `test:native-signing-stage2`; `validate:native-signing-stage2-dev`; Stage 1 R12; R3/R5/R6/R8/R9 + annotation-auth + R1 audit + `tsc` + Stage 2 ESLint + `git diff --check` + `build:validate` |

**Explicitly still unavailable:** participant credentials/sessions, `/sign` routes, Send/In Progress ceremony, package revisions/PDF snapshots, artifacts, email/reminders, work queues/idempotency, co-agent management UI, production enablement.

**Recommended Stage 3:** Merged to `main` (PR #36 → `cbc593c`). See Stage 3 section above.

### Native Signing Stage 1 foundation (2026-09-14)

**Status:** **Code merged to `main`.** Development database has Stage 1 migrations. **Production database does not.** **Native Signing is not feature-enabled in production.** **No ceremony UI.** Stage 2 trusted server authority is also merged (see above); ceremony/package preparation has not started.

| Item | Result |
|------|--------|
| PR | [#32](https://github.com/leeharbaugh/harbaugh-forms/pull/32) squash-merged `2026-09-14T21:33:35Z` → `main` `6730534` (from reviewed `8c3dfa0`) |
| Feature branch | `feat/native-signing-stage-1` deleted after merge |
| Development migrations | `20260914200000` + `20260914210000` + `20260914211000` applied to `harbaugh-forms-dev` (`ewxsxwzezhkeawnjvigx`) |
| Production migrations | **Not applied** to `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`); no production `signing_*` tables; no production `signing-artifacts` bucket |
| Feature gate | Server env `NATIVE_SIGNING_ENABLED` — enabled only when exactly `true`; default off; **not configured in production** |
| Storage (dev) | Private bucket `signing-artifacts`; no authenticated-browser Storage policies; restrictive deny policies for anon/authenticated |
| Browser access | All Stage 1 Signing tables: RLS enabled + FORCE RLS; restrictive deny for `anon`/`authenticated`; grants revoked from browser roles |
| Production Vercel | Merge created Ready deployment `dpl_78nXhcLTLd6d24nEXcxmjLtqGAWX` / `od5w4a7mo` — **not promoted** to custom domains |
| Live custom domain | Remains prior approved deployment `dpl_2CMdac6EViudwyp6TgoQbHf8htiM` (`oh3z3x7r5`); Auto-assign Custom Production Domains remains disabled |
| Fill Form | Unchanged — `typed_signature` / `date_signed` remain agent markup |

**Tables introduced (13):** `signings`, `signing_agent_associations`, `signing_documents`, `signing_document_versions`, `signing_package_revisions`, `signing_package_revision_documents`, `signing_participants`, `signing_package_revision_participants`, `signing_fields`, `signing_adopted_marks`, `signing_field_placements`, `signing_artifacts`, `signing_events`.

**Intentionally deferred (later stages):** participant/completed-package credentials, browser sessions, copy recipients, delivery instructions/attempts, presence leases, amendment locks, work items, idempotency records, `/sign` routes, Resend, finalization, protected-key event-chain verification behavior.

**Implementation choices recorded for Stage 1:** UUID PKs; readable CHECK vocabularies; composite `(signing_id, id)` FKs for same-Signing integrity; root current/frozen revision and primary-agent pointers use composite `(signings.id, pointer)` FKs so they cannot reference another Signing; package-revision document snapshots require the version to belong to the cited logical document; signer fields require revision document/participant snapshots from the same package revision; `ON DELETE RESTRICT` / `SET NULL` only (no CASCADE); `signing_events` server-assigned `sequence_number` + update-blocked append-only; nullable `content_sha256` / integrity digest columns reserved but **not** claimed as implemented verification; `drawn_path_json` supplemental only.

**Validation (development):**

* `npm run test:native-signing-stage1` — 13/13
* `npm run validate:native-signing-stage1-dev` — passed (deny-by-default tables/Storage; cross-Signing root pointers rejected; Fill Form DRAFT annotations still work)
* R1–R10 applicable suite: `npm audit` 0 vulns; secure-publish / account-state / final-immutability / packet-reference / audit-atomic / brokerage-org / annotation-auth validators passed; `test:secure-publish` 12; `test:auth-confirm` 30; `test:auth-bootstrap` 7; `test:admin-audit` 20; `test:admin-orgs` 4; `test:admin-invite` 37; `test:storage-paths` 18; `test:packet-form-lifecycle` 7; `test:date-signed-annotation` placement suite; `tsc --noEmit`; ESLint on Stage 1 files; `git diff --check`; `npm run build:validate` passed

**Recommended Stage 2:** Trusted server-side Signing authorization helpers and operational foundations (create/read Signing rows only through server paths gated by `assertNativeSigningEnabled()`, originating-brokerage / agent-association authority checks, still no participant credentials or ceremony UI).

### Native Signing Stage 2 note

Stage 2 trusted server authority is merged to `main` (PR #34 → `18adfb7`). See **Native Signing Stage 2 trusted server authority** above. Stage 3 Draft preparation + activation-snapshot primitives are merged to `main` (PR #36 → `cbc593c`); Stage 3 database changes remain development-only.

### Signatures orientation and repository audit (2026-09-14)

**Status:** Complete. Superseded for implementation status by **Native Signing Stage 1 foundation** above. Orientation findings remain valid: Fill Form annotations are not legal Signing evidence; F1–F11 remain non-regression invariants; external participant auth is a later boundary.

### Native e-signature architecture design (2026-08-19)

**Status:** Domain/architecture design recorded in `decisions.md`. **Stage 1 foundation schema is implemented in development** (see above); ceremony, credentials, delivery, and production enablement have not started.

A read-only immutable-document audit is complete. Durable architecture decisions are recorded in `decisions.md`; no signing implementation or schema exists yet. The approved working table model separates `signings`, logical Signing Documents, immutable document versions, package revisions and their frozen document/participant snapshots, participants, signer fields, adopted marks, placements, generated artifacts, append-only events, scoped participant and completed-package credentials, copy recipients, temporary browser sessions, delivery instructions/attempts, agent associations, participant-presence leases, and amendment locks. Durable rows use UUID relationships; Signing event order uses a server-assigned bigint sequence; controlled values are readable constrained text; and JSON metadata is sanitized, supplemental, and non-authoritative. Evidence-bearing Signing records never cascade-delete or disappear through ordinary application actions; defect remediation is narrowly system-admin-only and auditable. The server is the final authority for every Signing write; browser clients receive only narrowly scoped access and cannot directly mutate Signing evidence. Raw bearer tokens are not stored or logged, sessions are server-controlled and invalidated with their source link, and requests revalidate authority and current state. Email-link-only access remains an intentional usability/security tradeoff, with revocation and replacement if a link is exposed. Signing artifacts use a dedicated private immutable store; long-lived recipient links receive only short-lived, artifact-specific download authorization after server validation. Signing-owned current state remains authoritative and meaningful changes append server-sequenced immutable events. Event and actor values are human-readable, controlled, and extended only through additive, version-controlled migrations; historical meanings are never repurposed. Prepared and completed PDFs receive SHA-256 fingerprints, and a protected-key-authenticated per-Signing event chain is verified during finalization and later read-only integrity checks. Raw bearer tokens are not stored; signing and completed-package credentials have separate scopes. Locks and leases always expire under server control and stale editors cannot save. Field saves and Finish Signing are server-authoritative and idempotent; reconnecting participants recover confirmed progress and see an accurate remaining-field count. Finalization is deterministic, resumable, and administratively retryable without permitting evidence edits or a manual Complete override; Complete occurs only after every individual completed PDF and the Signing-wide certificate are stored and verified, while email delivery remains separate. Existing product decisions remain: brokerage oversight and co-agent authority, permanent historical agent access, dedicated signature/initial-only ceremony, automatic dates, reusable User presets, daily reminders, optional non-terminal Overdue, separate completed PDFs, non-expiring revocable recipient links, and no user-facing Void. Remaining work after the 2026-09-14 orientation is staged implementation beginning with the approved Stage 1 foundation (see above), not further open-ended redesign of settled decisions.

Initial Signing infrastructure choices are now settled: immutable Signing artifacts use a dedicated private Supabase bucket, and transactional Signing email starts on Resend's free tier behind a provider-neutral delivery boundary. Remaining provider work is configuration, monitoring, and implementation—not selection of the initial vendors.

Participant electronic consent is likewise settled as one retainable, plain-language disclosure and affirmative access-and-consent action per Signing; final counsel-approved text and paper-record handling remain pre-release work.

The Signing ceremony has an approved accessible interaction baseline; exact compliance standard and verification remain implementation and pre-release work.

**Workspace refinement (2026-09-14):** Packet Form instances can be renamed without changing canonical Forms, and Settings can save a personal “Show only my data” view filter for owned business records. These changes support clearer packet composition and day-to-day administrator focus alongside the planned Signing work.

### Packet property picker production rollout (2026-08-18)

**Status:** **Complete.** Two related UI/state improvements are live. **No schema, migration, RLS, or packet/property relationship changes.**

**App commit:** `c208ad36e37f97379b6b433339a05608f26cb484` (`c208ad3`)  
**Also pushed:** prior unpushed `4a7f7dcd910d4bf31dd398f99bff91ad0675cc1b` (`4a7f7dc`, documentation/audit trail only)

| Item | Result |
|------|--------|
| Unique deploy URL | `https://harbaugh-forms-avuwhz2w9-lee-harbaugh-s-projects.vercel.app` |
| Deployment ID | `dpl_85mK8L8SEkLungQ84anWhSK8FoVx` |
| GitHub Production deployment | SHA `c208ad3` |
| Production project | `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` |
| Migrations | **None** |
| Env-var changes | **None** |
| Custom domain | `forms.harbaughrealestate.com` + `harbaugh-forms.vercel.app` serve `dpl_85mK8L8SEkLungQ84anWhSK8FoVx` |
| New production baseline | `c208ad3` / `dpl_85mK8L8SEkLungQ84anWhSK8FoVx` |

**1. Hide initial property list.** Choosing **Select existing property** still shows the search box. A blank/whitespace query does not list all properties and does not show an empty-results message. Matching results appear only after the user types. The assigned property stays visible independently of the search query.

**2. Preserve assigned property while toggling modes.** The packet’s assigned `property_id` is independent of picker UI mode. Switching **Select existing property** ↔ **Create new property** (including re-clicking the active mode) does not clear assignment. Typing a new-property draft does not clear assignment. Replacement happens only at a commit point (selecting another existing property, **Save and select property**, or optional/custom parent-form save of a filled new-property draft). Edit Packet continues saving `propertyId` regardless of which picker mode is open.

| Validation | Result |
|------------|--------|
| Local | `npx tsc --noEmit`; targeted ESLint; `npm run test:form-controls` (23/23); `npm run build:validate` against development |
| Unique URL | Login HTML `data-dpl-id=dpl_85mK8L8SEkLungQ84anWhSK8FoVx`; browser SSO Deployment Protection blocked authenticated unique-URL UI (`vercel curl` bypassed protection for HTML checks) |
| Live domain | Login; Collections; Packets; Edit Packet **11** (505 Valley Spring Drive / `#8`): blank search shows no full list; “Presidio” returns 5444 Presidio Dr; clearing search keeps `#8`; Create new → Select existing keeps `#8`; packet `property_id` unchanged (`update_date` still 2026-08-09). New Packet listing: blank search empty; search + select `#8`; mode toggle preserves it; cancelled without creating. Buyer Rep: no property picker. No packet data mutations. |

**Unexpected:** When the Production deployment became Ready, Vercel auto-assigned `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` to it before unique-URL authenticated UI smoke. Policy remains: unique-URL validation first, then **manual** custom-domain promotion; automatic custom-domain assignment should stay disabled. Verify the Vercel project domain setting before the next production push.

Shared component: `components/properties/property-picker.tsx`. Consumers: New Packet (`create-custom-packet-form.tsx`, `create-packet-from-collection-form.tsx`) and Edit Packet (`packet-edit-form.tsx`).

### Packet property-entry mode no longer clears the assigned property (2026-08-18)

Implemented in `c208ad3` and included in the production rollout above.

### Packet existing-property search hides the full list until the user types (2026-08-18)

Implemented in `c208ad3` and included in the production rollout above.

### TXR-1957 T-47.1 Residential Real Property Declaration in Lieu of Affidavit (2026-08-17)

**Status:** Production Draft catalog complete. Form remains **ACTIVE + DRAFT**. **Not published.** Development does not contain this form shell.

| Item | Result |
|------|--------|
| Production form ID | **53** |
| Stable identity | `TXR-1957` · `TXR-1957-11-1-2024` · family `TXR-1957` |
| Title | T-47 In Lieu of Affidavit |
| PDF | `global/forms/53/T-47-not-affidavit.pdf` · 2 pages · 159938 bytes · MD5 `779f199830e4d6a470654b67d46fb93f` · AcroForm **0** |
| Related shell | DELETED Private form **52** (copy source; 0 ACTIVE mappings; not used) |
| New Global fields | **19** `txr_1957_*` |
| Reused Globals | `property_legal_description`, `property_county`, `seller_name_1`, `seller_name_2` |
| ACTIVE mappings | **23** (p1:7 · p2:16) |
| Signatures / initials | **none** (Authentisign / annotation exclusion) |
| Lee Personal defaults | **3** — exceptions `None`; execution states `Texas` (form 53 only) |
| Schema / migrations | **None** — data-only apply via `scripts/txr1957-apply-production.ts` |
| Isolation | packets **9**, packet_forms **28**, FI **528** fingerprint `6067a650…f320c7` unchanged; other-form ACTIVE mappings **2075** unchanged |
| Tests | `test:txr-1957-manifest` 11; field-instance-sync 17; source-registry 10; field-defaults 77; `tsc`; ESLint; `build:validate`; production phase-6 `ok` |
| Map Fields | `/forms/53/editor` — Lee visual review still required before Publish |

Automatic sources: property legal description, property county, seller 1/2 names, seller 1/2 dates of birth. Page-1 combined Declarant, GF number, survey date, both addresses, and execution county/day/month/year remain `manual_only`.

### Production rollout — Fill Form presentation + Date Signed (2026-08-06)

**Status:** **Complete.** PR #31 squash-merged to `main`, production migrations applied, mapping flags set, unique-URL validated, then custom domain manually promoted.

| Item | Result |
|------|--------|
| PR | [#31](https://github.com/leeharbaugh/harbaugh-forms/pull/31) squash-merged |
| Merge commit | `d93cc5936f511c561f7538a5d035126ed2976cc9` (`d93cc59`) |
| Unique deploy URL | `https://harbaugh-forms-8m60uqcrp-lee-harbaugh-s-projects.vercel.app` (`dpl_EcDG5xuCGTA9VrmKDVWF2irn1Qtb`) |
| Prior rollback baseline | `6ef2453` / `dpl_3q2vJRK9Z2ruvD7WRci5cwVjjL3j` (`87xmn84pt`) — kept on custom domain until promotion |
| Production project | `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` |
| Migrations (exact order) | `20260805220000` → `20260805230000` → `20260806150000` (all applied; history aligned) |
| Mapping config (initial rollout) | Form **15** Residential Lease Listing · `lease_non_real_estate_items` · mapping **`f7f8e678-43f3-4f9a-9cb2-f1c9bb6b9f05`** · page 1 · `470×28` · **`is_multiline=true`**, **`mask_background=true`** (coords unchanged) |
| Mapping config (2026-08-07 workbook apply) | **79** additional ACTIVE mappings set `is_multiline=true` + `mask_background=true` from Lee’s approved workbook (geometry unchanged); see section below |
| Integrity | packets **7**; field_instances **248** fingerprint **`7883c5d5d0dfe138134e9eb3a90ef8e9`** (unchanged); packet_forms fingerprint **`d43b3a72003eae61747ede6dffeb3424`** excluding soft-deleted QA pf **39**; generated-documents storage **15** after smoke PDF cleanup |
| Schema/RLS/trigger | `packet_form_annotations` + creator trigger `packet_form_annotations_enforce_created_by` (INVOKER, safe search_path); types `typed_signature` \| `date_signed`; RLS via `owns_packet` / `is_app_admin` |
| Unique-URL smoke | Login/collections/packets/Fill Form chrome; Caveat font 200/297900; API annotation create/move/PDF/soft-delete; Deployment Protection bypassed via `vercel curl` / `x-vercel-protection-bypass` for browser |
| PDF artifact | `_audit_tmp/prod-rollout-d93cc59/prod-smoke-lease-listing-fill.pdf` — HarbaughCaveat + FontFile2 + Helvetica present |
| Custom-domain promotion | ~2026-08-06 23:50 UTC — `forms.harbaughrealestate.com` + `harbaugh-forms.vercel.app` → `8m60uqcrp` / `d93cc59`; HTTPS/HSTS OK; unique URL remains available |
| Live smoke | Login, collections, packets, Fill Form open, Signature + Date Signed dialogs, Caveat font asset, no schema-cache errors, **0 ACTIVE** annotations remaining |
| Promotion policy | **Manual domain assignment remains required** for future production releases (auto custom-domain assignment stays disabled) |

**Smoke leftovers (soft-deleted only):** packet_form **39** (`DELETED`); **3** `DELETED` annotations from QA. No ACTIVE annotations. Temporary smoke storage objects removed.

### Multiline / mask mapping audit + Lee approval apply (2026-08-06 → 2026-08-07)

**Status:** Lee completed manual review; workbook is the authoritative approval source; **approved flag updates applied in production** (no deploy, no migrations).

| Item | Result |
|------|--------|
| Audit folder | `audits/prod-multiline-mask-2026-08-06/` |
| Original candidates | **164** rows (HIGH 4 + MEDIUM 42 + REVIEW REQUIRED 118); LEAVE UNCHANGED excluded |
| Authoritative workbook | `audits/prod-multiline-mask-2026-08-06/multiline-mask-manual-review.xlsx` (Lee-edited; preserved) |
| Applied audit trail | `audits/prod-multiline-mask-2026-08-06/multiline-mask-manual-review-APPLIED.xlsx` |
| Rows with ≥1 Lee `1` | **80** (original-audit **60** + Lee-added **20**) |
| Resolved / unresolved | **80** / **0** (0 conflicts) |
| Unique mappings changed | **79** (`is_multiline=true` + `mask_background=true`); **1** already correct (`f7f8e678-…` form 15 Non-Real Estate Items) |
| Geometry changes | **0** — Dimension Review `1` on **80** rows held as backlog (no explicit Lee Notes dimensions) |
| Prod integrity | packets **7**, packet_forms **20**, FI **248** fingerprint **`381dc622427952a1bec693b842efb0d1`** unchanged; ACTIVE mappings **2075**; annotations ACTIVE **2**; mapping presentation fingerprint `5d5a7ea5…` → `dd8806ae…` explained exactly by the 79 flag updates |
| Dev mirror | **26** mirrored by mapping ID on `harbaugh-forms-dev`; **53** exceptions (no matching id/identity — do not guess) |
| QA | Structural PASS on all **80**; 14 in-memory fill PDFs + Acrobat/PNG sample (damages, Special Provisions, tall narratives, Lee-added); no packet/FI/storage writes |
| Deploy / migrations | **None** |

### Fill Form Date Signed placement fix (2026-08-06)

**Status:** Included in PR #31 merge `d93cc59` and now live in production (see rollout section above).

| Item | Result |
|------|--------|
| Symptom | Date Signed dialog + placement banner OK; PDF click showed red `Unsupported annotation type.` |
| Exact error source | `validatePacketFormAnnotationInput` → `isPacketFormAnnotationType` in `lib/types/packet-form-annotation.ts` (message `"Unsupported annotation type."`) |
| Supported allowlist | Explicit only: `typed_signature`, `date_signed` (no deferred kinds) |
| Fix | Shared click factory `buildAnnotationInputFromPlacementClick` used by the editor; early allowlist check; explicit create payloads (no spread that can drop type); Helvetica date defaults vs Caveat signature defaults kept separate |
| Regression test | `lib/packet-form-annotation-placement.test.ts` / `npm run test:annotation-placement` (same factory as browser click) |
| Live factory→persist QA | `scripts/qa-date-signed-placement-path-53.ts` — pages 1 + 11 place/move/resize/reload/PDF/soft-delete; Caveat signature retained |
| Artifact | `_audit_tmp/pdf-regression/qa-pf53-date-signed-placement-path.pdf` (Acrobat) |

### Fill Form Date Signed annotation (2026-08-06)

**Status:** Live in production (PR #31 / `d93cc59`). Production migration applied:

- `20260806150000_packet_form_annotations_date_signed.sql` (widens `annotation_type` CHECK to include `date_signed`)

| Item | Result |
|------|--------|
| Type | `date_signed` on existing `packet_form_annotations` (not a field/field_instance) |
| Storage | `text_value` = formatted display string chosen at placement (calendar date, not timestamp); `font_id` = `helvetica` |
| Formats | `MM/DD/YYYY` (default), `M/D/YYYY`, `Month D, YYYY` |
| UI | Fill Form toolbar **Date Signed** beside Signature; dialog date + format + preview → place |
| Render | Helvetica, black, transparent; shared annotation overlay/PDF drawer; independent of signature |
| Auth/lifecycle | Same as typed signatures (`owns_packet` / admin; creator trigger; DRAFT-editable only) |
| Tests | `test:date-signed-annotation` (includes placement factory); `test:annotation-placement`; `test:pdf-text-layout`; `test:fill-form-pdf-download`; auth validate; smoke; sync; lifecycle; `tsc`; ESLint; `build:validate` |
| Artifact | `_audit_tmp/pdf-regression/manual-qa-pf53-date-signed.pdf` + placement-path PDF (Acrobat) |
| Deferred | See **Future Product Roadmap**: free text, strikethrough, initials, and signer fields are planned under Imported Packet Documents + PDF Annotation / Markup Tools (and e-signature), not implemented in this tranche |

### Fill Form download regressions: multiline wrap + Caveat spacing (2026-08-06)

**Status:** Live in production (PR #31 / `d93cc59`). Production form **15** mapping `f7f8e678-43f3-4f9a-9cb2-f1c9bb6b9f05` configured with `is_multiline=true` and `mask_background=true`.

| Item | Result |
|------|--------|
| Authoritative browser Download PDF path | Packets → Fill Form → `downloadFilledPacketFormPdf` → `getFilledPacketFormPdfBytes` → `fillPacketFormPdfBytes(fields, annotations)` with live draft values + Caveat bytes; `save({ useObjectStreams: false })` |
| Multiline root cause | Not a missing `is_multiline` select/serialization bug. Residential Lease Listing “Non-Real Estate Items” mapping `f7f8e678-…` was `is_multiline=false`, so `layoutTextInBox` emitted one line and pdf-lib drew one overflowing `drawText`. Browser CSS wrap still looked OK. |
| Multiline fix | Enable Map Fields **Multiline** for narrative blanks (prod+dev: mapping `f7f8e678-…` set `is_multiline=true`). Download path already honored the flag when true. |
| Caveat root cause | Embedding Caveat under its default PostScript name **alongside Helvetica** in the filled packet PDF corrupted cmap/advances (extract looked like `KenƑetƋ…` / visually spaced fragments). Not glyph-by-glyph drawing. |
| Caveat fix | `embedFont(bytes, { subset: true, customName: "HarbaughCaveat" })`; still one intact `drawText(text)`; keep fontkit + `useObjectStreams: false` + public font proxy exclusions |
| Preprinted-line mask root cause | **Configuration, not rendering.** Mapping `f7f8e678-…` had `mask_background=false` after multiline enable. Download path already draws opaque white placement rectangle before text when the flag is true (empty and populated). |
| Mask fix | Map Fields / DB: retain `mask_background=true` with `is_multiline=true` on `f7f8e678-…`. No renderer change required. |
| Tests | `test:fill-form-pdf-download` (multiline + Caveat + mask on/off/empty); `test:pdf-text-layout`; annotation auth validate; presentation smoke; field-instance-sync; packet-form-lifecycle; `tsc`; targeted ESLint; `build:validate` |
| Manual artifact | `_audit_tmp/pdf-regression/manual-qa-pf53-multiline-mask-caveat.pdf` (+ empty-mask / mask-off control) — opened in Adobe Acrobat DC |
| Migrations | Forward `20260806150000` for `date_signed`. Existing `20260805220000` / `20260805230000` unchanged. |

**Production mapping `f7f8e678-43f3-4f9a-9cb2-f1c9bb6b9f05`:** `is_multiline=true`, `mask_background=true`, `470×28` (height unchanged; enlarge in Map Fields only if more printed-line rows must be covered).

**Remaining preview vs PDF differences (acceptable):** CSS Caveat vs embedded subset metrics can differ slightly; Non-Real Estate box height remains **28pt** so vertical capacity / printed-line coverage is limited to that rectangle.

### Fill Form presentation: multiline, line mask, typed signatures, font scaling (2026-08-05)

**Status:** **Live in production** (migrations + app via PR #31 rollout 2026-08-06).
- `20260805220000_fill_form_presentation_and_annotations.sql`
- `20260805230000_packet_form_annotations_created_by_immutable.sql` (creator attribution hardening)

| Item | Result |
|------|--------|
| Multiline wrapping | Placement flag `form_field_mappings.is_multiline`; shared `lib/pdf-text-layout.ts`; Fill Form overlay + pdf-lib generation |
| Cover preprinted lines | Placement flag `form_field_mappings.mask_background` (opaque white under text; Map Fields control; default off) |
| Typed signatures | New `packet_form_annotations` (typed_signature only); Fill Form toolbar; Caveat OFL font; soft-delete; RLS via `owns_packet` |
| Creator attribution | DB trigger `packet_form_annotations_enforce_created_by` (INVOKER): INSERT forces `created_by_user_id = auth.uid()`; UPDATE preserves OLD; client UUID is not trusted |
| Preview font sizing | Overlay fonts scale with `renderedHeight/originalHeight`; clamp in PDF space then × scale |
| Caveat PDF embed | Requires `@pdf-lib/fontkit` + `PDFDocument.registerFontkit`; embed with `subset: true` + `customName: "HarbaughCaveat"` when Helvetica is also present |
| Tests | `test:pdf-text-layout`; `test:fill-form-pdf-download`; annotation contract tests; `validate:packet-form-annotation-auth-dev`; `smoke:fill-form-presentation-dev`; field-instance-sync; packet-form-lifecycle; storage-paths; `tsc --noEmit`; `build:validate` |
| Font license | `public/fonts/Caveat-Regular.ttf` + `public/fonts/OFL.txt` (SIL OFL 1.1, Caveat Project Authors) |
| Deferred | Drawn signatures, uploaded signature images, and reusable saved signatures were all outside this completed tranche. Later native Signing design includes typed/drawn adoption and one optional reusable signature/initials preset for authenticated Users; uploaded images remain deferred. Authentisign remains prior research, not a committed vendor architecture. |

**Root causes addressed:** (1) Multiline clipped because preview used `truncate`/`input` and PDF used a single `drawText` with no wrap. (2) Undersized preview text because display used fixed CSS `10px` while boxes scaled with zoom; clamp was also incorrectly applied after zoom scale (fixed: clamp in PDF space, then multiply by scale). (3) Creator spoof residual: UPDATE could rewrite `created_by_user_id` without DB enforcement (fixed by forward migration trigger). (4) Caveat custom-font embed failed without fontkit and fell back to Helvetica silently. (5) 2026-08-06: narrative downloads without Map Fields multiline flag stay single-line; Caveat+Helvetica default-name embed corrupted advances (fixed via `HarbaughCaveat` customName). (6) Preprinted lines through wrapped Non-Real Estate text: mapping lacked `mask_background` (enabled and retained).

**Manual QA (development, 2026-08-05 / continued 2026-08-06):**
- Zoom policy verified at 75 / 100 / 150 / 195 / 250% (configured 10pt → 7.5 / 10 / 15 / 19.5 / 25 CSS px; multiline derived sizes scale linearly; padding uses the same scale factor). Stored PDF coordinates are independent of zoom.
- Caveat embedding confirmed on real DRAFT packet form **62** (Third Party Financing Addendum): signatures drawn on pages 1 and 2; smoke PDF contains `HarbaughCaveat` + `FontFile2`. Artifact: `_audit_tmp/fill-form-presentation-smoke-62.pdf`.
- Annotation RLS/auth live probes on packet form **62**: spoofed INSERT creator rewritten to `auth.uid()`; UPDATE cannot transfer creator; move/resize/text/soft-delete work; cross-owner non-admin INSERT blocked; DELETED excluded from ACTIVE reads.
- **Browser visual QA (packet 19 / packet_form 53 / form 15 / mapping `7d480d19-…` Lease Special Provisions, page 8):** temporary `is_multiline=true` + `mask_background=true` (restored to false/false afterward).
  - Natural wrap (≥3 lines), explicit newlines, long unbroken URL hard-break, and vertical clipping all passed in preview at ~80 / 100 / 156 / 195 / 244% zoom.
  - Empty + mask: opaque white covers preprinted lines inside the placement; mask-off empty restores visibility of underlying lines (filled fields still use light `bg-white/85` readability wash by design).
  - Download PDF with mask+wrap materially matched preview; source template PDF unchanged after flag restore.
  - Typed signatures: Caveat dialog preview; place on pages 1 and 11; move persisted; aspect-locked resize persisted; zoom did not mutate stored PDF coords; soft-delete (`status=DELETED`) removed from UI/PDF; replacement download embeds Caveat.
  - DRAFT editable; open/refresh created no automatic annotations; field-instance QA values cleared afterward.
- **Non-Real Estate Items (mapping `f7f8e678-…`, 2026-08-06):** retained `is_multiline=true` + **`mask_background=true`** (470×28). Download artifacts: populated mask, empty mask, mask-off control; Acrobat opened for line-cover QA. Caveat signature remains intact.
- **Blocking fixes from browser QA:** (1) auth `proxy.ts` matcher excluded `.ttf`/`.otf`/`.woff`/`.woff2`/`.txt` so `/fonts/Caveat-Regular.ttf` is not redirected to login HTML; browser loader rejects non-sfnt payloads. (2) `pdfDoc.save({ useObjectStreams: false })` so Caveat `FontFile2` actually persists on filled downloads for some source PDFs. (3) Caveat embed `customName: "HarbaughCaveat"` + `subset: true` so Helvetica+Caveat fills do not corrupt signature spacing.

**Production deploy (completed 2026-08-06):** Migrations `20260805220000` → `20260805230000` → `20260806150000` applied first; schema/trigger/RLS validated; app deployed via PR #31 (`d93cc59`); form **15** Non-Real Estate Items mapping flags applied; unique-URL validated; custom domain manually promoted. See rollout section above.

### Packet Tenant Names + Map Fields hardening — Vercel Production deploy (2026-08-05)

**Status:** Application code deployed to Vercel Production. Production app and database metadata are aligned for `tenant_names`.

| Item | Value |
|------|--------|
| Commit | `d89d3c78532ab4ea6c5f977c1c75891975f0308c` on `main` |
| Message | Add packet tenant names resolver and harden field source editing |
| Vercel Production deployment | `dpl_HhZjE2dWumGVxRPmEfyx2WKWu2WD` |
| Deployment URL | https://harbaugh-forms-guve6fsw2-lee-harbaugh-s-projects.vercel.app |
| Status | **Ready** (GitHub Production deployment success) |
| Custom domain | `https://forms.harbaughrealestate.com` aliased to this deployment |
| Serving | `https://forms.harbaughrealestate.com` |
| Migration `20260805210000` | Already present on production and development (no push during deploy) |
| Form 51 | Remains **`ACTIVE` + `DRAFT`** (`published_at` null) — not published |

**Pre-deploy validation:** `test:packet-tenant-names` 14; `test:source-registry-cleanup` 10; `test:field-instance-sync` 17; `tsc --noEmit`; targeted ESLint; `build:validate` — all passed.

**Resolver smoke (production, read-only):** No ACTIVE multi-tenant packet currently exists in production (packet-contact roles present: `SELLER`×2 on one packet, lone `PRIMARY` on another). Synthetic join check matches canonical formatter: `Alice Tenant, Bob Tenant` (two names) and `A, B, C` (three+). Field `txr_2216_tenant_names` remains `custom_resolver` / `tenant_names`; no packet_forms yet instantiate form 51. **PRIMARY/OTHER note:** role set matches `tenant_1`/`tenant_2`; a lone `PRIMARY` on a non-lease packet would be included if that packet resolved `tenant_names` — no multi-tenant lease packet available to exercise TENANT/CO_CLIENT/SPOUSE in production today.

**Field-editor smoke:** Deployed commit includes catalog-miss fetch-by-id, unmapped Section B hide, linked-field identity lock, and field-key case preservation. Production DB field key remains lowercase `txr_2216_tenant_names` (unchanged). Interactive Map Fields save was not performed (no unnecessary production structural writes); unauthenticated `/forms/51/editor` correctly gates to login (307).

**Availability:** `/auth/login` 200; `/`, `/packets`, `/collections`, `/forms/51/editor` unauthenticated → 307 `/auth/login`.

### Packet Tenant Names resolver + TXR-2216 source update (2026-08-05)

**Status:** No existing all-tenant aggregation source was found (`buyer_names` joins buyers; lease `txr_2001_tenant_names` uses only `packet_contact` / `tenant_1.full_name`). Implemented reusable custom resolver **`tenant_names`** (display label **Packet Tenant Names**), registered in `CUSTOM_RESOLVER_KEYS`, wired in `resolveCustomResolverKey`, and catalogued via migration `20260805210000_packet_tenant_names_resolver.sql` (applied on development and production).

Production form **51** field `txr_2216_tenant_names` (`2b103fac-…`) source changed from `manual_only` → `custom_resolver` / `resolver_key=tenant_names`. Field key, label, type, widget, placement, and defaults were unchanged. Form **51** remains **`ACTIVE` + `DRAFT`** (not published).

| Item | Result |
|------|--------|
| Existing tenant aggregate? | **No** |
| Resolver key / label | `tenant_names` / **Packet Tenant Names** |
| Role set | Same as `tenant_1`/`tenant_2`: TENANT, CO_CLIENT, SPOUSE, PRIMARY, OTHER |
| Join format | Comma-separated (matches `buyer_names`) |
| Editor defect | Map Fields edit forced `field_key` uppercase on save and presented editable identity fields; fixed by preserving key case + locking key/label/types when editing a linked field; catalog miss now fetches by id; unmapped placements hide Section B |
| Tests | `test:packet-tenant-names` 14 pass; source-registry 10; field-instance-sync 17; `tsc`; targeted ESLint; `build:validate` |
| Runtime | Prefill is live on Vercel Production as of commit `d89d3c7` / deployment `dpl_HhZjE2dWumGVxRPmEfyx2WKWu2WD`. |

### TXR-2216 Itemization of Security Deposit — Option 1 draft placements applied (2026-08-05)

**Status:** Phase 1 coordinate blocker **resolved**. Lee authorized underline/glyph-derived **initial draft** placements (same method as TXR-2217 / batches 38–50). Production form **51** now has **60** new `manual_only` Global fields + **65** ACTIVE draft mappings (3 reuse Globals; `PROPERTY_FULL_ADDRESS` ×3). Form remains **`ACTIVE` + `DRAFT`**. **Not published.** Development mirror **deferred**. Lee’s visual Map Fields review is still required — these coordinates are draft, not final human-verified placements.

| Item | Verified value |
|------|----------------|
| Starting branch / commit | `main` @ `6ef2453d0ddfa1113e7786990fb2e6a31351836b` |
| Ending branch / commit | `main` @ same commit (docs/scripts uncommitted; production DB updated) |
| Production form ID | **51** |
| Identity | `TXR-2216` · Itemization of Security Deposit · `TXR-2216-01-05-2026` |
| Status / publication | `ACTIVE` + **`DRAFT`** (`published_at` null) |
| PDF path | `global/forms/51/ItemizationOfSecurityDeposit.pdf` |
| PDF MD5 / bytes | `599fdccc5c3e551f9360e152d1e50a6a` / **181660** — **unchanged** |
| New fields | **60** `txr_2216_*` · `manual_only` · no defaults / paths / resolvers |
| Reused Globals | `PROPERTY_FULL_ADDRESS` · `AGENT_NAME` · `BROKERAGE_NAME` (unchanged defs) |
| Logical fields | **63** |
| ACTIVE placements | **65** (p1:27 · p2:21 · p3:17) |
| Calculations / defaults / resolvers / schema / migrations | **None added** |
| Packets / field_instances / other-form mappings | **Unchanged** (apply isolation OK) |
| Development TXR-2216 | **Absent** (not mirrored) |
| Coordinate manifests | `_audit_tmp/txr2216_initial_placement_manifest.json` (+ `.csv`) |
| Apply / Phase 6 artifacts | `_audit_tmp/txr2216_apply_result.json`, `_audit_tmp/txr2216_phase6_final_validation.json` |
| Review renders | `_audit_tmp/txr2216_validation_annotated_full.pdf`, `txr2216_validation_page_{1,2,3}.pdf/.png` |
| Docs | `TXR_2216_FIELD_INVENTORY.md`, `TXR_2216_APPROVAL_MEMO.md` (implementation appendix) |

**Pre-write refinement (before DB write):** page-1 `PROPERTY_FULL_ADDRESS` used first-line `x=238.5` / `width=337.5` (label-prefixed underline convention from TXR-2217) instead of `min(x0)` across continuation lines. No post-render coordinate edits after apply.

**Still required:** Lee visual Map Fields review at `/forms/51/editor` before any Publish. Do not publish. Do not mirror to development until Lee approves placements.

### TXR-2216 discovery + decision review (2026-08-05)

### Test-user hard-deletion production smoke failure (2026-07-30)

**Status:** **Fixed and deployed to production.** Lee’s deletion retest remains **pending**.

| Item | Value |
|------|--------|
| Feature/fix branch commit | `b48d2acb5d6df9125910ac7007c41f48c3837171` |
| PR | [#29](https://github.com/leeharbaugh/harbaugh-forms/pull/29) — squash-merged |
| Final `main` commit | `0f80dea9bdf20bc3a91b4b14f7110619aa07fba9` |
| Branch cleanup | Bug-fix branch deleted locally and on `origin` |
| Vercel Production deployment | `dpl_A9j1QAgwws6RrLxirvH3Yo8jcJ4H` (`harbaugh-forms-3dzqqmzqz-…`) |
| Production deployment commit | `0f80dea9bdf20bc3a91b4b14f7110619aa07fba9` |
| Serving | `https://forms.harbaughrealestate.com` |
| New migration | **None** — no schema change required |

**Observed:** Lee’s first deletion smoke test stopped with the incomplete UI message `User_Agent_Settings:` while opening the deletion dependency summary.

**Root cause:** The generic dependency counter selected `id` from every table. The actual private configuration table is `public.user_agent_settings`, whose primary/ownership key is `user_id` and whose FK is `user_id → auth.users(id) ON DELETE CASCADE`. Production and development both return an error with an empty message for the invalid `select id` count, so string concatenation collapsed to `user_agent_settings: `. The failure occurred during preview, before permanent cleanup.

**Production read-only state verification:**

* Production ref `eetonalyyyssvkyfdoxh` was explicitly verified before queries; CLI remained linked to development `ewxsxwzezhkeawnjvigx`.
* Exactly one marked test user was present; Auth account, profile, one membership, and one agent-settings row remained.
* No private contacts, properties, packets, defaults, representation agreements, forms, collections, or fields were present for that user.
* No deletion snapshot and no `test_user_deletion_failed` audit existed, confirming that no cleanup or Auth deletion was attempted.
* No production user was modified, deleted, or recreated during diagnosis.

**Fix:**

* Dependency descriptor explicitly separates `agent_settings` (summary key), `user_agent_settings` (table/cleanup step), `user_id` (ownership/count column), and `Agent settings` (label).
* Counts select the real ownership column instead of assuming `id`.
* Identity cleanup checks every delete result, treats zero rows as retry-safe success, and calls `deleteUser(userId, false)` only after memberships, agent settings, preferences, and profile cleanup succeed.
* Other private-data reads and retained historical-reference updates now fail closed instead of allowing Auth deletion after an unobserved query/update error.
* Browser failures are structured and sanitized with dependency label, stage, explanation, optional DB code, retry guidance, completed steps, and `DEL-…` log reference. Empty/raw DB messages are not exposed.

**Validation:** `tsc --noEmit`, targeted ESLint, `npm run build:validate`, admin lifecycle/invite (37 passed), auth confirm (27), auth bootstrap (6), admin audit (11), admin org (4), library permissions (13), secure publish (11), UI lists (29), field defaults (77), form-copy/global packet regressions (89), form lifecycle (47), storage (18), Supabase guard (8), user preferences (5), and packet lifecycle (7) all passed. Focused lifecycle suite: 23 passed, including agent-settings success, missing-row retry, no-Auth-on-failure, email reuse, safeguards, and sanitized error regressions.

**Non-destructive availability after deploy:** login 200; `/` and `/admin/users` gate to login; `/auth/change-password` 200. No production deletion retry was performed.

Lee’s production deletion retest remains pending.

### Global Admin test-user cleanup + manual create — production rollout (2026-07-30)

**Status:** **Complete on production** (schema + application). Lee’s interactive smoke test remains **pending**.

| Item | Value |
|------|--------|
| Feature branch commit | `666cff117eb08bd05330063d27f235bae0977804` |
| PR | [#28](https://github.com/leeharbaugh/harbaugh-forms/pull/28) — squash-merged |
| Final `main` commit | `67cb5a6fdae696a1bbba3e63c75ed1724b037d5a` |
| Branch cleanup | Feature branch deleted locally and on `origin` |
| Production Supabase migration | `20260730120000_admin_test_user_manual_create.sql` — already applied earlier (no rewrite; no second push) |
| Dev Supabase | Migration present on `ewxsxwzezhkeawnjvigx`; CLI remains linked there |
| Vercel Production deployment | `dpl_7FBiCh7HuXdjSnmAetbADerXVNDB` (`harbaugh-forms-86gmcayuy-…`) |
| Production deployment commit | `67cb5a6fdae696a1bbba3e63c75ed1724b037d5a` (matches `main`) |
| Serving | `https://forms.harbaughrealestate.com` (alias on this deployment) |
| Admin-user app features on this deploy? | **Yes** |

#### Pre-merge validation (re-run 2026-07-30)

| Check | Result |
|-------|--------|
| `test:admin-user-lifecycle` | 17 passed |
| `test:admin-invite` (includes lifecycle) | 31 passed |
| `test:auth-confirm` | 27 passed |
| `test:auth-bootstrap` | 6 passed |
| `test:admin-audit` | 11 passed |
| `test:ui-lists` | passed |
| `test:library-permissions` | passed |
| `test:secure-publish` | passed |
| `test:field-defaults` / `test:form-copy-global` | passed |
| `test:storage-paths` | 18 passed |
| `test:supabase-guard` | 8 passed |
| `test:user-preferences` / `test:packet-form-lifecycle` | passed |
| `tsc --noEmit` | passed |
| Targeted ESLint | passed |
| `npm run build:validate` | passed |

#### Non-destructive production availability checks

| Check | Result |
|-------|--------|
| `https://forms.harbaughrealestate.com/auth/login` | 200 — login form loads |
| `/` (unauthenticated) | 307 → `/auth/login` |
| `/admin/users` (unauthenticated) | 307 → `/auth/login` (route present / gated) |
| `/auth/change-password` (unauthenticated) | 200 — “Sign in to change your password” (new route live) |
| Server / build errors | None observed |

No production users were created, marked, unmarked, or deleted during rollout. Lee manual smoke test: **not performed** (deferred to Lee).

### Production admin-user migration (2026-07-30)

**Status:** Applied earlier the same day; histories aligned; schema verified. Remains the live production schema for this feature.

| Item | Value |
|------|--------|
| Production Supabase | `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` |
| Migration applied | `20260730120000_admin_test_user_manual_create.sql` only |
| CLI after ops | Relinked to development `ewxsxwzezhkeawnjvigx` |

#### Migration history (production)

**Before push:** all prior versions matched local/remote through `20260730010000`; `20260730120000` local-only (remote empty). No older pending migrations or history mismatches.

**Dry-run:** would push only `20260730120000_admin_test_user_manual_create.sql`.

**Push:** applied successfully (`supabase db push --yes` while linked to `eetonalyyyssvkyfdoxh`). Notices only: drop-if-exists for new trigger/policy (expected first apply).

**After push:** local and remote both include `20260730120000`; histories match.

#### Schema verification (production, read-only)

| Object | Result |
|--------|--------|
| `profiles.is_test_user` | boolean NOT NULL default `false` |
| `profiles.must_change_password` | boolean NOT NULL default `false` |
| Indexes `profiles_is_test_user_idx`, `profiles_must_change_password_idx`, `deleted_user_snapshots_deleted_by_idx` | present |
| Trigger + function `profiles_protect_admin_user_flags` | present |
| `forms_published_by_user_id_fkey` / `form_state_events_performed_by_user_id_fkey` | ON DELETE SET NULL |
| `deleted_user_snapshots` | table present; RLS on; `deleted_user_snapshots_admin_select`; `authenticated` SELECT grant |

### Global Admin user cleanup and manual creation (2026-07-30)

**Status:** Merged to `main` and deployed to Vercel Production (`67cb5a6` / `dpl_7FBiCh7HuXdjSnmAetbADerXVNDB`). Migration already on development and production.

**Feature branch:** `feature/admin-test-user-cleanup-manual-create` (deleted after squash merge of PR #28)

#### Dependency graph (documented before hard delete)

Hard Auth deletion does **not** cascade safely for all owned business data. Actual FK / ownership map used by the cleanup:

| Class | Tables / resources | Handling |
|-------|--------------------|----------|
| CASCADE with `auth.users` | `profiles`, `organization_members`, `user_agent_settings`, `user_preferences` | Explicit delete then Auth hard-delete (idempotent) |
| Safe private owner data | contacts, properties (+ HOAs), packets (+ packet_forms, packet_contacts, field_instances/mappings), representation_agreements, field_defaults, PRIVATE forms/collections/fields (+ private form mappings), Storage `users/{uid}/**` | Hard-deleted in FK-safe order before Auth delete |
| Blocking | GLOBAL/ORGANIZATION forms, collections, or fields still owned by the user (non-DELETED) | Blocks streamlined deletion until reassigned/removed |
| Historical retain | `audit_events` (soft actor refs), `form_state_events`, `forms.published_by_user_id` | Rows retained; actor/publisher FKs nulled (`ON DELETE SET NULL`); `deleted_user_snapshots` written |
| Guards | Self, non-test users, final active Global Admin | Rejected server-side |

#### Schema

* Migration: `supabase/migrations/20260730120000_admin_test_user_manual_create.sql`
* `profiles.is_test_user boolean not null default false`
* `profiles.must_change_password boolean not null default false`
* Trigger `profiles_protect_admin_user_flags` (service-role / `auth.uid() is null` allowed; users may clear own `must_change_password`)
* `deleted_user_snapshots` (admin SELECT; service-role writes)
* `forms.published_by_user_id` and `form_state_events.performed_by_user_id` → `ON DELETE SET NULL`

#### Application surfaces

* Admin Users: separate **Invite (send email)** vs **Create manually (no email)**; Test user badge; mark/unmark test user; permanent delete with dependency summary + exact-email confirmation
* Manual create uses `auth.admin.createUser` with `email_confirm: true`, provisions profile/membership/agent settings, sets `must_change_password=true`, returns temporary password **once**
* Forced password change: `/auth/change-password` + proxy gate + login redirect; cleared after successful `updateUser` password
* All create/delete/preview/test-flag actions call `requireAppAdmin()`; create/delete rate-limited; CSRF remains Next.js server-action Origin protection
* Hard Auth delete: `deleteUser(userId, false)` so email can be reused (no Auth soft-delete)

#### Validation (development / pre-merge re-run 2026-07-30)

| Check | Result |
|-------|--------|
| `test:admin-user-lifecycle` | 17 passed |
| `test:admin-invite` (includes lifecycle) | 31 passed |
| `test:auth-confirm` | 27 passed |
| `test:auth-bootstrap` | 6 passed |
| `test:admin-audit` | 11 passed |
| `test:ui-lists` | passed |
| `test:library-permissions` | passed |
| `test:secure-publish` | passed |
| `test:field-defaults` / `test:form-copy-global` | passed |
| `test:storage-paths` | 18 passed |
| `test:supabase-guard` | 8 passed |
| `test:user-preferences` / `test:packet-form-lifecycle` | passed |
| `tsc --noEmit` | passed |
| Targeted ESLint | passed |
| `npm run build:validate` | passed |
| Dev migration `20260730120000` | present local+remote on `ewxsxwzezhkeawnjvigx` |
| Prod migration `20260730120000` | already applied (no rewrite; no second push) |

#### Deferred / production

* Production **schema** migration applied 2026-07-30 (see section above)
* Application merge to `main` + Vercel Production deploy completed 2026-07-30 (`67cb5a6` / `dpl_7FBiCh7HuXdjSnmAetbADerXVNDB`)
* Interactive browser smoke of manual create + delete deferred to Lee

### Production authenticated-page outage hotfix (2026-07-29)

**Status:** **Resolved.** Code hotfix deployed, automated production authentication verified, and Lee confirmed successful normal password login on 2026-07-29 at approximately 23:06 America/Chicago.

**Symptom:** Valid password submission on `https://forms.harbaughrealestate.com/auth/login` completed authentication, then the first authenticated page displayed `This page couldn’t load.`

**Failed deployment:**

- Deployment: `dpl_7NdwNKcQBtA2YbfJCkstfFXog3Jk`
- URL: https://harbaugh-forms-fh0syajov-lee-harbaugh-s-projects.vercel.app
- Commit: `fe10271d43591974845f7cf98639cb5ba05c5723`
- Created: 2026-07-29 21:09:55 America/Chicago
- Custom domain was confirmed to point to this deployment.
- Correlated login at approximately 21:14:21: `POST /auth/login` → 303, then authenticated `POST /` → 200. No serverless or middleware 5xx, request error ID, or server error digest was emitted.

**Exact client error:**

`Error: Refusing to use the production Supabase project outside Vercel Production. Local development, tests, and feature-branch builds must use development (.env.local → ewxsxwzezhkeawnjvigx). Production operational scripts must load .env.ops.production explicitly.`

The source stack was:

1. `assertAppSupabaseTargetAllowed` (`lib/supabase/project-guard.ts`, throw at original line 44)
2. `assertSupabaseEnv` (`lib/supabase/env.ts:25`)
3. browser `createClient` (`lib/supabase/client.ts:5`)
4. first authenticated client initialization (`components/ensure-profile.tsx:17`; packet loading uses the same client)

**Root cause:** `NEXT_PUBLIC_SUPABASE_URL` was correctly compiled into the browser bundle, but the guard also consulted server-only `VERCEL_ENV`. Browser runtime has no `process`/`VERCEL_ENV`, so every authenticated browser client creation misclassified the real Production deployment as non-production and threw. The Vercel server/build environment was valid; the defect was the browser/server runtime boundary.

**Authentication findings:**

- Supabase password authentication succeeded.
- The server action wrote the production `sb-eetonalyyyssvkyfdoxh-auth-token` cookie.
- The following request read the session successfully.
- The active profile and active Davey Goosmann Realty `ORG_ADMIN` membership resolved.
- `app_role=ADMIN` Global Admin navigation resolved.
- Audit code was not called by login or initial application rendering.
- No live application query referenced removed office/TREC columns.
- The deterministic browser guard failure affected all authenticated users, not only Lee.

**Hotfix:**

- Branch: `hotfix/authenticated-page-load`
- Commit: `c34874fa16e9cb9655f98f6d080272d3c226ea64`
- PR: [#25](https://github.com/leeharbaugh/harbaugh-forms/pull/25)
- Squash merge: `d40fe11fc03c7a035daf38e120b668b5ebb28259`
- Production deployment: `dpl_DXQNcgWNyJocvswASrZvGQQFmGEw`
- URL: https://harbaugh-forms-m0ywpeatl-lee-harbaugh-s-projects.vercel.app
- Created: 2026-07-29 22:12:11 America/Chicago
- Custom domain confirmed on the hotfix deployment.
- Application rollback was not performed. Confirmed rollback candidate was `dpl_Fo3BCQKfDHJwQ41Ywnm57qN5TDez` / commit `7a7bace`; it was compatible with the final additive audit-only schema but unnecessary after the exact defect was proven.

**Validation:**

- `test:supabase-guard`: 8 passed
- `test:auth-bootstrap`: 6 passed
- `test:auth-confirm`: 27 passed
- `test:admin-audit`: 11 passed
- `test:admin-invite`: 14 passed
- `test:admin-orgs`: 4 passed
- `test:ui-lists`: 29 passed
- `test:user-preferences`: 5 passed
- TypeScript, targeted ESLint, and `npm run build:validate`: passed
- Vercel Preview: Ready; browser access was protected by Vercel team authentication, so the same built code was authenticated locally against development Supabase.
- Production one-time auth confirmation succeeded twice, including logout/re-login; the authenticated packet landing page rendered and loaded rows.
- Lee confirmed normal email/password login successfully reached the authenticated application.
- `Admin → Organizations`, `/admin/audit`, packets 2 and 5, and one generated-document download passed.
- Hotfix deployment runtime error logs: none.
- Packet fingerprints remained exactly unchanged: packets `48e3a3b…4b442`, packet forms `6d24214…8a42`, field instances `162b214…1511aa`.
- Audit schema remained present (`audit_settings` singleton and `audit_events` readable); `brokerage_offices` remained absent (`PGRST205`).
- No schema change, migration, seed, import, audit toggle, or production business-data mutation was performed.

### Admin audit logging — production rollout complete (2026-07-29)

**Feature branch:** `feature/admin-brokerage-trec-audit` (deleted after merge)  
**PR:** [#24](https://github.com/leeharbaugh/harbaugh-forms/pull/24) — **squash merge**  
**Final `main` commit:** `3b81840767ef661a2ab8e6103e0e28fc9d7cd5ce`  
**Approved Preview (pre-merge):** https://harbaugh-forms-r82v16w95-lee-harbaugh-s-projects.vercel.app  
**Lee Preview manual checks:** passed (all checklist items)

#### Production application deployment

| Item | Result |
|------|--------|
| Vercel Production deploy | **Ready** — https://harbaugh-forms-l10501kxw-lee-harbaugh-s-projects.vercel.app |
| Public URL | https://forms.harbaughrealestate.com |
| Env scope | Vercel **Production** vars (project `eetonalyyyssvkyfdoxh`) |
| Auto DB migrate | **No** — migrations applied manually |

#### Production database migrations

| Step | Result |
|------|--------|
| Linked project before push | `eetonalyyyssvkyfdoxh` (`harbaugh-forms-prod`, us-east-1) |
| Applied | `20260729210000_brokerage_offices_trec_audit.sql` then `20260730010000_remove_brokerage_offices_and_trec.sql` |
| Migration history | both versions present on remote; no pending for this rollout |
| Final schema | **audit-only**: `audit_settings` + `audit_events` present; `brokerage_offices` absent; no office FK; no TREC verification columns; no `audit_events.brokerage_office_id` |
| Audit setting | `ordinary_logging_enabled = true` (ACTIVE singleton) |
| Protections | append-only trigger live; RLS policies present; anon insert denied; anon settings update affects 0 rows |

#### Production data preservation (before = after)

| Metric | Count / fingerprint |
|--------|---------------------|
| Auth users | 6 |
| profiles | 6 |
| organizations (non-DELETED) | 1 (DGR only) |
| organization_members | 6 |
| user_agent_settings | 6 |
| brokerage_settings | 1 |
| contacts | 10 |
| properties | 7 |
| packets | 6 |
| packet_forms | 18 |
| field_instances | 185 |
| forms | 46 |
| collections | 4 |
| storage buckets / listed entries | form-templates + generated-documents / 3 |
| packets fingerprint | `48e3a3b2e7fe82870903f70c46d1b71990ce724e080579fe703d2c9774b4b442` (unchanged) |
| packet_forms fingerprint | `6d2421499781ca2186c926051408ea30c931f6081360d31bf39dfa6934083a42` (unchanged) |
| field_instances fingerprint | `162b2140ea26dd0bdb9a0324c52d5eaf5fe0376f0a4e3819fb5d36925e5151aa` (unchanged) |

#### Identity checks

| Check | Result |
|-------|--------|
| DGR | once — license `9006865` |
| Dee broker | `0283607` (Dee Davey) |
| Lee agent | `0712335` (Kenneth Harbaugh) |
| Packets 2 & 5 | ACTIVE |
| Packet 2 DELETED forms | ids 25, 26, 35 retained |

#### Production smoke / security

| Check | Result |
|-------|--------|
| Ordinary audit while enabled | recorded |
| Disable ordinary logging | setting false + mandatory `audit_logging_disabled` recorded |
| Ordinary while disabled | suppressed |
| Re-enable | setting true + mandatory `audit_logging_enabled` recorded |
| Append-only update/delete | blocked by trigger |
| Anon insert audit_events | denied (RLS) |
| Anon update audit_settings | no row change (enabled remains true) |
| Anon select audit tables | empty |
| Brokerage/Offices UI | not in app; unauthenticated `/admin/*` redirects to login |
| TREC lookup | absent |
| Manual license fields | retained |
| Authenticated browser UI walkthrough | API/RLS smoke completed; full interactive UI login handoff via magic-link hash was not established in automation (Lee Preview UI already passed equivalent app code) |

#### Cleanup

| Item | Result |
|------|--------|
| Feature branch local/remote | **deleted** |
| Supabase CLI after rollout | relinked to **development** `ewxsxwzezhkeawnjvigx` |
| Local branch | `main` @ `3b81840` |

#### Deferred

- Broader audit event coverage beyond current modest set
- Form resolvers still use legacy `brokerage_settings` singleton
- Optional future authenticated UI re-check on production by Lee

### Admin audit logging phase (development history — revised 2026-07-29)

Historical development/Preview notes for the feature branch remain below for audit trail. **Production rollout is complete** as of the section above.

**Feature branch:** `feature/admin-brokerage-trec-audit`  
**Starting commit:** `7a7baced48d2631167fdb6d82c29479a41912e07` (main tip at branch create)  
**Branch status:** merged via PR #24; feature branch deleted after production validation.

#### Lee Preview review (2026-07-29)

Lee decided:

1. Existing `Admin → Organizations` is sufficient for creating/maintaining multiple brokerages.
2. The new Brokerage/Offices administration feature is unnecessary and removed.
3. TREC license lookup/autofill is unnecessary and removed.
4. Basic audit logging is retained (modest scope; expand later).

#### Environment verification

| Check | Result |
|-------|--------|
| Git branch | `feature/admin-brokerage-trec-audit` (not `main`) |
| Supabase CLI linked project | `ewxsxwzezhkeawnjvigx` (`harbaugh-forms-dev`) |
| Local `.env.local` URL host | `ewxsxwzezhkeawnjvigx.supabase.co` |
| Production project `eetonalyyyssvkyfdoxh` | **not** queried; **not** modified; CLI `linked: false` |
| Production scripts (`migrate:approved-auth`, `import:approved-production-data`, `sync:condo-txr-1605-prod`, etc.) | **not** run |

#### Vercel / CI-CD behavior (repository inspection)

| Question | Finding |
|----------|---------|
| Vercel production branch | `main` (documented; no `vercel.json` in repo) |
| `.github/workflows/` | **Absent** — no GitHub Actions workflows in this repo |
| Feature-branch push | Creates a **Vercel Preview** only; Preview is configured to use **development** Supabase (`harbaugh-forms-dev`) |
| PR open/update | No repo-local automation applies production migrations |
| Merge/push to `main` | Triggers Vercel **Production** deploy of application code; does **not** auto-apply Supabase migrations |
| Supabase production migrations | **Manual / deliberate only**. Never automatic on git push |
| Env distinction | Preview/local → `harbaugh-forms-dev` / `ewxsxwzezhkeawnjvigx`; Production → `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` |

**Safeguard used:** verified CLI link + `.env.local` host before development `db push`; refused any production target; no merge to `main`.

#### Schema (development)

Original migration (immutable; already applied to development): `20260729210000_brokerage_offices_trec_audit.sql`

Cleanup migration (forward-only; applied to development only): `20260730010000_remove_brokerage_offices_and_trec.sql`

| Final object | Status |
|--------------|--------|
| `audit_settings` | **Retained** |
| `audit_events` | **Retained** (without `brokerage_office_id`) |
| `brokerage_offices` | **Removed** |
| `organization_members.brokerage_office_id` | **Removed** |
| TREC verification columns on `user_agent_settings` / `organizations` | **Removed** |
| Preexisting manual license fields (`trec_license_number`, `broker_license_number`, etc.) | **Preserved** |
| `organizations` / memberships / invitations / packets | **Preserved** |

**Migration strategy:** Do not edit the already-applied combined migration. Cleanup is a new forward-only migration without `CASCADE`. If this branch is later merged, both migrations run together and yield the audit-only schema.

#### Routes / UI

| Item | Status |
|------|--------|
| `/admin/audit` | **Retained** (Global Admin) |
| `/admin/organizations` (+ detail) | **Preserved** (authoritative multi-brokerage admin) |
| `/admin/users` invite | Restored to manual license entry; no office / no TREC lookup |
| `/admin/brokerages` | **Removed** (stale URL → normal not-found) |
| Brokerages nav item | **Removed** |
| `POST /api/admin/trec-lookup` | **Removed** |

#### Authorization / RLS (retained audit)

- Audit settings / cross-org audit events: app admin only
- Audit event insert via authenticated role: **denied** (trusted service-role writes only)
- Audit append-only trigger blocks UPDATE/DELETE
- All `/admin/*` routes gated by `requireAppAdminPage()` in admin layout

#### Env vars

| Variable | Status |
|----------|--------|
| `TREC_SODA_APP_TOKEN` / `TEXAS_OPEN_DATA_APP_TOKEN` | **Abandoned** — not part of the application |
| Existing Supabase + site URL vars | unchanged |

#### Tests / build (cleanup validation)

| Suite | Result |
|-------|--------|
| `npm run test:admin-audit` | **11 pass** |
| `npm run test:admin-invite` | **14 pass** |
| `npm run test:admin-orgs` | **4 pass** |
| `npm run test:field-defaults` | **77 pass** |
| `npm run test:field-defaults-management` | **43 pass** |
| `npm run test:form-copy-global` | **89 pass** |
| `npm run test:field-instance-sync` | **17 pass** |
| `npm run test:library-permissions` | **13 pass** |
| `npx tsc --noEmit` | **pass** (after clearing stale `.next/types`) |
| ESLint on changed sources | **pass** |
| `npm run build` | **pass** — routes include `/admin/audit`; no `/admin/brokerages` or `/api/admin/trec-lookup` |

#### Development data checks

| Check | Result |
|-------|--------|
| DGR org (license 9006865) | **1** remains |
| Dee broker on org | remains (`0283607`) |
| Lee agent | remains (`0712335`) |
| `brokerage_offices` table | gone (PostgREST PGRST205) |
| Office / TREC verification columns | gone |
| `audit_settings` / `audit_events` | present (8 events retained) |
| Dev packets / packet_forms / field_instances | **21 / 68 / 1502** (field_instances unchanged from prior recorded 1502; packet counts grew independently of this cleanup) |

#### Commit / push / Preview

| Item | Status |
|------|--------|
| Cleanup commit | `862f3b480f0f3cbf1bf0051a730805ff92757e95` |
| Env-safety commit | `6ebeb1351fa3ebac0639e6c9987034193d16c3d5` |
| Remote branch | `origin/feature/admin-brokerage-trec-audit` |
| Preview Deployment | **success / safe for manual testing** — https://harbaugh-forms-r82v16w95-lee-harbaugh-s-projects.vercel.app (dashboard: https://vercel.com/lee-harbaugh-s-projects/harbaugh-forms/BNUFPH1ApWFMvCVkW61KdjFurdxf); Preview env → development Supabase `ewxsxwzezhkeawnjvigx` |
| Production rollout | **complete — see section above** |

#### Remaining Preview smoke tests

Lee should confirm Organizations admin, invite with manual license, Audit Log toggle, non-admin denial, and existing packets on the new Preview.

#### Unresolved risks / deferred

- Form resolvers still use legacy `brokerage_settings` singleton
- Broader audit event coverage intentionally deferred
- No production rollout yet

#### Environment-loading safeguard (2026-07-29)

**Risk assessed:** `npm run build` previously printed `Environments: .env.production.local, .env.local` because Next.js auto-loads `.env.production.local` whenever `NODE_ENV=production`.

**Assessment findings (names/refs only; no secret values):**

| Question | Finding |
|----------|---------|
| Why loaded | Next.js production build env precedence includes `.env.production.local` |
| Vars in that file | `TARGET_SUPABASE_URL`, `TARGET_SUPABASE_SECRET_KEY`, `TARGET_SUPABASE_PUBLISHABLE_KEY`, `TARGET_DB_PASSWORD`, `SOURCE_SUPABASE_URL`, `SOURCE_SUPABASE_SECRET_KEY` |
| Point at production? | TARGET_* → `eetonalyyyssvkyfdoxh`; SOURCE_* → `ewxsxwzezhkeawnjvigx` |
| App keys overlapped? | **No** — app uses `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SECRET_KEY` from `.env.local` (dev) |
| Build-time DB init | Clients create on call; admin pages can run during static generation/PPR using app env |
| Build mutates DB? | No intentional mutations in build; risk was silent credential mix |
| Prior build prod network? | No evidence of production app-client use (app URL remained development) |
| Vercel Preview | Separate Preview-scoped vars → **development** `ewxsxwzezhkeawnjvigx` (verified via `vercel env pull`) |
| Vercel Production | Production-scoped vars → `eetonalyyyssvkyfdoxh` |
| `.env.production.local` tracked? | No (`.env*.local` gitignored) |
| Scripts needing prod creds | Explicit ops scripts only (`migrate:approved-auth`, export/import/validate/copy approved production data, condo TXR-1605 prod sync/rollback, forensic/repair helpers) |

**Fix applied (Option A + Option C):**

* Renamed local ops file to gitignored `.env.ops.production` (Next does **not** auto-load it)
* Production-ops npm scripts and runbook now load `.env.ops.production` explicitly
* `npm run build:validate` refuses a present `.env.production.local` and requires development app URL
* `assertAppSupabaseTargetAllowed` blocks production app URL outside Vercel Production

**Documented validation command:** `npm run build:validate` (not bare `npm run build` when validating features locally).

#### Production rollout steps (**completed 2026-07-29**)

1. Lee review of revised branch + Preview smoke tests — **done**
2. Merge to `main` (PR #24 squash) — **done** (`3b81840`)
3. Link CLI to `harbaugh-forms-prod`; verify ref `eetonalyyyssvkyfdoxh` — **done**
4. Apply both migrations — **done**
5. Smoke-test Organizations/audit (API + RLS) — **done**
6. Confirm DGR / Lee / Dee + packet fingerprints unchanged — **done**
7. Relink CLI to development — **done**

### Form #1 Buyer Rep placement corruption — investigated and repaired (2026-07-28)

**Symptom:** Production Form #1 (Buyer Representation Agreement) appeared to have mangled/scattered field placements. Spot checks of other forms looked normal.

**Form identity (unchanged):**

| Attribute | Value |
|-----------|--------|
| Form id | `1` |
| Code / version | `TXR-1501` / `TXR-1501-01-05-26` |
| Name | Buyer Rep Agreement |
| Scope | `GLOBAL` (no owner) |
| Status / publication | `ACTIVE` + `PUBLISHED` |
| PDF path | `global/forms/1/BuyerRepAgreement_202601.pdf` |
| PDF | 6 pages, 612×792, MD5 `5524a91e07baec4ce16dee0ba38209ba` (identical in development and production) |

**Root cause (database, not PDF/UI scaling):** On **2026-07-23T16:30:45Z**, production received **142 orphan ACTIVE `form_field_mappings`** for Residential Lease catalog keys (`txr_2001_*`) incorrectly attached to **form_id = 1**. Those mappings pointed at **duplicate catalog fields** that are now `DELETED`. Genuine TXR-1501 placements (55) remained intact and matched development / `MAPPING_INTEGRITY_AUDIT.md`. Form **18** (TXR-2001 Residential Lease) still held its correct **140** ACTIVE mappings. The Map Fields UI loads all ACTIVE mappings, so the lease overlays (including pages 7–16 on a 6-page PDF) made Form #1 look corrupted.

**Ruled out:** PDF replacement; coordinate corruption of the 55 Buyer Rep rows; Personal placement overrides (deferred; none on Form #1 packets in production); invitation-auth repair (2026-07-28); batch draft-template import (forms 28–50 only); TXR-1605 sync; Git migrations after launch that retarget Form #1.

**Recovery source:** Soft-delete the 142 orphan mapping IDs on form_id=1 only. Do not rewrite the 55 genuine placements (already known-good). Development Form #1 fingerprint was the proof target.

**Repair:** Audited script `scripts/repair-form1-txr2001-orphans.ts` with `--confirm SOFT_DELETE_FORM1_TXR2001_ORPHANS` (service-role soft-delete; no CASCADE; no other forms).

**Backup / evidence (gitignored `_audit_tmp/`):**

- `form1-placement-backup-2026-07-28T21-54-39-138Z.json`
- `form1-repair-result-2026-07-28T21-54-39-138Z.json`
- Forensic dumps: `form1-placement-forensic-*.json`, `form1-placement-analysis.json`, `form1-txr2001-ownership.json`

**Validation after repair:**

| Check | Result |
|-------|--------|
| Production Form #1 ACTIVE mappings | **55** (was 197) |
| Dev ↔ prod Form #1 mapping fingerprint | **match** `e1531fae…533421` |
| PDF checksum | unchanged / identical |
| Non–Form-#1 ACTIVE mapping fingerprint | unchanged `ffc7925473a4596b79ca019efb8cfed2c25b98df7ae0db5f00b319ca551e6aa0` (1956 rows) |
| Packet `field_instances` count probe | unchanged **173** |
| Orphan `txr_2001_*` ACTIVE on Form #1 | **0** |
| Form 18 TXR-2001 ACTIVE mappings | untouched **140** |
| Production visual inspection (Lee, 2026-07-28) | **Passed** — Form #1 placements render correctly after orphan soft-delete |

**Local forensic artifacts (gitignored `_audit_tmp/`; not committed — contain full row-level production mapping UUIDs):**

| File | SHA-256 |
|------|---------|
| `form1-placement-backup-2026-07-28T21-54-39-138Z.json` | `a3e3f16b3a2454e8def54df05509d39df79f64a2565928df83d7e7ae81e6af16` |
| `form1-repair-result-2026-07-28T21-54-39-138Z.json` | `64fae4a284233d0d4a6d9faeef14be09dc8f10336e507252532608f9ad2f67f8` |
| `form1-placement-forensic-2026-07-28T21-55-03-102Z.json` (post-repair) | `cef1342887586640cb9392e3f7c2807d1baba4ec250680b58240a86733d5304d` |

**Deferred prevention:** Add a guard that rejects mapping inserts when `page_number` exceeds the form PDF page count, and/or when `field_key` family does not match the form’s `form_code` family. Exact 2026-07-23 interactive writer was not found in Git history (live DB write).

### Invitation confirmation repair (2026-07-28)

Production invitees who clicked **Accept Invitation** previously saw `Error: No token hash or type` because invite emails used Supabase’s `ConfirmationURL` / `redirectTo` path into `/auth/confirm` **without** `token_hash` and `type`, while the app only called `verifyOtp`.

**Fix (application):**

- `/auth/confirm` now validates supported email OTP types, calls `verifyOtp({ token_hash, type })` for token-hash links, and separately supports PKCE via `exchangeCodeForSession` when only `code` is present
- Invite verification defaults to `/auth/update-password`; recovery uses the same password page
- Existing `/auth/update-password` flow was hardened (session required, confirm password, server-side policy, `updateUser`, activate invited profile)
- User-facing auth errors no longer expose raw “No token hash or type” text

**Required Supabase Dashboard settings (Lee must verify manually):**

| Setting | Value |
|---------|--------|
| Site URL | `https://forms.harbaughrealestate.com` |
| Invite user email link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/update-password` |
| Recommended recovery email link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password` |
| Redirect allowlist | `https://forms.harbaughrealestate.com/**`, `https://harbaugh-forms.vercel.app/**`, and local `http://localhost:3000/**` as needed |

Custom SMTP via Resend is already configured. The invite template must use **TokenHash** (not ConfirmationURL alone).

**Failed prior invitations:** Do not recreate Auth users. Prefer **Resend invitation** if `email_confirmed_at` is still null; if already confirmed without a usable password, send **Forgot password** / recovery instead. Then have the user open the new email link and set a password.

**Changed files:** `app/auth/confirm/route.ts`, `lib/auth/email-otp.ts`, `lib/auth/password-policy.ts`, `lib/auth/auth-confirm.test.ts`, `app/auth/actions.ts`, `app/auth/update-password/page.tsx`, `app/auth/error/page.tsx`, `components/update-password-form.tsx`, `components/forgot-password-form.tsx`, `lib/admin/invite-user.ts`, `package.json`, `project_status.md`, `decisions.md`.

**Validation:** `npx tsc --noEmit`; `npm run test:auth-confirm` (27); `npm run test:admin-invite` (14); `npm run test:form-controls`; `npm run test:ui-lists`; `npm run test:library-permissions`; ESLint on changed auth sources; `npm run build` — all passed.

### Form publication lifecycle

Draft / Published / Retired form templates are live in development and production:

- **Status:** `ACTIVE` (current), `INACTIVE` (retired), `DELETED` (soft-delete)
- **Publication:** `DRAFT` / `PUBLISHED` — only `ACTIVE` + `PUBLISHED` forms are selectable for new collection use and immediate packet instantiation
- **Packet-form availability:** `AVAILABLE` / `PENDING_PUBLICATION` (orthogonal to document `DRAFT`/`FINAL`/`SIGNED`/`VOID`)
- Explicit actions: Publish, Unpublish, Retire Version, Restore Retired Version (restore is application ADMIN + reason only)
- New forms start as Draft; Published forms require Unpublish before structural edits (including shared field source/metadata through Map Fields); Retired forms are read-only including form-specific defaults
- Publish validates the actual stored PDF server-side (Storage download + page count) and rejects out-of-range ACTIVE mappings
- **Secure publish (production):** PR **#20** merged at `ef37b34099f5a295c0e77276ec6c3a39305c3ef8`. Migration `20260725180000_secure_publish_form_template.sql` is applied in production. Production Publish uses the restricted trusted-server pathway: `anon` and `authenticated` cannot execute `publish_form_template`; only `service_role` has EXECUTE. Actor verification and structural fingerprint checks are live. Production rollout and smoke validation completed successfully.
- Collections may retain Draft/Retired references; packet creation skips retired versions and creates pending placeholders for Draft collection forms
- Lifecycle migration: `20260725120000_form_publication_lifecycle.sql` (applied in development and production)

### Development condo contract catalog (2026-07-24)

Development work on `harbaugh-forms-dev` created ACTIVE Global form **TXR-1605** / TREC 30-18 (development form id **24**, version `TXR-1605-05-04-2026`) with Lee’s supplied `CondoListing.pdf`, **13** new Global condo fields, and **158** ACTIVE mappings. See `CONDO_TXR_1605_FIELD_INVENTORY.md` and `CONDO_TXR_1605_DEVELOPMENT_IMPLEMENTATION.md`.

### Production TXR-1605 sync (2026-07-25)

Lee finalized Map Fields placement and Organization defaults in development. That final state was selectively synchronized onto the **existing** production form id **20** (same stable identity; not recreated). PDF already matched (`REUSE`). Packet snapshots unchanged. See `CONDO_TXR_1605_PRODUCTION_SYNC_AUDIT.md`.

### Production URLs

| Role | URL |
|------|-----|
| Primary | https://forms.harbaughrealestate.com |
| Fallback | https://harbaugh-forms.vercel.app |

### Environments

| Environment | Supabase project | Ref | Role |
|-------------|------------------|-----|------|
| Production | `harbaugh-forms-prod` | `eetonalyyyssvkyfdoxh` | Live app data (East US / North Virginia) |
| Development | `harbaugh-forms-dev` | `ewxsxwzezhkeawnjvigx` | Local development and Vercel Preview |

- Vercel project: **`harbaugh-forms`** (team: Lee Harbaugh’s projects). Do not confuse with `harbaugh-dfw-market-dashboard`.
- Production branch: `main` (GitHub `leeharbaugh/harbaugh-forms`).
- Production `NEXT_PUBLIC_SITE_URL` and Supabase Auth Site URL use the primary custom domain.
- Vercel fallback remains on the Auth redirect allowlist.
- DNS for the custom subdomain is managed at HostPapa (CNAME to Vercel).
- Production and development credentials remain isolated.
- At rollout, all **87** migrations were applied and production migration history was aligned. Historical migrations remain immutable; future schema changes use forward-only migrations.

### Live production data (evolving)

Production is now a live, evolving Lee-managed dataset. The exact current counts of contacts, properties, packets, forms, collections, defaults, and storage objects are intentionally not maintained in this document. The documented counts below represent the validated rollout baseline immediately after migration.

Lee may invite additional users later; do not assume Auth remains Lee-only without checking operational records outside this file.

### Validated rollout baseline (historical)

At the completion of the July 2026 selective production migration and custom-domain launch validation, the validated rollout baseline contained the following. These figures are **historical rollout evidence only**, not present-day live counts.

#### Auth (at launch)

- Lee was the only Auth user
- email: `lee@leeharbaugh.com`
- UUID: `e26c8f57-c0aa-4474-b43e-6e15f0260e99`
- identity ID: `b1c72b22-2835-44d9-afd4-294fc21d1ca5`
- Application ADMIN / Global Admin and Davey Goosmann Realty ORG_ADMIN
- Dee Davey existed as broker/business profile data, not as an Auth user

#### Selective public data (at launch)

| Area | Rollout baseline |
|------|------------------|
| Contacts | 2 Frank Hernandez; 3 Lisa Ann Ellison Hernandez; 4 Abbas Q Lotia; 6 Munira Abbas Lotia |
| Properties | 1 — 6308 Plainview Dr., Arlington, TX 76018; 3 — 5444 Presidio Dr., Grand Prairie, TX 75052 |
| Packets | 2 and 5 |
| Forms | 1–18 (excluded 21, 22, 23 — Lee may create a condo form manually) |
| Collections | 1, 2, 3, 5 (excluded 4, 7, 9, 12, 14) |
| Defaults | 101 ACTIVE approved (56 Lee Personal all-forms; 41 Lee Personal form-specific; 4 Davey Goosmann Realty Organization) |
| Storage | 30 private objects (18 Global form PDFs; 12 generated documents for packets 2 and 5) |

#### Packet fingerprints (at launch)

- **Packet 2:** 65 field instances; packet forms 7–12 ACTIVE; packet forms 25 and 26 preserved as DELETED; Buyer Rep agreement 1; contacts 2 and 3; buyer_rep_details 1
- **Packet 5:** 107 field instances; 16 manual overrides; contacts 4 and 6; property 3

### Launch validation (completed)

- Selective Auth + public-data import + allowlist storage copy validated via repository tooling
- Both storage buckets private; anon object download denied; service-role access used by the app as designed
- Vercel Production deployed; custom domain DNS/SSL verified; HTTP→HTTPS; smoke tests on primary domain and fallback passed
- Artifacts: `PRODUCTION_DATA_SELECTION_MANIFEST.json`, `SELECTIVE_PRODUCTION_DATA_MIGRATION_AUDIT.md`, `PRODUCTION_ROLLOUT_RUNBOOK.md`, `PRODUCTION_READINESS_AUDIT.md`

### Stack

Next.js · Supabase · Vercel · GitHub · Cursor

---

## Current Architecture

### Database

- Supabase PostgreSQL with Row Level Security
- Soft deletes via status fields; `CREATE_DATE` / `UPDATE_DATE`
- User preferences in `public.user_preferences`
- Preferences for form completion live in scoped Personal and Organization `field_defaults` (never Global catalog literals)

### Removed architectures (do not revive)

- **`contract_details`** — table, source type, resolvers, and related application wiring removed
- **Legacy Listing workflow** — `listing_agreement_details`, `/listing-agreements` UI, Listing-specific resolver/source paths, and agreement-linked Listing wizard branch removed
- **Brokerage legacy defaults** — seven obsolete `brokerage_settings.default_*` columns removed; genuine brokerage identity/contact fields retained

### Current Listing and Buyer Rep

- Listing packets are **collection-based**
- Buyer Rep agreement architecture remains (tables, route, packet generation from Buyer Rep agreements)

### HOA

- `property_hoas` is authoritative
- UI uses the first ACTIVE HOA row (`ORDER BY create_date, id`) as a temporary single-record convention
- Multi-HOA UI remains deferred

### Source registry

Removed as selectable source types: `packet`, `static_default`, `contract_details`, `listing_agreement_details`.

Historical instance provenance `source='packet'` remains display-compatible as “From packet.”

### Resolvers

TypeScript custom resolvers remain accepted for concatenation, formatting, selecting rows from multi-row results, composite business values, and Buyer Rep / related logic. Resolver-catalog unification is optional future maintenance, not a production blocker.

### Form and collection scope

- Forms: `GLOBAL` or `PRIVATE` (create UI offers Private for all users; Global only for application `ADMIN`, with server-side enforcement)
- Collections: `ORGANIZATION` or `PRIVATE` (never `GLOBAL`)
- Organization members may view, use, and privately copy organization collections
- `ORG_ADMIN` manages collections for their own organization; application admins may manage across organizations
- Packets may be collection-backed or **Custom** (`packet_type = custom`, no collection, zero initial forms; documents via existing external upload on `packet_forms`). First-class import of one-off received PDFs into collection-backed packets (without a reusable Form/Collection) is planned; see Future Product Roadmap.
- The global Fields catalog page is removed from product navigation; field work stays on Map Fields / form templates (`/forms/fields` redirects to Templates)

### Form defaults

- Defaults: `PRIVATE` or `ORGANIZATION` only — never `GLOBAL`
- Private overrides Organization
- Product precedence (after current/manual override and mapped transaction data): mapping-scoped Personal → form-scoped Personal → legacy field-only Personal → mapping-scoped Organization → form-scoped Organization → legacy field-only Organization → blank
- Persisted packet field instances are **immutable on ordinary open**; missing instances may be inserted; existing values change only via explicit edit or Refresh

### Administrative roles

- `profiles.app_role`: `USER` | `ADMIN`
- Organization membership: `MEMBER` | `ORG_ADMIN`
- Axes are distinct; Copy to Global Library requires application `ADMIN`

### Property address uniqueness

Owner-scoped uniqueness on normalized street, unit, city, state, ZIP5. Deleted records do not block replacement.

### PDF forms

Visual PDF field editor is the primary workflow for **reusable form templates**. Ignore signature/initial lines for standard catalog extraction (current Authentisign-exclusion inventory policy). Do not pursue AI-generated coordinates as the primary path. Packet-document annotations and a native e-signature workflow are planned separately from the reusable field catalog (see Future Product Roadmap).

### Map Fields

One Forms → Map Fields workspace for structure and scoped defaults. Terminology: **Filled from** / **Default if blank** / **Default source**. Fill Form: **Current value** / **Value source** (legacy generic snapshots display **Default**).

---

## Production Migration Tooling

Repository tooling (guards, dry runs, allowlists) supports:

- UUID-preserving Lee Auth migration
- Selective public-data export/import
- Manifest-driven storage copy with checksum verification
- Sequence resets and source/target environment guards
- Packet fingerprint validation and full production validation scripts

Primary paths: `lib/selective-production/*`, `scripts/migrate-approved-auth.ts`, `export-approved-production-data.ts`, `import-approved-production-data.ts`, `copy-approved-storage.ts`, `validate-production-migration.ts`, `PRODUCTION_DATA_SELECTION_MANIFEST.json`.

Do not re-run production validation against live data for documentation updates after Lee has begun legitimate post-launch edits.

---

## Completed Features (product)

- Multi-user auth and ownership; clients/contacts; properties; Buyer Representation Agreements
- Form templates; Global/private libraries; visual PDF field editor; field mappings
- Packet templates and generated packets; empty Custom Packet creation; organization/membership administration
- Organization-scoped collections and private collection copying
- Soft-delete patterns; database-backed user preferences; resizable column preferences
- Scoped Private/Organization field defaults; unified Map Fields (PR #2)
- UI refresh Phases 1–4; Global form-copy traceability
- Architecture cleanup: contract details removal, legacy Listing workflow removal, brokerage legacy defaults removal, HOA consolidation, source-registry cleanup
- Production selective migration + Vercel deploy + custom domain launch (July 2026)

---

## Recent Schema Cleanup Migrations (dev → prod at rollout)

Forward-only migrations applied on development and carried into production at rollout include (non-exhaustive):

- `20260717120000`–`20260717230000` — catalog default clears, packet-instance repairs, packet-form lifecycle locking
- `20260721190000` — abandoned `contract_details` sources → `manual_only`; Buyer Rep broker checkbox reactivation
- `20260722120000` — property HOA consolidation onto `property_hoas`
- `20260722180000` — `contract_details` architecture removal
- `20260722190000` — legacy Listing workflow removal
- `20260722200000` — brokerage legacy `default_*` column removal
- `20260722210000` — unused source-registry metadata removal

Do not edit already-applied migrations. Add a new corrective migration when needed.

---

## Next Steps (operations)

1. **Gate A production rollout preparation:** backup/checkpoint verification and final production migration preflight. Do **not** execute migrations until Lee explicitly approves.
2. **TXR-1957 / T-47.1:** Lee visual Map Fields review at `/forms/53/editor`; keep DRAFT; do not publish until placements approved. Development mirror remains deferred.
3. **TXR-2216:** Lee visual Map Fields review at `/forms/51/editor`; keep DRAFT; do not publish until placements approved. Development mirror remains deferred. Optional: smoke multi-tenant `tenant_names` on a DRAFT lease packet with two TENANT contacts when such a packet exists.
4. Monitor real-world Lee-only production use; review runtime logs periodically
5. Verify production invite email template uses TokenHash + `type=invite` + `next=/auth/update-password`, then run one brand-new invitation smoke test
6. Treat the two previously failed invitees with Resend invitation or password recovery (do not create duplicate Auth users)
7. Add error tracking before broader multi-user exposure
8. Establish production backup/restore procedures
9. Consider paid tiers only when recovery, usage, or SLA requirements justify them
10. Review Mapbox domain restrictions if map behavior fails on the custom domain

## Future Product Roadmap

Two **major** planned feature areas. They are related through the packet/document model, but they are **distinct product efforts**. Native Signing architecture is recorded in `decisions.md`; Stages 1–6, TC/operator authority, and completion delivery are merged to `main` (DB development-only). Production Native Signing enablement, drawn UI, and representative signing remain deferred. Imported-document markup remains separate.

### Native E-Signature Workflow

A native e-signature capability is one of the larger planned product areas. High-level intent:

- Users should eventually prepare packet documents for signature **inside Harbaugh Forms**.
- Signature preparation should support assigning signature and initial **locations to specific parties/signers**.
- The workflow should cover both:
  1. documents already generated by Harbaugh Forms (collection/template-based packet forms), and
  2. one-off PDFs imported into a packet (see the distinct feature area below).
- The system should distinguish:
  - a **placed annotation** that already contains a signature or initial (for example, “Lee’s initials LH are already here”), versus
  - a **signer field** that marks a location where a particular signer still needs to sign or initial (for example, “Seller 1 must initial here”).
- E-signature design should integrate with the **packet/document model**, not force signature locations through the reusable form-field catalog.
- Auditability will matter in a future implementation: signer identity, document version, timestamps, completed-signature state, and a reliable record of what was signed.

**Current related state (not the full feature):** Fill Form already supports packet-form **typed signature** and **Date Signed** annotations (`typed_signature` | `date_signed`) with persisted position/size, PDF embedding, and soft deletion. Packet forms already have `document_state` values `DRAFT` / `FINAL` / `SIGNED` / `VOID`; the UI still does not transition into `SIGNED` because a real signing workflow does not exist yet. Native Signing evidence will live in dedicated Signing tables and private artifacts, not by promoting Fill Form annotations into legal Signing state.

**Vendor / architecture:** Do **not** treat a specific external e-signature vendor as committed. Prior documentation assumed **Authentisign** for signature/initial handling (catalog extraction skips those lines; deferred “Authentisign integration (may set `SIGNED`)”). That research and the current inventory-exclusion policy are preserved. Native in-app e-signature is the planned product capability.

**Relationship to markup/import:** Agent markup continues to extend `packet_form_annotations` where appropriate. Ceremony **signer fields**, placements, and completed marks belong to the approved Signing data model (`signing_fields`, adopted marks, placements, artifacts, events). Imported Packet Documents + PDF Annotation / Markup Tools is **not** a minor bullet under e-signature; it is a separate feature area that Signings should later be able to consume.

### Imported Packet Documents + PDF Annotation / Markup Tools

A distinct future feature for **one-off PDFs received during a real transaction**, plus fast document-specific markup on Fill Form.

**Design rationale (real-world example):** An agent receives a contract offer from a buyer’s agent for one of the agent’s listings. The seller’s name may be misspelled. The listing agent needs to import that received contract into the **existing listing packet**, strike through the incorrect seller name, type the corrected name next to it, and place initial boxes beside the correction for each party who must initial the change.

**Imported documents**

- A packet should eventually contain both:
  1. reusable/template-based documents generated from Harbaugh Forms forms/collections, and
  2. one-off externally supplied PDFs imported **directly into that specific packet**.
- Importing a received PDF must **not** require creating a reusable Form record, adding it to the global/private form library, mapping fields, publishing it, or adding it to a Collection first.
- Imported PDFs should participate in the packet’s document-editing and (future) signature workflow similarly to generated packet documents.

**Current related state (not the full feature):** Custom packets (`packet_type = custom`) already attach user documents as `packet_forms` with `origin = external_upload`. Collection-backed packets (for example an existing listing packet) still need a first-class “import this received PDF into this packet” product path that does not go through the reusable form library.

**Quick PDF annotations**

Fill Form / PDF editing should eventually include fast, **document-specific** tools such as:

- Add Text
- Strikethrough
- Initial field / initial box
- Signature field / signature box

Possible later tools (checkmark, X, underline, highlight) are **not** first-iteration requirements.

These quick annotations are **not reusable Harbaugh Forms fields**. If an agent clicks Add Text and types a corrected seller name onto page 4 of a particular received offer:

- Harbaugh Forms should not match that text to an existing catalog field such as `SELLER_NAME`.
- It should not create a new reusable field in the field catalog.
- It should not participate in form-field defaults, source mapping, or global/private field management.
- It should be stored as a **packet-document-specific annotation** with page/position/size/content.

A strikethrough is purely a graphical/document annotation with no semantic reusable-field meaning.

**Reuse existing annotation architecture.** Typed-signature work already introduced `packet_form_annotations` (persisted positioning/sizing, PDF embedding, soft deletion, creator attribution). The preferred direction is to **extend that annotation architecture where it fits**, rather than forcing markup into the reusable field system or inventing an unnecessary parallel concept.

Possible future annotation concepts (names not finalized as database enums): typed signature, typed initial, free text, strikethrough, signer initial field, signer signature field. Preserve the distinction between a **placed** annotation and an **uncompleted signer field**. Authoritative types in production today remain `typed_signature` and `date_signed` only.

## Deferred Product Work

Smaller / optional items (not the two major roadmap areas above):

- Optional multi-HOA Property UI / primary-HOA designation
- Listing addendum forms 21–23 remain separate from the condo sales contract path
- Optional Listing inverse-checkbox automation
- Possible future dedicated Listing transaction model (only if a real business need emerges)
- Optional resolver-catalog cleanup / unification
- Buyer Rep preference/default architecture review if still relevant
- Dependency upgrades before broader multi-user exposure if advisories remain
- Personal placement overrides / Restore Global position (deferred)
- Organization Admin membership/settings UI (outside Map Fields); Global Admin / Org Admin terminology polish
- Scoped source-mapping overrides without duplicating Global PDFs
- Optional cross-form defaults dashboard
- Refresh Values before/after field-diff preview
- Optional Unknown legacy provenance wording improvement
- Uploaded signature images remain deferred; native Signing design now includes typed/drawn adoption and one optional reusable signature/initials preset for authenticated Users (2026-09-06)

## Known Issues (non-blocking)

- Signature / initials fields may appear but are not editable as preference defaults
- Multi-organization users need a valid `profiles.primary_organization_id` with ACTIVE membership for Organization defaults
- `listing-packet-kind.test.ts` has a pre-existing bare-Node `@/lib` import-resolution problem
- Occasional Next.js hydration warning around `AdminSectionNav` / packet page — the admin-page cause (runtime-locale timestamps, React #418) is fixed by `lib/format-timestamp.ts` (2026-10-02); packet pages' `formatDateTime` was audited 2026-10-02 and is not a hydration source (rendered only client-side after data load); its separate UTC-date / local-time display defect was fixed 2026-10-02 (PR #52, Central time with CDT/CST)
- Specialized PDF editor dialogs lack full focus-trap behavior of confirm/info dialogs
- Repo-wide `npm run lint` can fail when ESLint scans `.next` artifacts; targeted lint of source files is preferred

---

## Development Machine Checklist

Before making changes:

1. Clone or pull the GitHub repository; `git fetch --all --prune`
2. Check out `main` and confirm it matches `origin/main`; clean working tree
3. Use the Node version and package manager declared by the repo; clean install
4. Restore `.env.local` securely (never commit). For production ops tooling only, use gitignored `.env.ops.production` (never `.env.production.local` — Next.js auto-loads that name during `next build`)
5. Confirm local Supabase targets **`harbaugh-forms-dev`** (`ewxsxwzezhkeawnjvigx`) unless an explicit production-ops task says otherwise
6. Confirm Supabase CLI auth/link; compare migration history before applying migrations
7. Do not run `supabase db reset`, reckless `db push`, or migration-repair until target and history are verified
8. Confirm GitHub and Vercel access when needed (`harbaugh-forms` project only for this app)
9. Run `npx tsc --noEmit`, relevant tests, and `npm run build:validate` for feature-branch validation
10. Do not reset or edit already-applied migrations; do not run destructive SQL against environments with real business data

## Required Local Environment Variables

Document names only; never store values in Git.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- Existing Supabase + site URL vars (see environment files; not committed)

Confirm additional names from `.env.example` and code before work on a new machine.

---

## Durable Decision Pointers

See `decisions.md` for architectural decisions. Highlights:

- Separate production and development Supabase projects; credentials isolated
- Primary domain `forms.harbaughrealestate.com`; Vercel URL is fallback
- Selective allowlist migration; rollout-baseline counts are historical evidence only
- Packet snapshots immutable on ordinary open; scoped defaults own preferences
- Listing packets are collection-based; Buyer Rep remains; `property_hoas` authoritative
- TypeScript custom resolvers remain accepted
- Invitation-only access; invite confirmation uses token-hash `verifyOtp` (PKCE preserved separately); HostPapa DNS changes limited to intended subdomain records
- Packet-form annotations (`typed_signature`, `date_signed`) are packet-document-specific agent markup, not catalog fields and not Native Signing evidence; future Fill Form markup should extend that annotation model, while ceremony signer fields belong to Signing-owned tables
- Native e-signature is planned in-app; Authentisign remains prior research / current inventory-exclusion policy, not a committed vendor
- Native e-signature architecture decisions are in `decisions.md`. Stages 1–5 (foundation through participant ceremony) exist on `main` with development-only DB; completed-PDF finalization, delivery, and production enablement are not started
- Signing development must preserve the verified F1–F11 security baseline and R12 Stage 1 deny-by-default tests before each stage is complete
- One-off imported packet PDFs should not require the reusable form-library workflow; quick PDF annotations are not reusable fields
- Packet existing-property search shows matches only after the user types; a blank query does not list all properties, and the selected property stays independent of the search box
- Packet assigned property is independent of the property-entry UI mode; toggling Select existing / Create new does not clear or replace the assignment
- Production Vercel deployments should be validated at the unique deployment URL before manual custom-domain promotion; automatic custom-domain assignment should remain disabled

---

## Git State (documentation sync)

- Feature documentation updates for production status land via focused PRs into `main`
- Pre-launch merge tip for storage tooling: `db3a3f2` (PR #15) — subsequent commits may document launch status

## Historical Session Log

Detailed day-by-day session notes from June–July 2026 development (defaults UI, containment repairs, Listing/Contract cleanup, etc.) remain in Git history prior to the 2026-07-24 production-status documentation update. Statements in those historical entries about “no production environment” reflected the state **at the time of that session**, not the current live deployment.

---

## Security remediation — F6 admin reader authorization (2026-09-11)

Completed the F6 repair from the security report. Each affected administrator page now verifies Global Admin authorization before loading page data, and every exposed service-role reader independently verifies authorization before creating its privileged client. The affected readers cover administrator users, organizations, memberships, directory users, audit settings, and audit events.

`getAuditSettings` is administrator-only. Ordinary audit-event recording uses a private settings loader so routine audit logging remains available to non-administrator application flows.

Validation passed: targeted ESLint, `npx tsc --noEmit`, admin-audit (14), admin-organization (4), and admin-user-lifecycle (23) tests. In a local development role-matrix check, ordinary HTML and RSC requests emitted a Next redirect instruction before protected data and did not contain a synthetic administrator marker; an administrator response contained that marker. Repository-wide lint remains unsuitable as a gate because it scans existing generated `.next` output and unrelated debug scripts.

Deployment: commit `39ca2f4` passed its Vercel deployment checks and was manually promoted to `forms.harbaughrealestate.com` on 2026-09-12. A manual smoke test confirmed the live site remained functional.

---

## Workstream boundary — security and Native Signing (2026-09-12)

### Security remediation — active

F1, F2/F8, F3/F4, F5, F6, F7, F9, F10, and F11 are deployed and passed their respective validation. The remaining security findings are tracked outside this repository in the private audit record; security work must remain a separate remediation stream.

### Native Signing — Stage 1 foundation in development

Stage 1 schema + private `signing-artifacts` bucket + deny-by-default browser access landed on `feat/native-signing-stage-1` and was applied only to `harbaugh-forms-dev`. Feature gate remains off. Security remediation and Signing remain separate workstreams: Signing must not weaken F1–F11 controls. Production Signing migration is not authorized by Stage 1 alone.

---

## Security remediation — F1 framework dependency update (2026-09-12)

Updated the locked Next.js release from 16.2.10 to 16.3.5 and changed the application dependency from the unpinned `latest` tag to `^16.3.5`. The regenerated lockfile also updates the related Next.js packages and their transitive runtime dependencies.

Validation passed: `npx tsc --noEmit`, the administrator-audit suite (14 tests), the TXR-1957 manifest suite (11 tests), and the production build. On 2026-09-14, a compatible lockfile refresh updated `brace-expansion`, `browserslist`, `js-yaml`, and `baseline-browser-mapping`; the current lockfile-only audit reports zero vulnerabilities. The full optimized build, TypeScript, ESLint, focused security suites, and every development security validator passed after that refresh.

Deployment: commit `adb8f07` passed its isolated Vercel deployment check and was promoted to `forms.harbaughrealestate.com` on 2026-09-12. The production deployment is `2Q4H8jfQV`; the public login page loaded successfully before promotion. Follow up with ordinary-user and administrator smoke checks using normal, non-production test accounts.

**Dependency refresh rollout:** Vercel deployment `2CMdac6EViudwyp6TgoQbHf8htiM` for commit `348d309` was Ready, its isolated login page loaded, and it was manually promoted to both production domains on 2026-09-14. The live primary domain then loaded the expected login page.

---

## Security remediation — F2/F8 trusted form publication and lifecycle evidence (2026-09-12)

**Status:** Complete in development and production.

The original secure-publish RPC was already restricted to the trusted server pathway, but a normal authenticated table update could still make an `ACTIVE + DRAFT` form `PUBLISHED`. Browser clients could also insert forged rows in `form_state_events`. The new forward-only migration removes browser write privileges and write policies from lifecycle evidence, revokes direct execution of its event-insert helper, and allows a publish transition only when the service-role-only publish operation has supplied its verified transaction actor.

Development validation used disposable records and a normal authenticated browser session. Direct publication was rejected, direct lifecycle-event insertion was rejected, the form remained DRAFT after the failed bypass, and the trusted publish operation still succeeded with a correctly attributed `FORM_PUBLISHED` event. All disposable forms, packet forms, packets, and test storage objects were cleaned up.

**Validation:** `npm run validate:secure-publish-dev`; `npm run test:secure-publish` (12); `npm run test:form-lifecycle` (47); `npx tsc --noEmit`; migration diff check.

**Production rollout:** migration `20260912150000_secure_form_lifecycle_writes.sql` applied successfully after migration-history preflight. Vercel deployment `5PgDepMTRHsDDVweqwDespBdfZK5` for commit `27d0d1b` was manually promoted to `forms.harbaughrealestate.com` on 2026-09-12. The live sign-in page loaded successfully after promotion.

**Related files:**

* `supabase/migrations/20260912150000_secure_form_lifecycle_writes.sql`
* `lib/forms/secure-publish.test.ts`
* `scripts/validate-secure-publish-dev.ts`

---

## Security remediation — F5 finalized document and published template immutability (2026-09-13)

**Status:** Complete in development and production.

The database and Storage policies now enforce the packet-form lifecycle independently of the browser. Authenticated users can create, edit, replace, or remove an annotation or generated PDF only for their active DRAFT packet form. FINAL, SIGNED, and VOID forms block those mutations. Reopening a FINAL form through the existing owner-authorized lifecycle restores normal DRAFT editing.

Published form-template source PDFs are also immutable to authenticated clients, including Global Admin browser sessions. An active DRAFT form remains editable. Privileged maintenance continues to use service-role operations rather than a browser session.

Development validation created disposable records with an authenticated browser session. It confirmed that DRAFT template and packet-document edits succeed; published-template replacement/removal, FINAL annotation changes, and FINAL generated-PDF replacement/removal leave protected content unchanged; and an intentional reopen restores DRAFT edits. Disposable records and objects are cleaned up by the validator.

**Validation:** `npm run validate:final-document-immutability-dev`; `npm run test:packet-form-lifecycle` (7); ESLint; migration diff check.

**Production rollout:** Preflight confirmed that `20260913120000` was the only pending migration and that the required helpers, table columns, policies, and private buckets were present. The migration then applied successfully to `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`). Vercel deployment `CwPBQ82NsD8bgafXpQfZAcz7Evxv` for commit `4ee764f` was Ready, its isolated URL loaded the login page, and it was manually promoted to `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` on 2026-09-13. The live domain loaded the expected login page after promotion.

**Related files:**

* `supabase/migrations/20260913120000_enforce_final_document_immutability.sql`
* `scripts/validate-final-document-immutability-dev.ts`

---

## Security remediation — F7 packet reference ownership (2026-09-13)

**Status:** Complete in development and production.

Packets now validate property, representation-agreement, and collection references against the packet owner at the database boundary. A property or agreement must be active and owned by the packet owner. A collection must be active and either Global, owned by that user, or organization-scoped for an active membership in an active organization.

The privileged field resolver independently applies the same owner boundary to properties and representation agreements. This prevents a legacy or maintenance-created mismatched reference from being materialized into packet field instances when an administrator processes the packet.

Development validation created a disposable foreign-owned property and agreement. Authenticated attempts to attach either to Lee’s packet were rejected, and a deliberately injected legacy mismatch was ignored by the privileged resolver. The validator cleans up its packet, source rows, and temporary Auth user.

**Validation:** `npm run validate:packet-reference-ownership-dev`; `npm run test:field-instance-sync` (17); `npx tsc --noEmit`; ESLint; migration diff check.

**Production rollout:** Preflight confirmed that `20260913130000` was the only pending migration and that the required packet columns, policies, and authorization helpers were present. The migration then applied successfully to `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`). Vercel deployment `AVBgf1WhfGBWj7mQiS1nn637GAa1` for commit `d34ab99` was Ready, its isolated URL loaded the login page, and it was manually promoted to `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` on 2026-09-13. The live domain loaded the expected login page after promotion.

**Related files:**

* `supabase/migrations/20260913130000_enforce_packet_reference_ownership.sql`
* `lib/field-resolver.ts`
* `scripts/validate-packet-reference-ownership-dev.ts`

---

## Security remediation — F9 mandatory audit evidence (2026-09-13)

**Status:** Complete in development and production.

The ordinary audit-logging setting is no longer writable by a browser session. The administrator server action now calls a service-role-only database operation that updates the setting and inserts its mandatory `audit_logging_enabled` or `audit_logging_disabled` event in the same transaction. If the evidence insert fails, the setting change rolls back.

A database-level capability guard and restrictive browser policy provide defense in depth. The audit-settings table is server-only; authenticated browser clients cannot read or mutate it directly. The trusted operation verifies that its named actor is an active Global Admin, records the old and new values in the event metadata, and remains the only supported write path.

**Validation:** `npm run validate:audit-logging-atomic-dev` confirmed that an authenticated Lee browser session is denied a direct update, the trusted operation changes the setting and creates the matching mandatory event, and cleanup restores the original setting through that same operation. `npm run test:admin-audit` (20); `npx tsc --noEmit`; migration diff check.

**Production rollout:** Migrations `20260913140000` through `20260913190000` applied to `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`). Vercel deployment `CwLA3RgxSaqDs5uPZj6yDZ3uubH2` for commit `8d35dbc` was Ready, passed its isolated login-page check, and was manually promoted to both production domains on 2026-09-13. The live domain loaded the expected login page after promotion.

**Operational note:** The local Supabase CLI was still linked to production when the initial migration command was run. The database migrations were therefore applied there before the intended development validation. The compatible server implementation was pushed and promoted immediately; no customer data was changed. The CLI was then relinked to development, where the complete live validation passed. Future preflights must explicitly confirm the linked project reference before any database push.

**Related files:**

* `supabase/migrations/20260913140000_make_audit_logging_changes_atomic.sql`
* `supabase/migrations/20260913180000_capability_guard_audit_setting_writes.sql`
* `supabase/migrations/20260913190000_block_browser_audit_setting_access.sql`
* `lib/audit/record.ts`
* `scripts/validate-audit-logging-atomic-dev.ts`

---

## Security remediation — F10 organization-scoped brokerage settings (2026-09-13)

**Status:** Complete in development and production.

The active brokerage profile is now assigned to **Davey Goosmann Realty**. The database permits a browser user to read brokerage settings only when they hold an active membership in that organization; Global Admin access remains available for administration. Each active organization can have only one active brokerage profile.

The Settings page resolves the signed-in user’s primary organization before loading or saving its profile. Packet field resolution resolves brokerage values from the packet owner’s active primary organization, rather than from the administrator or other viewer opening the packet. A packet owned by an organization with no brokerage profile receives blank brokerage values.

**Development validation:** `npm run validate:brokerage-settings-organization-dev` created and removed a temporary ordinary user and packet. It verified that a New Test Org member could not read Davey Goosmann Realty’s profile, that the same user could read it only after becoming a Davey member, and that packet resolution followed the packet owner’s organization. `npx tsc --noEmit --incremental false`, ESLint, the organization-admin tests, and migration diff checks passed.

**Production rollout:** Preflight confirmed the single active Davey Goosmann Realty organization and one active legacy brokerage profile. Migration `20260913200000_scope_brokerage_settings_to_organization.sql` then applied successfully to `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`), assigning that profile to Davey Goosmann Realty. Vercel deployment `Buf16cJ567deHtzvuiEZ1kan4NqJ` for commit `eb98228` was Ready, its isolated login page loaded, and it was manually promoted to both production domains on 2026-09-13. The live primary domain loaded the expected login page after promotion.

**Related files:**

* `supabase/migrations/20260913200000_scope_brokerage_settings_to_organization.sql`
* `components/settings/settings-page.tsx`
* `lib/field-resolver.ts`
* `lib/types/brokerage-settings.ts`
* `scripts/validate-brokerage-settings-organization-dev.ts`

---

## Security remediation — F11 authentication redirect validation (2026-09-14)

**Status:** Complete in development and production.

Authentication confirmation now rejects control characters and their encoded forms before handling a caller-supplied `next` destination. It parses accepted values against a fixed internal origin, requires that exact origin, and returns only the normalized internal pathname, query, and fragment. This closes the tab-character normalization path that could otherwise turn a relative-looking destination into an external redirect after a valid magic-link, invite, or recovery flow.

**Validation:** `npm run test:auth-confirm` (30), including a completed valid magic-link flow containing the reproduced tab payload; `npx tsc --noEmit --incremental false`; ESLint; and diff checks all passed.

**Production rollout:** Vercel deployment `13qMk1swTYk1zipwj4x1ujsH79EL` for commit `4e7fb74` was Ready, its isolated login page loaded, and it was manually promoted to both production domains on 2026-09-14. The live primary domain loaded the expected login page after promotion.

**Related files:**

* `lib/auth/email-otp.ts`
* `lib/auth/auth-confirm.test.ts`

---

## Security verification — Phase 2 development regression pass (2026-09-14)

**Status:** Complete for the targeted remediation boundaries. No application behavior or production database state changed in this verification pass.

Development-only runtime validators confirmed the trusted publication and lifecycle boundary (F2/F8), account-state enforcement (F3/F4), finalized-document and published-template immutability (F5), packet-reference isolation (F7), mandatory audit evidence (F9), and brokerage organization isolation (F10). Auth-confirmation regression tests confirmed F11. Each remote validator targets only `harbaugh-forms-dev` and removes its disposable records.

The account-state validator now verifies that an active account has its intended access, while forced-password and disabled sessions cannot read or alter their own packet. It also verifies that an inactive organization loses its membership authorization predicate.

**Validation:** `npm run validate:secure-publish-dev`; `npm run validate:account-state-dev`; `npm run validate:final-document-immutability-dev`; `npm run validate:packet-reference-ownership-dev`; `npm run validate:audit-logging-atomic-dev`; `npm run validate:brokerage-settings-organization-dev`; `npm run test:auth-confirm` (30); `npm run test:auth-bootstrap` (7); `npm run test:admin-invite` (37); `npm run test:admin-orgs` (4); `npm run test:admin-audit` (20); `npx tsc --noEmit --incremental false`; and ESLint all passed.

**Next verification:** Run a safe authenticated DAST pass against development with ordinary, disabled, inactive-organization, administrator, and Global Admin sessions after Native Signing implementation begins and before its production rollout (see private `security.md` R11). Until then, every Signatures implementation stage must re-run the applicable F1–F11 regression matrix and add tests for any new Signing security boundary it introduces.

**Related files:**

* `scripts/validate-account-state-dev.ts`
