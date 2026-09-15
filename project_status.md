# Harbaugh Forms — Project Status

**As of:** 2026-09-15 (Native Signing Stages 1–3 merged to `main`; Stage 3 DB remains development-only; production Signing schema still absent)

## Current State

Harbaugh Forms is **live** for controlled **Lee-only** production use on `https://forms.harbaughrealestate.com`.

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

* Current Stage 3 stores a live `source_packet_form_id` on `signing_documents` and, at internal promotion time, renders prepared PDF bytes from the **current** working `packet_form`.
* That is **not** yet a sufficient reproducible Signing-owned Draft source snapshot (an `update_date`/fingerprint alone would also be insufficient without reproducible source state).
* Stage 4 must implement the hybrid Draft-source-snapshot model—and Source Changed / Keep Current / Update to Latest semantics—**before** exposing activation. Do not begin Stage 4 until explicitly prompted.

**Immutable activation-snapshot machinery (internal only):**

* Exact prepared PDF bytes + SHA-256 fingerprint + private `signing-artifacts` objects.
* Same-logical-document version reuse; no cross-document hash dedupe.
* Integrity verification preserves expected hash and fails closed for promotion/reuse.
* Complete package revision freeze (documents/versions, participants, evidence `signing_fields`, pointer advance).

**Explicitly still unavailable (Stage 4+), dependency order:** (1) reproducible Draft document source snapshots; (2) source-change detection; (3) Keep Current / Update to Latest; (4) Signing dashboard readiness/preflight; (5) participant access-state preparation/activation boundary; (6) common activation algorithm for Send / Begin In-Person; (7) Package Revision 1 promotion; (8) Draft → In Progress; (9) then remote delivery **or** in-person ceremony launch. Also later: `/sign`; ceremony UI; email/reminders beyond activation boundary; integrity admin UI; protected-key event chain; production enablement.

**Recommended next:** Await an explicit Stage 4 design/implementation prompt. Stage 4 must implement reproducible Draft source snapshots (and drift/Keep-Current semantics) **before** exposing activation. Do not begin Stage 4.

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

1. **Native Signatures Stage 4 (awaiting explicit approval):** Do not begin until an explicit Stage 4 prompt. Stage 4 must **not** begin directly with Send while the source-snapshot gap remains. Dependency order: (1) reproducible Draft document source snapshots (Stage 3 only stores live `source_packet_form_id` and renders the current `packet_form` at promotion—insufficient); (2) source-drift detection; (3) explicit Keep Current / Update to Latest; (4) Signing dashboard readiness/preflight; (5) participant access-state preparation/activation boundary; (6) common activation algorithm for Send and Begin In-Person; (7) promote canonical Revision 1; (8) Draft → In Progress only after Revision 1 + required access state; (9) then branch to remote delivery **or** in-person ceremony launch (email failure must not undo activation evidence). Future activation should call Stage 3’s internal promotion primitive once Draft snapshots are reproducible. Preserve F1–F11 + R12 Stage 1–3 tests. Still no production enablement.
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

Two **major** planned feature areas. They are related through the packet/document model, but they are **distinct product efforts**. Native Signing architecture is recorded in `decisions.md`; Stages 1–3 are merged to `main` (Stage 3 DB development-only). Stage 4 (dashboard, Draft source snapshots, activation) has **not** started. Imported-document markup remains separate.

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
- Occasional Next.js hydration warning around `AdminSectionNav` / packet page
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
- Native e-signature architecture decisions are in `decisions.md`. Stage 1 foundation schema + private `signing-artifacts` bucket exist in development only behind `NATIVE_SIGNING_ENABLED` (default off); ceremony/credentials/delivery not started
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
