# Harbaugh Forms — Architectural Decisions

## Decision Format

Each decision should include:

- Date
- Decision
- Reason
- Consequences
- Related files or migrations

---

## Packet assigned property is independent of property-entry UI mode

**Date:** 2026-08-18

**Decision:**
The packet's assigned property is independent from the property-entry UI mode. Toggling between "Select existing property" and "Create new property" must not clear or replace the currently assigned property. Property assignment changes only when the user explicitly selects or commits a replacement property, or uses an explicit removal action.

The search/create UI mode is a temporary entry surface. An already-assigned `property_id` stays in state while the user inspects the create-new form or returns to search. Typing into the new-property form is draft-only until the existing commit point: **Save and select property**, selecting a different existing search result, or (for optional/custom New Packet only) saving a filled new-property draft with the parent create form. Required listing/contract packets still commit a new property only through **Save and select property**.

**Reason:**
Edit Packet treated entry-mode as assignment. Switching to **Create new property** immediately set `property_id` to null and cleared the selected-property display, so switching back looked like the packet no longer had a property. Users were exploring how to replace a property, not requesting that it be removed.

**Consequences:**

* New Packet and Edit Packet stay consistent because they share `PropertyPicker`.
* A packet with an assigned property still shows that property after Create new → Select existing with no commit.
* A new packet with no property yet still stays empty when toggling modes.
* Selecting another existing property, or successfully saving/selecting a new one, still replaces the assignment.
* There is no separate “remove property” control in this UI; assignment is cleared only by an explicit replacement/commit path, not by changing modes.

**Related files or migrations:**

* `components/properties/property-picker.tsx`
* `components/packets/create-custom-packet-form.tsx`
* `components/packets/create-packet-from-collection-form.tsx`
* `components/packets/packet-edit-form.tsx`
* `lib/ui/form-controls.test.ts`
* No SQL migration

---

## Packet property selection does not list all properties for a blank existing-property search

**Date:** 2026-08-18

**Decision:**
Packet property selection should not display the full list of available properties when the existing-property search field is blank. Search results should appear only in response to user-entered search text, while an already-selected property remains visible independently of the search query.

Whitespace-only input is treated as no search (trimmed empty string). The search textbox itself remains available. Create-new-property and other existing property-selection choices are unchanged. This is a UI/state condition on the shared picker, not a new search architecture.

**Reason:**
Showing every active property as soon as **Select existing property** is chosen made the New Packet and Edit Packet screens noisy and encouraged browsing instead of searching. The selected property already has its own display; listing unrelated properties under a blank search was unnecessary and risked looking like the current selection had been replaced.

**Consequences:**

* New Packet and Edit Packet stay consistent because they share `PropertyPicker`.
* Users must type a search term to see matches; they do not get an unfiltered catalog under the box.
* Edit Packet continues to show the already-linked property without requiring a new search.
* Clearing the search after a selection does not clear or replace that selection.
* Unfiltered property data is no longer fetched solely to populate that blank-search list.

**Related files or migrations:**

* `components/properties/property-picker.tsx`
* `components/packets/create-custom-packet-form.tsx`
* `components/packets/create-packet-from-collection-form.tsx`
* `components/packets/packet-edit-form.tsx`
* `lib/ui/form-controls.test.ts`
* No SQL migration

---

## TXR-1957 / T-47.1 Draft catalog uses existing sources only

**Date:** 2026-08-17

**Decision:**
T-47.1 (TXR-1957, production Global form **53**, ACTIVE + DRAFT) received catalog fields and PDF placements through the existing `fields` / `form_field_mappings` / `field_defaults` architecture. No new table, no schema migration, and no development form clone. The form already existed as a production Draft shell (`global/forms/53/T-47-not-affidavit.pdf`, 0 AcroForm fields). Declarant **Signed** lines were not mapped (Authentisign / packet-annotation exclusion).

Source mapping:

* Reuse `property_legal_description` and `property_county` for the property-description and county blanks (legal description is not the street address).
* Reuse `seller_name_1` / `seller_name_2` for page-2 “My name is” blanks.
* Map declarant DOB to existing `packet_contact` paths `seller_1.date_of_birth` / `seller_2.date_of_birth` (contacts already store DOB in UI/schema). Do not add a new DOB column.
* Leave page-1 combined **Declarant** `manual_only` — the removed `seller_names` resolver is not revived, and `seller_name_1` would underfill two-owner packets.
* Leave both declarant **address** blanks `manual_only` — live `seller_N.address` is street lines only, not a full mailing address with city/state/ZIP.
* Leave GF number, declaration date, survey date, execution county, and execution day/month/year `manual_only`. Do not resurrect `contract_details` for survey date. Do not invent a combined execution-date hidden field.

Lee Personal form-specific defaults only: exceptions `None`; both execution states `Texas`. No Organization or Global defaults.

**Reason:**
Automatic fill is used only where a live source’s meaning matches the blank. A manual field is preferable to reviving abandoned resolvers or mapping street-only contact address into a declaration address.

**Consequences:**

* Map Fields review remains required before Publish (`/forms/53/editor`).
* Development does not receive a parallel TXR-1957 shell unless Lee later authorizes a mirror.
* Future two-owner name aggregates should use a reusable resolver (as `buyer_names` / `tenant_names` do), not a form-specific hack.

**Related files or migrations:**

* `lib/txr-1957-inventory.ts`
* `lib/txr-1957-manifest.test.ts`
* `scripts/txr1957-apply-production.ts`
* `TXR_1957_FIELD_IMPLEMENTATION.md`
* No SQL migration

---

## Native e-signature is a planned in-app packet workflow

**Date:** 2026-08-16

**Decision:**
Harbaugh Forms will eventually provide a **native e-signature workflow** so users can prepare packet documents for signature inside the product. Signature preparation should assign signature and initial locations to specific parties/signers. The same workflow should apply to documents generated from Harbaugh Forms templates/collections **and** to one-off PDFs imported into a packet. Design must distinguish a **placed** signature/initial annotation (already completed on the document) from a **signer field** (a location where a named signer still needs to sign or initial). Signature locations belong on the packet/document (annotation) model, not on the reusable form-field catalog. Future implementation should treat auditability as a requirement: signer identity, document version, timestamps, completed-signature state, and a reliable record of what was signed.

This decision does **not** select an external e-signature vendor, cryptographic architecture, signing-ceremony UX, or database enum set. Prior documentation treated **Authentisign** as the expected handler for signature/initial lines (catalog extraction skips those fields; deferred “Authentisign integration” was listed as the path that might set packet-form `document_state = SIGNED`). That research and the current inventory-exclusion policy remain valid as historical/operational context. They are **not** a committed vendor or architecture for this product capability.

**Reason:**
Agents need to collect signatures and initials on both generated forms and received third-party PDFs without routing every location through Map Fields / the Global field catalog. Typed Fill Form signatures already exist as packet-form annotations and are explicitly not Authentisign placeholders; a full signing workflow is still missing (`SIGNED` exists on packet forms but the UI does not enter it). Committing a vendor now would over-constrain a feature that is not being implemented in this pass.

**Consequences:**

* Treat native e-signature as a **major** future product area, related to but distinct from imported-document markup tools.
* Do not implement signature locations as reusable `fields` / `field_instances` solely so they can be signed.
* Preserve Authentisign-exclusion behavior for standard form inventory/extraction until a signing design replaces or supplements it.
* Packet-form lifecycle `SIGNED` / `VOID` remain unused by UI until a real signing workflow exists; do not invent a parallel document-state model in documentation.
* Vendor choice, certificate/crypto design, remote signer authentication, and exact annotation-type names remain open.

**Related files or migrations:**

* `project_status.md` (Future Product Roadmap)
* `lib/types/authentisign-excluded-fields.ts`
* `lib/types/packet-form-lifecycle.ts`
* `lib/packet-form-annotations.ts`
* `supabase/migrations/20260805220000_fill_form_presentation_and_annotations.sql`

---

## One-off packet PDFs and document annotations are not reusable form-catalog fields

**Date:** 2026-08-16

**Decision:**
A packet should eventually contain both (1) reusable/template-based documents generated from Harbaugh Forms forms/collections and (2) one-off externally supplied PDFs imported **directly into that packet**. Importing a received PDF must not require creating a reusable Form record, adding it to the global/private form library, mapping fields, publishing it, or adding it to a Collection.

Fill Form should eventually offer fast, **packet-document-specific** annotation tools, with first-iteration intent including Add Text, Strikethrough, Initial field/box, and Signature field/box. Later tools (checkmark, X, underline, highlight) are optional and not first-iteration requirements.

These quick annotations are **not** reusable Harbaugh Forms fields. They must not be matched to catalog keys (for example `SELLER_NAME`), must not create catalog rows, and must not participate in form-field defaults, source mapping, or global/private field management. They are stored as document-specific annotations (page, position, size, content). A strikethrough is graphical only.

Preferred implementation direction: **extend the existing `packet_form_annotations` architecture** (positioning/sizing, PDF embedding, soft deletion, creator attribution) where it fits, rather than forcing markup into `fields` / `field_instances` or creating an unnecessary parallel concept.

Possible future annotation concepts include typed signature, typed initial, free text, strikethrough, signer initial field, and signer signature field. Those names are product concepts, **not** finalized database enum values. Production today remains allowlisted to `typed_signature` and `date_signed` only. A placed annotation (already-drawn initials/signature/text) is conceptually different from an uncompleted signer field assigned to a party.

**Reason:**
Real transactions include PDFs the agent did not generate (for example a buyer’s offer on the agent’s listing). The agent may need to import that PDF into the existing listing packet, strike an incorrect seller name, type the correction, and place initial boxes for each party—without promoting the offer into the reusable form library. Typed-signature work already proved packet-form annotations can persist independently of the field catalog.

**Consequences:**

* Custom-packet `origin = external_upload` remains the existing attach path; the product intent is broader: import into **any** packet, including collection-backed listing packets, without a Form/Collection prerequisite.
* Do not use Map Fields, scoped defaults, or source resolvers for one-off markup.
* Do not treat first-iteration markup tools as implemented; current Fill Form annotation tools remain Signature and Date Signed.
* E-signature signer fields should share this packet-document annotation direction where appropriate, but imported-document markup is a **distinct** feature area, not a subset of e-signature.
* Exact schema for imported-document origin, annotation type enums, and signer-assignment columns is **not** decided here.

**Related files or migrations:**

* `project_status.md` (Future Product Roadmap)
* `lib/packet-form-annotations.ts`
* `lib/types/packet-form-annotation.ts`
* `lib/packet-form-annotation-placement.ts`
* `components/packets/packet-form-annotation-overlay.tsx`
* `supabase/migrations/20260805220000_fill_form_presentation_and_annotations.sql`
* `supabase/migrations/20260725040000_packets_custom_nullable_collection.sql` (existing custom-packet / `external_upload` attach path)

---

## Fill Form text layout, placement masks, and typed signature annotations

**Date:** 2026-08-05 (Caveat/multiline/mask download corrections + Date Signed 2026-08-06; **production rollout 2026-08-06**)

**Decision:**
Fill Form preview and generated PDFs share one text-layout policy (`lib/pdf-text-layout.ts`). Multiline behavior is an explicit template placement flag (`form_field_mappings.is_multiline`), not inferred from the current value. Preprinted writing lines may be covered with an opaque white rectangle via placement flag `mask_background` (default false; admin-only in Map Fields; does not alter the source PDF file). Typed “Fill & Sign”–style signatures and **Date Signed** stamps are stored as packet-form annotations (`packet_form_annotations`), not as `fields` / `field_instances` and not as Authentisign placeholders. Annotation types today: `typed_signature` (Caveat) and `date_signed` (Helvetica). Preview font size scales with PDF zoom using `renderedHeight / originalHeight` applied to the configured (or height-derived) point size, with documented min/max clamps. Annotation `created_by_user_id` is assigned authoritatively by a BEFORE INSERT/UPDATE trigger from `auth.uid()` / OLD and is immutable after insert; authorization remains `owns_packet` / `is_app_admin` (not creator-only). Custom Caveat embedding in pdf-lib requires registering `@pdf-lib/fontkit`, saving with `useObjectStreams: false`, and embedding Caveat as `{ subset: true, customName: "HarbaughCaveat" }` so it does not corrupt when Helvetica is also embedded in the same document. Typed signatures and dates are each drawn as one intact `drawText` string.

**Production rollout (2026-08-06):**
* PR #31 squash-merged to `main` as `d93cc5936f511c561f7538a5d035126ed2976cc9`.
* Unique Vercel deployment `https://harbaugh-forms-8m60uqcrp-lee-harbaugh-s-projects.vercel.app` (`dpl_EcDG5xuCGTA9VrmKDVWF2irn1Qtb`) validated before domain promotion.
* Production migrations applied in order on `harbaugh-forms-prod` (`eetonalyyyssvkyfdoxh`): `20260805220000` → `20260805230000` → `20260806150000`.
* Production mapping `f7f8e678-43f3-4f9a-9cb2-f1c9bb6b9f05` (form 15 Non-Real Estate Items) set to `is_multiline=true` + `mask_background=true` only; coordinates unchanged.
* Custom domain kept on rollback `6ef2453` / `87xmn84pt` until unique-URL + schema validation passed, then manually aliased to the new deployment (~2026-08-06 23:50 UTC).
* **Manual production-domain promotion remains required** for future releases; automatic custom-domain assignment stays disabled. Unique `*.vercel.app` URLs may require Deployment Protection bypass for automated smoke. **2026-08-18 observation:** Production deploy `dpl_85mK8L8SEkLungQ84anWhSK8FoVx` (`c208ad3`) received `forms.harbaughrealestate.com` and `harbaugh-forms.vercel.app` automatically when it became Ready. Re-check the Vercel project domain auto-assign setting before the next production push.
* Integrity fingerprints for existing field instances unchanged; temporary smoke annotations soft-deleted; smoke storage objects removed.
* **2026-08-06 follow-up:** A read-only production audit produced a **164-row** manual review workbook (`audits/prod-multiline-mask-2026-08-06/multiline-mask-manual-review.xlsx`). Lee must enter `1` in the Lee approval columns to authorize later flag updates; blank means no change. Dimension-review approval does not authorize automatic geometry changes.
* **2026-08-07 apply:** Lee completed the workbook (authoritative). **80** rows had ≥1 approval (`1`): **60** original-audit + **20** Lee-added; all resolved to exact ACTIVE mappings; **0** unresolved; **0** conflicts. Production updated **79** unique mappings to `is_multiline=true` + `mask_background=true` only (geometry unchanged). **1** approved mapping (`f7f8e678-…`) was already correct. Dimension Review backlog: **80** rows — no geometry applied (no explicit Lee Notes dimensions). Dev mirror: **26** by ID; **53** exceptions. Applied trail: `multiline-mask-manual-review-APPLIED.xlsx`. No app deploy; no migrations.

**Date Signed specifics:**
* Toolbar tool beside Signature; dialog defaults to the user’s local calendar date and format `MM/DD/YYYY`; also supports `M/D/YYYY` and `Month D, YYYY`.
* `text_value` stores the formatted display string chosen at placement (stable calendar text, not a timezone timestamp). Once placed, the value does not auto-update to “today.”
* `font_id` = `helvetica`; PDF/preview use standard Helvetica (no custom font embed).
* Placement is independent of signatures (no auto-pairing). Shared overlay/PDF primitives leave room for future annotation kinds without duplicating drag/resize/zoom.
* **Authoritative supported annotation types:** `typed_signature` | `date_signed` only. Validator/placement factory use an explicit allowlist (`isPacketFormAnnotationType`); unknown types still return `Unsupported annotation type.`
* **Browser click path:** Fill Form PDF click → `buildAnnotationInputFromPlacementClick` (`lib/packet-form-annotation-placement.ts`) → `createPacketFormAnnotation`. Date defaults use Helvetica sizing; signature defaults use Caveat sizing. Regression coverage: `lib/packet-form-annotation-placement.test.ts` (not DB-only inserts).
* **2026-08-06 placement bug:** Dialog/banner recognized `date_signed`, but the click/create path hit `validatePacketFormAnnotationInput` in `lib/types/packet-form-annotation.ts`. Fixed by routing clicks through the shared factory, hardening the allowlist to explicit equality, and building create payloads without spread that can drop `annotation_type`.

**Authoritative browser Download PDF path:**
Packets Fill Form → `downloadFilledPacketFormPdf` → `getFilledPacketFormPdfBytes` → load template bytes + Caveat font bytes + ACTIVE annotations → `fillPacketFormPdfBytes` (Helvetica field overlays + Caveat signatures + Helvetica dates) → browser download.

**Reason:**
Single-line `drawText` / CSS `truncate` clipped narrative blanks. Fixed `10px` overlay text stayed tiny at high zoom while boxes scaled. Preprinted form lines need an optional non-destructive cover. Occasional agent signatures and signed dates must not require Global field catalog rows or Authentisign. Client-supplied creator UUIDs must not be trusted. Applied development migrations are immutable, so creator hardening and `date_signed` are forward-only follow-up migrations. Post–PR #30 QA: (1) narrative blanks still marked single-line overflow horizontally; (2) default-name Caveat embed beside Helvetica corrupted advances; (3) wrapped Non-Real Estate Items showed preprinted lines because `mask_background` remained false.

**Consequences:**

* Admins enable multiline and/or mask per placement; existing mappings default off. Narrative blanks over writing lines (e.g. Residential Lease Listing Non-Real Estate Items `f7f8e678-…`) must have **`is_multiline=true` and `mask_background=true`** in Map Fields.
* Overlay and download must stay aligned for wrap, mask order (mask then text; empty values still mask), and font sizing.
* Typed signatures and date signed: create/move/resize/soft-delete on DRAFT packet forms the user owns; included in generated PDFs; packet-form-specific; independently placed.
* Creator attribution: DB trigger overwrites INSERT `created_by_user_id` with `auth.uid()`; UPDATE always restores OLD.
* Preferred production order (executed 2026-08-06): migrate (`20260805220000` → `20260805230000` → **`20260806150000`**) → validate → deploy app / unique-URL smoke → apply Map Fields flags on form 15 Non-Real Estate Items as configuration data → **manually** promote custom domain.
* Static Caveat/OFL files under `public/fonts/` must bypass the auth proxy matcher; filled PDF saves use `useObjectStreams: false`; Caveat keep `customName: "HarbaughCaveat"`.
* **Deferred in this tranche (PR #31):** general free text, strikethrough, highlight, drawing, uploaded images, checkmarks, initials, reusable saved presets, automatic signature/date pairing. Those remain unimplemented. Product direction as of 2026-08-16: extend `packet_form_annotations` for document-specific markup and future signer fields (see decisions above); do not route those tools through the reusable field catalog. First-iteration markup intent is Add Text, Strikethrough, Initial field/box, and Signature field/box. Checkmark/X/underline/highlight, drawn/uploaded signatures, and saved presets remain later/optional.

**Related files or migrations:**

* `supabase/migrations/20260805220000_fill_form_presentation_and_annotations.sql`
* `supabase/migrations/20260805230000_packet_form_annotations_created_by_immutable.sql`
* `supabase/migrations/20260806150000_packet_form_annotations_date_signed.sql`
* `lib/pdf-text-layout.ts`
* `lib/date-signed-annotation.ts`
* `lib/packet-form-annotation-placement.ts`
* `lib/fill-packet-form-pdf.ts`
* `lib/packet-form-download.ts`
* `lib/packet-form-annotations.ts`
* `components/packets/packet-form-field-overlay.tsx`
* `components/packets/packet-form-annotation-overlay.tsx`
* `public/fonts/Caveat-Regular.ttf` + `public/fonts/OFL.txt`
* `lib/signature-font.ts` / `lib/signature-font-server.ts`
* `proxy.ts`
* `scripts/validate-packet-form-annotation-auth-dev.ts`
* `scripts/smoke-fill-form-presentation-dev.ts`
* `scripts/test-fill-form-pdf-download-regressions.ts`
* `scripts/manual-qa-fill-form-53-download.ts`
* `scripts/manual-qa-date-signed-53.ts`
* `scripts/qa-date-signed-placement-path-53.ts`
* `scripts/qa-date-signed-browser-53.ts`

---

## Packet multi-contact name aggregates use reusable custom resolvers

**Date:** 2026-08-05

**Decision:**
When a PDF blank must show **all** packet contacts for a role family (for example Tenant Name(s)), use a reusable `custom_resolver` keyed like existing aggregates (`buyer_names`, and now `tenant_names`) rather than a form-specific source or a single numbered path such as `tenant_1.full_name`. Join display names with the same comma-separated convention as `buyer_names` (`formatJoinedContactNames`). Tenant selection uses the same role set as numbered `tenant_N.*` paths (TENANT, CO_CLIENT, SPOUSE, PRIMARY, OTHER), excludes inactive relationships/contacts, omits blank names, and dedupes by contact id. Resolved values remain editable at the packet field-instance level under existing override/refresh rules.

**Reason:**
Lease and notice forms need all tenant names in one blank. `tenant_1.full_name` underfills multi-tenant packets, and form-scoped duplicates would fragment the source registry.

**Consequences:**

* New multi-contact name blanks should prefer `buyer_names` / `tenant_names` (or a future role-parallel key) over inventing per-form resolvers.
* Natural “X and Y” Oxford-comma joining remains reserved for specialized composites such as `buyer_rep_agreement_between`, not ordinary name aggregates.

**Related files or migrations:**

* `lib/types/packet-contact.ts` (`getOrderedTenantContacts`)
* `lib/field-resolver.ts` (`tenant_names`)
* `lib/types/field-source.ts` (`CUSTOM_RESOLVER_KEYS`)
* `supabase/migrations/20260805210000_packet_tenant_names_resolver.sql`

---

## Test-user hard deletion (email reuse) with classified dependencies

**Date:** 2026-07-30

**Decision:**
Disposable accounts marked `profiles.is_test_user = true` may be permanently removed by Global Admins through a trusted service-role workflow that hard-deletes Auth with `deleteUser(userId, false)` (not Auth soft-delete) so the email can be reused. Before confirmation, the server builds a dependency summary and classifies rows as safe to delete, blocking (must reassign), historical retain, or skipped. Private owner-scoped business data and `users/{uid}/**` storage are deleted in FK-safe order. GLOBAL/ORGANIZATION library ownership blocks deletion. Audit events and form lifecycle history are retained; publisher/actor FKs are nulled and a `deleted_user_snapshots` row preserves identity. Self-deletion and deletion of the final active Global Admin are rejected. Streamlined deletion is refused for non-test users.

**Reason:**
Ordinary deactivate/ban leaves Auth identity and blocks email reuse for disposable test accounts. Cascading Auth delete alone would leave storage orphans, fail on RESTRICT profile FKs, or silently orphan shared library ownership.

**Consequences:**

* Only Global Admins can invoke preview/delete; UI hiding is insufficient.
* Partial failures return step-level results and mandatory audit (`test_user_deletion_failed` / `test_user_permanently_deleted`).
* Legitimate shared business records are never silently destroyed.

**Related files or migrations:**

* `supabase/migrations/20260730120000_admin_test_user_manual_create.sql`
* `lib/admin/delete-test-user.ts`
* `lib/admin/test-user-deletion-policy.ts`
* `app/admin/actions.ts`

---

## Test-user agent settings are private, retry-safe cleanup dependencies

**Date:** 2026-07-30

**Decision:**

`public.user_agent_settings` is user-owned configuration for deletion-policy purposes. Its physical primary/ownership key is `user_id` (there is no generic `id` column), and `user_id` references `auth.users(id) ON DELETE CASCADE`. Test-user dependency summaries and cleanup must map the domain key `agent_settings`, physical table/column, cleanup step, and human label explicitly. Cleanup deletes this row before profile/Auth deletion; zero rows is a successful idempotent retry.

Auth hard deletion must not be attempted until every application identity-cleanup operation succeeds. Deletion failures returned to the browser are structured and sanitized: dependency label, stage, safe explanation, optional database code, retry guidance, completed-step status, and a non-sensitive server-log reference. Empty or raw database messages must never become the user-facing error.

**Reason:**

The first production smoke test selected a nonexistent `id` column while counting `user_agent_settings`. Supabase returned an error with an empty message, producing the incomplete UI text `user_agent_settings: ` before cleanup began. Explicit schema mapping prevents this class of alias/primary-key error; retry-safe sequencing and structured failures prevent unsafe Auth deletion and unusable diagnostics.

**Consequences:**

* Agent settings are safe to hard-delete only as private configuration for a disposable test user; shared GLOBAL/ORGANIZATION business ownership remains blocking.
* Missing agent settings, memberships, preferences, or profile rows do not make a retry fail.
* Raw database details, stack traces, credentials, and record contents stay server-side.
* `deleteUser(userId, false)` remains last, after application cleanup.

**Related files:**

* `lib/admin/test-user-deletion-policy.ts`
* `lib/admin/test-user-identity-cleanup.ts`
* `lib/admin/test-user-deletion-failure.ts`
* `lib/admin/delete-test-user.ts`
* `components/admin/admin-manual-user-controls.tsx`

---

## Manually confirmed accounts without invitation email

**Date:** 2026-07-30

**Decision:**
Global Admins may create users without sending email via `auth.admin.createUser({ email, password, email_confirm: true, user_metadata })`, then provision profile, organization membership, and agent settings using the same conventions as invites. Invitation email flow remains the preferred default and is unchanged. Manual creation UI must warn that email ownership verification is bypassed. Partial failures compensate by deleting orphan Auth/application rows.

**Reason:**
Operators need confirmed test or bootstrap accounts when invitation delivery is unavailable, without opening public signup.

**Consequences:**

* Manual accounts start `onboarding_status = ACTIVE` (when account status is ACTIVE) with `must_change_password = true`.
* Duplicate email checks remain server-side.
* Compensation cleanup must not leave unexplained Auth orphans.

**Related files:**

* `lib/admin/create-manual-user.ts`
* `lib/admin/manual-create-validation.ts`
* `components/admin/admin-manual-user-controls.tsx`

---

## One-time temporary passwords; never persist or audit them

**Date:** 2026-07-30

**Decision:**
Temporary passwords for manually created users are generated or entered by the Global Admin, returned once in the successful server-action response for immediate display, and must never be written to audit metadata, database columns, URLs, browser persistence beyond the one-time UI display, logs, or error-reporting payloads. Audit sanitizer continues to redact password-named keys.

**Reason:**
Storing temporary credentials would expand blast radius and conflict with forced password change.

**Consequences:**

* UI shows an explicit “shown once / cannot be retrieved later” warning.
* Audit events record only flags such as `mustChangePassword: true`, never the secret.

**Related files:**

* `lib/admin/generate-temporary-password.ts`
* `lib/audit/sanitize.ts`
* `lib/admin/create-manual-user.ts`

---

## Forced password change after manual creation

**Date:** 2026-07-30

**Decision:**
`profiles.must_change_password` gates application access. Manually created users start with the flag true. After login (and via proxy for authenticated non-auth routes), users are redirected to `/auth/change-password` until they successfully update their password; the flag is then cleared. Users may clear only their own flag from true→false; only admins/service-role may set it true.

**Reason:**
Administrators who set temporary passwords must not remain able to use that credential indefinitely after handoff.

**Consequences:**

* `/auth/*` remains reachable while forced.
* Invite/recovery `/auth/update-password` continues to clear the flag after a successful Auth password update when present.

**Related files:**

* `lib/supabase/proxy.ts`
* `app/auth/change-password/page.tsx`
* `app/auth/actions.ts`

---

## Global Admin safeguards for test-user marking and deletion

**Date:** 2026-07-30

**Decision:**
The currently authenticated Global Admin cannot mark themselves as a test user for streamlined deletion, cannot self-hard-delete, and cannot mark or delete the final remaining active Global Admin through this flow. Existing last-admin protections for deactivate/demote remain in force.

**Reason:**
Prevent lockout and accidental destruction of the sole administrator identity.

**Consequences:**

* Server actions enforce these checks independently of UI.
* Marking additional admins as test users remains allowed only when another active admin exists.

**Related files:**

* `app/admin/actions.ts` (`setUserTestFlagAction`, `permanentlyDeleteTestUserAction`)
* `lib/admin/invite-validation.ts` (`wouldRemoveFinalActiveAdmin`)

---

## Production target enforcement respects the server/browser boundary

**Date:** 2026-07-29

**Decision:**
Production Supabase target enforcement uses the documented Vercel server/build runtime contract (`VERCEL_ENV=production`) only on server and build paths. Browser code must not require `VERCEL_ENV` or another server-only variable to use the public Supabase URL that was compiled into and served by an already validated deployment. Browser-runtime behavior and server/build-runtime behavior require separate regression coverage.

**Reason:**
The initial guard was imported by the browser Supabase client. `NEXT_PUBLIC_SUPABASE_URL` was available there, but `VERCEL_ENV` was not, so the real Production browser deterministically threw after successful login and prevented every authenticated page from loading.

**Consequences:**

* Local and Preview server/build processes still reject the production project unless explicitly authorized.
* Real Vercel Production server/build processes continue to require `VERCEL_ENV=production`.
* Browser client creation allows the deployment-provided public Supabase URL without reading server-only environment state.
* `test:supabase-guard` and `test:auth-bootstrap` cover both runtime contexts.

**Related files:**

* `lib/supabase/project-guard.ts`
* `lib/supabase/project-guard.test.ts`
* `lib/auth/authenticated-bootstrap.test.ts`
* `lib/supabase/env.ts`
* `lib/supabase/client.ts`

---

## Production ops credentials stay outside Next.js auto-load

**Date:** 2026-07-29

**Decision:**
Production operational credentials live in gitignored `.env.ops.production` and are loaded only by explicitly named production-ops npm scripts (`--env-file=.env.ops.production`). They must not use `.env.production.local`, because Next.js automatically loads that filename during `next build` / production-mode local runs. Application clients (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`) continue to come from `.env.local` (development) or Vercel environment scopes. A runtime/build guard rejects using production project `eetonalyyyssvkyfdoxh` for the application outside real Vercel Production (unless `HARBAUGH_ALLOW_PRODUCTION_APP=1`). Feature-branch validation uses `npm run build:validate`, which refuses a present `.env.production.local` and requires the development project ref.

**Reason:**
A prior feature validation `npm run build` reported Next loading `.env.production.local`. Even when current ops variables were TARGET_*/SOURCE_* (not app keys), auto-loading production ops files during ordinary builds is an unacceptable silent-mix risk.

**Consequences:**

* Local `npm run dev` and `npm run build:validate` use development only.
* Vercel Preview keeps Preview-scoped vars (development Supabase); Vercel Production keeps Production-scoped vars.
* Production migrations/import/export/sync scripts remain opt-in and require `.env.ops.production`.
* Recreating `.env.production.local` fails `build:validate` until removed/renamed.

**Related files:**

* `.gitignore` (`.env.ops.production`)
* `scripts/assert-safe-local-build-env.ts`
* `lib/supabase/project-guard.ts`
* `lib/supabase/env.ts`
* `lib/supabase/admin.ts`
* `package.json` (`build:validate`, production-ops scripts)

---

## Organizations remain the brokerage administration workflow

**Date:** 2026-07-29

**Decision:**
Existing `Admin → Organizations` remains the authoritative workflow for creating and maintaining multiple brokerages. A separate Brokerage/Offices administration feature was reviewed in Preview and intentionally abandoned. Brokerage offices are not modeled at this time. `organizations` continues to represent brokerage tenants (`organization_type = 'BROKERAGE'` when applicable). Legacy `brokerage_settings` remains the form-resolution singleton for compatibility and is not collapsed into organizations.

**Reason:**
Lee determined Organizations is sufficient for multi-brokerage administration. Office branching added complexity without enough product value for the initial release.

**Consequences:**

* `/admin/brokerages`, office CRUD, membership office assignment, and office-specific invite selectors were removed.
* Cleanup migration `20260730010000_remove_brokerage_offices_and_trec.sql` drops development-only office schema while retaining audit tables.
* Original combined migration `20260729210000_brokerage_offices_trec_audit.sql` remains immutable in history; both migrations together yield the audit-only final schema if ever applied elsewhere.

**Related files or migrations:**

* `supabase/migrations/20260729210000_brokerage_offices_trec_audit.sql`
* `supabase/migrations/20260730010000_remove_brokerage_offices_and_trec.sql`
* `lib/admin/manage-organizations.ts`
* `lib/types/brokerage-settings.ts`

---

## Manual license numbers; TREC automatic lookup abandoned

**Date:** 2026-07-29

**Decision:**
TREC automatic license lookup and autofill were reviewed in Preview and intentionally abandoned. Agent and broker license numbers continue to be entered manually through existing profile/invite/organization fields (`trec_license_number`, `broker_license_number`, etc.). No TREC Open Data integration, candidate UI, verification metadata columns, or TREC environment variables are part of the application.

**Reason:**
Automatic lookup is not necessary for the initial product and did not provide enough reliability or simplicity.

**Consequences:**

* `lib/trec/*`, `POST /api/admin/trec-lookup`, TREC invite UI, and TREC verification columns are removed.
* `TREC_SODA_APP_TOKEN` / `TEXAS_OPEN_DATA_APP_TOKEN` are not required and should not be documented as active configuration.
* Invitation returns to the prior simple manual license-number workflow (plus retained audit events).

**Related files:**

* `lib/admin/invite-validation.ts`
* `components/admin/admin-users-page.tsx`
* `supabase/migrations/20260730010000_remove_brokerage_offices_and_trec.sql`

---

## Configurable ordinary audit logging with mandatory security events

**Date:** 2026-07-29

**Decision:**
Basic audit logging is retained. Ordinary business audit logging is globally configurable by Global Admins (`audit_settings.ordinary_logging_enabled`). Audit-configuration enable/disable events are always recorded even when ordinary logging is disabled. Global Admin role grants/removals and related mandatory security actions remain recorded. Audit events are append-only. Metadata is minimized through a sanitizer (no passwords, tokens, secrets, full rows, or full request bodies). Browser clients cannot insert arbitrary audit rows; trusted server/service-role writers are required. The initial event set is intentionally modest and will expand later based on actual needs. Audit enable/disable remains Global Admin-only.

**Reason:**
Operators need on/off control for volume without losing the ability to prove that logging was disabled or that admin privileges changed. Lee retained audit after abandoning brokerage-office and TREC features.

**Consequences:**

* Disabling logging cannot suppress the disable event itself; prior events remain readable.
* Cross-organization audit visibility is Global Admin only.
* Office- and TREC-specific audit event types were removed with those features.
* Feature development and schema validation occur on `harbaugh-forms-dev` before any production rollout; production migrations remain deliberate and separate from feature coding.

**Related files or migrations:**

* `supabase/migrations/20260729210000_brokerage_offices_trec_audit.sql`
* `supabase/migrations/20260730010000_remove_brokerage_offices_and_trec.sql`
* `lib/audit/sanitize.ts`
* `lib/audit/record.ts`
* `lib/audit/constants.ts`
* `app/admin/audit/page.tsx`

---

## Form #1 Buyer Rep orphan TXR-2001 mappings soft-deleted

**Date:** 2026-07-28

**Decision:**
When production Form #1 (TXR-1501 Buyer Rep Agreement) was found visually corrupted, forensic comparison proved the PDF and the 55 genuine Buyer Rep placements were intact. The defect was **142 orphan ACTIVE `form_field_mappings`** for `txr_2001_*` (Residential Lease) keys wrongly attached to `form_id = 1` on 2026-07-23, while Form **18** retained the correct lease mappings. Repair was a narrowly scoped **soft-delete** (`status = 'DELETED'`) of those 142 mapping IDs only, via audited script `scripts/repair-form1-txr2001-orphans.ts`, after writing a full Form #1 mapping backup under `_audit_tmp/`. Genuine Buyer Rep coordinates were not rewritten. Packet instances and all non–Form-#1 ACTIVE mapping fingerprints were required to remain unchanged.

**Reason:**
Restoring from development was unnecessary for coordinates (already matching). Removing the orphan overlays restores Map Fields / Fill Form rendering without risking Form 18, packet snapshots, or other templates.

**Consequences:**

* Production Form #1 ACTIVE mapping count returns to 55 and matches the development fingerprint.
* Orphan DELETED duplicate `txr_2001_*` catalog fields may remain; they are not hard-deleted.
* Future bulk mapping imports must not attach foreign form-family keys to an unrelated `form_id`.
* Prevention (page-count / form-family guards) remains deferred product work.
* Lee completed production visual confirmation on 2026-07-28 after the soft-delete.
* Full row-level backup/result JSON remains local under gitignored `_audit_tmp/` (SHA-256 recorded in `project_status.md`); not committed.

**Related files:**

* `scripts/forensic-form-1-placements.ts`
* `scripts/repair-form1-txr2001-orphans.ts`
* `_audit_tmp/form1-placement-backup-2026-07-28T21-54-39-138Z.json`
* `_audit_tmp/form1-repair-result-2026-07-28T21-54-39-138Z.json`
* `MAPPING_INTEGRITY_AUDIT.md` (historical known-good Form #1 inventory)

---

## Invitation confirmation uses token-hash verifyOtp

**Date:** 2026-07-28

**Decision:**
Harbaugh Forms invitation emails must link directly to the application confirmation route with Supabase’s email OTP token hash:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/update-password
```

Production Auth Site URL is `https://forms.harbaughrealestate.com`. `/auth/confirm` validates supported OTP types and calls `supabase.auth.verifyOtp({ token_hash, type })`, persisting the session through the existing Supabase SSR cookie clients. When only a PKCE `code` is present (no `token_hash`), the same route calls `exchangeCodeForSession` — these flows are not mixed. After invite verification, users set a password on the existing `/auth/update-password` page via `supabase.auth.updateUser`; the invited Auth UUID and admin-provisioned profile / organization membership rows are preserved (no second user, no admin recreate during accept).

**Reason:**
Invitees previously landed on `/auth/confirm?next=/auth/update-password` after Supabase’s ConfirmationURL verify step, so the app saw neither `token_hash` nor `type` and displayed `No token hash or type`. Token-hash verification matches the customized Resend invite template and keeps invitation acceptance under application control.

**Consequences:**

* Lee must keep the invite (and preferably recovery) email templates on the TokenHash form above; ConfirmationURL alone is insufficient for this architecture.
* Redirect allowlist must include the production domain (and Vercel fallback / localhost as needed).
* `inviteUserByEmail` `redirectTo` remains `/auth/confirm?next=/auth/update-password` for ConfirmationURL/PKCE compatibility, but the authoritative invite link is the TokenHash template.
* Previously failed invitees should receive Resend invitation or password recovery; do not create duplicate Auth users.
* Password recovery `redirectTo` also goes through `/auth/confirm` so PKCE codes are exchanged before update-password.

**Related files:**

* `app/auth/confirm/route.ts`
* `lib/auth/email-otp.ts`
* `lib/auth/password-policy.ts`
* `lib/auth/auth-confirm.test.ts`
* `app/auth/actions.ts`
* `app/auth/update-password/page.tsx`
* `components/update-password-form.tsx`
* `components/forgot-password-form.tsx`
* `lib/admin/invite-user.ts`
* `app/auth/error/page.tsx`

---

## Custom packets without a collection

**Date:** 2026-07-25

**Decision:**
Packets may use `packet_type = 'custom'` with `collection_id` null. Custom packets start with zero `packet_forms`. User documents continue to attach through existing `packet_forms` rows with `origin = external_upload` (and the existing `generated-documents` storage layout). No parallel packet-file storage was introduced. Forms remain `GLOBAL` or `PRIVATE` only; creating Global forms requires application `ADMIN` (not `ORG_ADMIN` alone). This attach path is the existing implementation for custom packets; it does **not** by itself satisfy the later product intent to import one-off received PDFs into collection-backed packets (for example an existing listing packet) without creating a reusable Form or Collection entry. See the 2026-08-16 imported-packet-document decision.

**Reason:**
Production feedback needed empty upload-only packets and explicit Private/Global form creation without inventing new storage or Organization-scoped forms.

**Consequences:**

* Forward-only migration `20260725040000_packets_custom_nullable_collection.sql` (applied on development; apply to production only with deliberate rollout).
* Collection-backed packet creation is unchanged.
* The global Fields catalog remains an internal detail; product navigation uses Form Templates / Map Fields.

**Related files:**

* `supabase/migrations/20260725040000_packets_custom_nullable_collection.sql`
* `lib/types/packet.ts` (`createCustomPacket`)
* `lib/library-permissions.ts` (`canCreateFormScope`)

---

## Production Environment Separation and Deployment

**Date:** 2026-07-24

**Decision:**
Harbaugh Forms uses separate Supabase projects for production and development. The Vercel project for this application is `harbaugh-forms` (Lee Harbaugh’s projects). The primary public URL is `https://forms.harbaughrealestate.com`. The Vercel URL `https://harbaugh-forms.vercel.app` remains a supported fallback. Production `NEXT_PUBLIC_SITE_URL` and Supabase Auth Site URL use the custom domain; the Vercel fallback remains on the Auth redirect allowlist. DNS for the custom subdomain is managed at HostPapa; DNS changes must remain limited to intended subdomain records and must not disturb unrelated HostPapa records (for example dashboard or apex records owned by other projects). Development (`harbaugh-forms-dev` / `ewxsxwzezhkeawnjvigx`) remains the source for local development and Vercel Preview. Production (`harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh`) and development credentials must remain isolated. Historical migrations remain immutable; future schema changes use forward-only migrations.

**Reason:**
Isolating credentials and projects prevents Preview/local work from mutating live business data, and keeps a recoverable fallback URL if custom-domain DNS or SSL has issues.

**Consequences:**

* Do not point Preview or local `.env.local` at production credentials.
* Do not reuse or modify the separate Vercel project `harbaugh-dfw-market-dashboard` for this app.
* Invitation-only production access remains Lee-controlled until broader rollout is deliberately approved.

**Related files:**

* `project_status.md`
* `PRODUCTION_ROLLOUT_RUNBOOK.md`
* `PRODUCTION_READINESS_AUDIT.md`

---

## Selective production migration (UUID-preserving)

**Date:** 2026-07-22 (clarified 2026-07-24)

**Decision:** Migrate production data selectively from `harbaugh-forms-dev` while preserving Lee’s existing Auth UUID `e26c8f57-c0aa-4474-b43e-6e15f0260e99` and identity `b1c72b22-2835-44d9-afd4-294fc21d1ca5`. Adaptive new-UUID bootstrap is rejected. Migration used an explicit allowlist (manifest), not a full database clone.

**Approved rollout-baseline scope (historical migration evidence):**

At the completion of the July 2026 selective production migration, the validated rollout baseline contained:

* Forms **1–18** only. Forms **21, 22, and 23** were excluded. Lee may manually create any desired condo listing form after launch.
* Collections **1, 2, 3, and 5** only. Soft-deleted collections **4, 9, 12, and 14** were excluded, along with test collection **7**.
* Packets **2** and **5** only. Packet 2 retained DELETED packet forms **25** and **26** and their historical field instances.
* Contacts 2, 3, 4, 6; properties 1, 3.
* **101** ACTIVE approved defaults and **30** private storage objects (18 Global form PDFs; 12 generated documents for packets 2 and 5).
* Davey Goosmann Realty org + Lee ORG_ADMIN + brokerage/agent profile; Dee Davey as broker profile data only (not Auth).

**Rollout baseline vs live data:**

* Rollout-baseline counts are historical migration evidence, not continuously maintained production counts.
* After launch, current production data may evolve through legitimate Lee activity (and later invited users). Documentation must not treat baseline counts as present-day live inventory.

**Consequences:**

* Production must not receive Yahoo Auth, condo forms 21–23, or excluded collections via the selective migration tooling.
* Auth tooling must refuse replacement Lee UUIDs and refuse targeting `harbaugh-forms-dev` as a migration target.
* Manifest + runbook govern export/import/storage/validation scripts.

**Related files or migrations:**

* `PRODUCTION_DATA_SELECTION_MANIFEST.json`
* `SELECTIVE_PRODUCTION_DATA_MIGRATION_AUDIT.md`
* `PRODUCTION_ROLLOUT_RUNBOOK.md`
* `lib/selective-production/*`
* `scripts/migrate-approved-auth.ts`, `export-approved-production-data.ts`, `import-approved-production-data.ts`, `copy-approved-storage.ts`, `validate-production-migration.ts`
* Dev history repair for `20260722190000`, `20260722200000`, `20260722210000` (no SQL re-run)

---

## Visual PDF Field Editor

**Date:** 2026-06-10

**Decision:**  
Use a visual PDF field editor rather than AI-generated coordinate suggestions.

**Reason:**  
Coordinate mappings may become unreliable when TREC or TXR revises a form. A visual editor provides a more reviewable and maintainable workflow.

**Consequences:**

- Users place fields visually.
- Coordinates are stored behind the scenes.
- Existing form_field_mappings remains but is simplified.
- Business-field definitions are separated from PDF placement.

---

## Soft Deletes

**Date:** 2026-06-02

**Decision:**  
Use soft deletes throughout the application.

**Reason:**  
Real estate records, templates, and generated transactions should remain recoverable and auditable.

**Consequences:**

- Tables should have status or active fields.
- Normal deletion actions should mark records inactive.
- Queries should normally exclude inactive records.

---

## Form and Collection Scope

**Date:** 2026-07-15

**Decision:**
Forms may be either `GLOBAL` or `PRIVATE`. Collections may be either `ORGANIZATION` or `PRIVATE`. Collections must not be created as `GLOBAL`.

**Reason:**
Texas promulgated forms are shared statewide by agents and brokers, so individual form templates can appropriately be Global. Collections represent brokerage-specific packet workflows, preferences, and operating practices, so they should be shared only within an organization or kept private to an individual user.

**Consequences:**

* Global forms are available statewide to authenticated users.
* Organization collections are available only to active members of the assigned organization.
* Active organization members may view, use, and copy organization collections into their private collections.
* Normal organization members may not edit the organization source.
* `ORG_ADMIN` members may manage collections for their own organization.
* Application administrators may manage organization collections across organizations.
* New Global collection creation is blocked.
* Existing organization and private collections remain independently editable.
* Copying an organization collection creates a separate private collection and does not modify the organization source.

**Related files or migrations:**

* `supabase/migrations/20260715120000_organization_collections_and_property_uniqueness.sql`
* Collection permission helpers
* Collection list and detail UI
* Collection cloning functions
* Packet creation from collections

---

## Form Default Scope

**Date:** 2026-07-15 (refined 2026-07-20)

**Decision:**
Form default values may be scoped only as `PRIVATE` or `ORGANIZATION`. Default values must never be `GLOBAL`. Global forms contain structure, not preference literals.

**Reason:**
Default values represent an individual agent’s preferences or a brokerage’s operating practices. They may contain compensation preferences, protection periods, intermediary selections, preferred addenda, brokerage information, recurring checkbox selections, or office-specific wording. These values should not be published statewide merely because the underlying form is Global.

**Consequences:**

* Private defaults belong to one user.
* Organization defaults belong to one brokerage or organization.
* A user’s Private default overrides the Organization default for the same field.
* Organization defaults apply only to users with an active membership in the organization.
* Default resolution uses the packet owner or intended business user, not whichever administrator is viewing the record.
* Global forms may contain structural metadata such as:

  * PDF template
  * canonical fields
  * mappings
  * canonical placement
  * field keys, labels, widget types
  * source paths / source types
  * coordinates, AcroForm names, checkbox export values
  * formatting instructions

* Personal and Organization preference literals belong in `field_defaults`, not Global catalog default columns.
* There are currently **no approved Global preference literals**. Catalog `default_value`, `default_checked`, and `fallback_value` remain cleared of preference content.
* Explicit packet values and authoritative transaction data take precedence over defaults.
* A dedicated `field_defaults` table stores scoped preference values.

**Related files or migrations:**

* `supabase/migrations/20260715180000_field_defaults_scoped.sql`
* `supabase/migrations/20260717120000_clear_global_money_zero_defaults.sql`
* `supabase/migrations/20260717180000_clear_all_global_catalog_defaults.sql`
* `lib/types/field-default.ts`
* `lib/field-defaults.ts`
* Field-default resolution logic
* Packet field-resolution logic

---

## Unified Map Fields Workspace

**Date:** 2026-07-20

**Decision:**
Forms use one **Map Fields** workspace for Global field placement and automatic source configuration, Personal defaults, and Organization defaults. There is no separate Defaults or My Setup workflow. Structural and preference permissions remain distinct within the same workspace. Legacy `/forms/[id]/defaults` redirects into Map Fields.

**Reason:**
Users need PDF context for both structure and preferences. Separate Defaults / My setup entry points duplicated navigation and hid that preference editing and structural mapping share the same form surface. One workspace keeps terminology and permissions clear while preserving server-side authorization boundaries.

**Consequences:**

* Form Templates authorized actions: **Map Fields**, **Edit**, **Delete** (as authorized).
* Regular users and Org Admins edit preferences in Map Fields without mutating Global structure unless they are also application Admins.
* Application Admins may edit Global source, placement, and structure in the same workspace.
* Preference writes target form-scoped `field_defaults` only; catalog preference columns are never updated.
* Changing a default never refreshes or rewrites packet field instances.
* Signature / initials fields may be visible but are not editable as preference defaults.
* Cross-form defaults dashboard remains deferred.
* Legacy ACTIVE defaults with `form_id IS NULL` remain valid resolution fallbacks and are labeled / Clear-protected.

**Related files or migrations:**

* `lib/types/field-default-management.ts`
* `lib/field-defaults-management.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`
* `components/forms/forms-page.tsx`
* `app/forms/[id]/editor/page.tsx`
* `app/forms/[id]/defaults/page.tsx`
* Existing `field_defaults` RLS (no new migration for this UI)

---

## User-Facing Value Terminology

**Date:** 2026-07-20

**Decision:**
Use distinct value language for template configuration versus packet instances. Never expose raw resolver source values, raw database provenance enums, or the user-facing phrase **From fallback**.

### Template configuration (Map Fields)

* **Filled from** — automatic business-data source (or Not connected)
* **Default if blank** — Personal/Organization preference when automatic source is blank
* **Default source** — Personal / Organization / None (including legacy “applies to all forms”)

Do not show Current value, Value source, Manual override, or packet-instance concepts in template configuration.

### Packets → Fill Form

* **Current value** — stored/displayed packet field value
* **Value source** — readable provenance

Known sources may remain specific:

* Entered manually
* From property
* From client
* From agent profile
* From brokerage
* From packet
* From your default
* From organization default
* Blank

For ambiguous historical packet snapshots whose stored metadata only indicates a generic default/fallback (`field_default`, `field_default_checked`, or `fallback`), display:

* **Default**

Optional disclosure: **Why this value?** explains stored provenance without rewriting instances.

**Related files:**

* `lib/types/field-provenance-labels.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`
* `components/packets/packet-form-fields-sidebar.tsx`

---

## Form-Specific Personal Default Clear

**Date:** 2026-07-20

**Decision:**
Clearing a form-specific Personal default soft-deletes only that user’s form-scoped row for the current form. It reveals the next broader applicable default. It must not delete a legacy all-forms Personal default (`form_id IS NULL`), an Organization default, or another user’s default.

**Clear personal default** is distinct from **Remove from this form**, which is a Global structural action (application Admin only).

**Reason:**
Form-level Clear must undo a form-specific preference without destroying cross-form Personal preferences or brokerage Organization defaults.

**Consequences:**

* Server actions enforce owner + form-scope rules; UI hiding is not sufficient.
* Legacy all-forms Personal defaults remain labeled and Clear-protected.
* Soft-delete (`status = DELETED`) is used; rows are not hard-deleted.

**Related files:**

* `lib/field-defaults-management.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`

---

## Map Fields Role Model

**Date:** 2026-07-20

**Decision:**
Role permissions for Map Fields and scoped defaults are:

### Regular user

May:

* view Global placement and readable automatic source
* edit Personal defaults

May not:

* view technical field keys
* edit Organization defaults
* edit Global source, placement, or structure
* remove mappings or replace PDFs

### Organization Admin

May:

* edit Personal defaults
* edit Organization defaults for their own active organization

May not:

* modify Global structure unless also an application Admin

### Application Admin

May:

* edit Global source, placement, and structure
* edit Personal defaults
* edit Organization defaults with explicit organization selection
* remove fields from a form

Server-side authorization is authoritative; RLS and server actions enforce these rules.

**Related files:**

* `lib/field-defaults-management.ts`
* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`
* Existing `field_defaults` RLS

---

## Environment and Preference Data Portability

**Date:** 2026-07-20 (superseded for environment existence 2026-07-24)

**Decision:**
Scoped preference values are database state, not application source. Git does not transfer `field_defaults` rows. Production preferences were included intentionally via the selective production migration allowlist (see Selective production migration). Development and production remain separate projects with isolated credentials.

**Supersession note:** As of 2026-07-24, production (`harbaugh-forms-prod`) exists and is live. Earlier wording that “only `harbaugh-forms-dev` exists” is historical. See “Production Environment Separation and Deployment.”

**Reason:**
Assuming Git or a deploy would recreate preferences would silently lose reviewed Personal/Organization defaults.

**Consequences:**

* Future environment clones or rebuilds must intentionally import or seed reviewed defaults.
* Do not assume Preview deployments share production preference rows.

---

## Historical Global-to-Scoped Default Transition

**Date:** 2026-07-20

**Decision:**
Future scope migrations that move preference values off Global catalog fields must reconcile every old value into one of:

* Personal
* Organization
* authoritative mapped data
* approved structural behavior
* intentional blank
* explicitly unresolved

**Reason:**
The Global-to-scoped migration initially left some values classified as structural. A later cleanup removed all Global literals. That created a transition omission for values that had not been reassigned. The omission audit restored **19** reviewed Lee Personal form-specific defaults on `harbaugh-forms-dev`. Detailed inventories belong in audit/status documentation, not this decisions file.

**Consequences:**

* Cleanup of Global preference literals must not assume every prior literal was structural.
* Unresolved items must be documented rather than silently dropped.
* See `DEFAULT_TRANSITION_AUDIT.md` and `project_status.md` for inventories and counts.

---

## Packet Field-Instance Snapshots

**Date:** 2026-07-17 (refined 2026-07-20)

**Decision:**
Persisted packet field instances are immutable during ordinary Packets → Fill Form open/view. Resolution initializes missing instances only; existing values change only through explicit user-authorized editing or refresh.

Ordinary open must not recalculate or rewrite existing field instances. It must not change:

* `value`
* `value_json`
* `source`
* `is_override`
* `update_date`

Explicit Refresh remains the only action that may recalculate eligible non-overridden values (while the packet form remains editable / `DRAFT`).

**Reason:**
Packet forms capture the agreement state that was filled for a specific client matter. Re-resolving stored non-override values on open (for example after Global catalog defaults change) silently rewrites historical packet data and can clear values that already appeared in generated or signed documents.

**Consequences:**

* Ordinary packet-form open, view, load, and download may insert field instances that are genuinely missing, using the packet owner’s resolution context.
* Ordinary open must not update, clear, or re-source any existing field instance, including null, blank, false, zero, non-override resolved values, and manual overrides.
* Explicit user actions (manual edits, per-field revert, and the editor “Refresh Values” control) remain the only paths that may rewrite existing non-override snapshots — and only while the packet form `document_state` is `DRAFT`.
* Coordinate/mapping structural maintenance must not rewrite saved packet values.
* Data repair for historically overwritten instances is a separate forward-only operation and must not restore preference literals onto Global catalog fields.

**Related files or migrations:**

* `lib/field-instance-sync.ts`
* `lib/field-resolver.ts`
* `lib/field-instances.ts`
* `lib/packet-form-editor.ts`
* Packet form editor load path

---

## Packet Form Document Lifecycle

**Date:** 2026-07-17

**Decision:**
Packet forms use the existing `document_state` values `DRAFT`, `FINAL`, `SIGNED`, and `VOID`. Field-value mutation (edit, revert, refresh, missing-instance insert/update/delete, and placement overrides) is allowed only for `ACTIVE` forms in `DRAFT`. Users may deliberately mark a Draft form Final and reopen Final to Draft. Signed and Void remain read-only; the UI does not set those states until a real signing integration exists. Soft-delete (`status`) remains separate from `document_state`.

**Reason:**
Refresh Values and open-time initialization can rewrite packet snapshots. Agents need an explicit Final lock so completed values cannot be refreshed or silently backfilled, while still allowing deliberate reopen when corrections are required. Database RLS and transition triggers enforce the lock so a stale browser tab cannot mutate after another session marks Final.

**Consequences:**

* `DRAFT`: editable; Refresh Values requires confirmation; Mark Final is available.
* `FINAL`: read-only values; Refresh blocked; ordinary open loads existing instances only (no inserts/updates); Reopen to Draft is available and does not recalculate.
* Mark Final may insert genuinely missing mapped instances using the packet owner’s resolution context, then sets `document_state = FINAL` without updating existing instances.
* `SIGNED` / `VOID`: read-only; no UI transition into these states until a real signing workflow exists; Signed cannot be reopened. Native in-app e-signature is the planned product capability (2026-08-16); Authentisign remains prior research, not a committed vendor. Do not change `document_state` values in this documentation pass.
* Authenticated field-instance and field-instance-mapping INSERT/UPDATE require an ACTIVE DRAFT parent form.
* Privileged sessions (`auth.uid()` null) may still perform migration/admin SQL.
* Future enhancement: before/after field-diff preview prior to Refresh Values.

**Related files or migrations:**

* `supabase/migrations/20260717230000_packet_form_lifecycle_locking.sql`
* `lib/types/packet-form-lifecycle.ts`
* `lib/packet-form-lifecycle.ts`
* `lib/packet-form-editor.ts`
* `components/packets/packet-form-editor.tsx`

---

## Form Publication Lifecycle (Draft / Published / Retired)

**Date:** 2026-07-25

**Decision:**
Library form templates separate three orthogonal concepts:

1. **Record lifecycle status** (`forms.status`): `ACTIVE` (current version), `INACTIVE` (retired historical version), `DELETED` (soft-deleted). These are not a generic editable dropdown.
2. **Publication state** (`forms.publication_state`): `DRAFT` or `PUBLISHED`. Combined with status:
   - `ACTIVE` + `DRAFT` — current version under construction or temporary maintenance
   - `ACTIVE` + `PUBLISHED` — current version available for new collection additions and new packet instantiation
   - `INACTIVE` + `DRAFT` — retired historical version (read-only)
   - `INACTIVE` + `PUBLISHED` — invalid and blocked by constraint/trigger
3. **Packet-form availability** (`packet_forms.availability_state`): `AVAILABLE` or `PENDING_PUBLICATION`. Independent of packet-form `document_state` (`DRAFT` / `FINAL` / `SIGNED` / `VOID`).
4. **Form-family versioning** (`forms.form_family_key`): stable family identity (typically `form_code`, e.g. `TXR-1601`). Version-specific metadata (`version_label`, revision date, title) remains on the form row. A new revision is always a new form record; PDFs and mappings of prior versions are never replaced in place.

Explicit actions replace generic status editing: Publish Form, Unpublish Form, Retire Version, Restore Retired Version.

**Reason:**
Admins previously lacked a safe Draft/Publish model and could misuse `INACTIVE` as a temporary editing switch. Publication must gate new use without rewriting existing packet snapshots, and retirement must be a deliberate, audited, read-only historical state.

**Consequences:**

* New forms default to `ACTIVE` + `DRAFT` and show a Draft badge; they remain available in Form Templates / Map Fields for authorized users but are excluded from ordinary selectors until published.
* Only `ACTIVE` + `PUBLISHED` forms may be newly added to collections or immediately instantiated as usable packet forms.
* Published forms are protected from structural editing (PDF replace, mappings, form-field associations, automatic source configuration, shared field structural metadata). Map Fields field-catalog updates initiated on a Published form are rejected server-side until Unpublish. Preference defaults (Personal / Organization) remain editable on Published forms and never rewrite existing packet field instances. Retired (INACTIVE) forms are fully read-only, including form-specific default writes.
* Publish validates the authoritative stored PDF server-side (download + page count via pdf-lib). Publication is rejected when the PDF is missing, unreadable, or any ACTIVE mapping page is out of range.
* **Trusted publish pathway:** PDF validation runs only in the trusted application server. The `publish_form_template` RPC is not directly executable by `anon`, `authenticated`, or ordinary browser/admin Supabase clients. Final Publish always revalidates server-side (preview never authorizes a later publish). Actor identity is derived from the authenticated server session and passed as a verified actor ID; the RPC re-checks that the actor is an active application ADMIN or authorized Private-form owner and writes `published_by_user_id` / audit events from that ID (service-role calls do not trust `auth.uid()`). Database publication remains atomic. A structural fingerprint (form path + `update_date` + ACTIVE mapping inventory + mapped field source metadata) is captured at validation and rechecked inside the RPC under row locks; structural changes between validation and publication abort the publish.
* Unpublish returns `ACTIVE` + `DRAFT` and re-enables structural editing. Existing `AVAILABLE` packet forms stay available.
* Retire moves any `ACTIVE` form to `INACTIVE` + `DRAFT` (read-only). Restore is application-ADMIN only, requires a written reason, always restores to `ACTIVE` + `DRAFT` (never directly to Published), warns when a newer Published version exists in the same family, and writes an audit event. `ORG_ADMIN` alone cannot restore.
* Global publish uniqueness: at most one `ACTIVE` + `PUBLISHED` Global form per `form_family_key`. Private forms use owner-scoped uniqueness. Publishing a replacement may atomically retire the previous Published version or cancel.
* Packet creation from a collection: Published → `AVAILABLE` (normal init); Draft → `PENDING_PUBLICATION` placeholder (no field instances, no PDF, no Fill/Refresh/Final/Generate); Retired/Deleted → skip with warning; other eligible forms still instantiate.
* Pending activation runs only on Publish: eligible `PENDING_PUBLICATION` packet forms become `AVAILABLE`, initialize only missing instances in the packet owner’s context, leave existing instances unchanged, and are idempotent on repeated Publish.
* Lifecycle transitions write `form_state_events` (`FORM_CREATED`, `FORM_PUBLISHED`, `FORM_UNPUBLISHED`, `FORM_RETIRED`, `FORM_RESTORED`, `FORM_DELETED`). Admin History UI shows business labels without raw UUIDs.
* Database triggers/RPCs enforce the state machine so direct table updates cannot bypass it for authenticated sessions.
* Shared Global field metadata changes in Map Fields warn when the field is used on Published forms and require application-admin confirmation for unsafe shared structural changes.

**Related files or migrations:**

* `supabase/migrations/20260725120000_form_publication_lifecycle.sql`
* `supabase/migrations/20260725180000_secure_publish_form_template.sql`
* `lib/types/form-lifecycle.ts`
* `lib/forms/form-lifecycle-actions.ts`
* `lib/forms/publish-validation.ts`
* `lib/forms/publish-structure-fingerprint.ts`
* `lib/forms/activate-pending-packet-forms.ts`
* `lib/types/packet-form.ts`
* `components/forms/forms-page.tsx`
* `components/forms/pdf-field-editor.tsx`
* `components/collections/form-picker.tsx`

---

## Default-Value Resolution Precedence

**Date:** 2026-07-15 (refined 2026-07-20)

**Decision:**
Field values should be resolved using a deterministic precedence order that favors explicit transaction data over stored defaults. Product behavior (after current/manual packet value or explicit override):

1. Mapped transaction or packet-object value
2. Mapping-scoped Personal (Private) default
3. Form-scoped Personal default
4. Legacy field-only Personal default (`form_id IS NULL`)
5. Mapping-scoped Organization default
6. Form-scoped Organization default
7. Legacy field-only Organization default
8. Blank (or field-established blank/false/`NA` behavior)

The full product order including the current packet value is therefore:

1. Current/manual packet value or explicit override
2. Mapped transaction or packet-object value
3. Mapping-scoped Personal default
4. Form-scoped Personal default
5. Legacy field-only Personal default
6. Mapping-scoped Organization default
7. Form-scoped Organization default
8. Legacy field-only Organization default
9. Blank

The resolver may group Personal-before-Organization and mapping/form/field specificity internally; the product order above is authoritative.

**Reason:**
A stored preference should help prepopulate a form, but it should never override a value that was explicitly entered for the current transaction or resolved from the selected client, property, agent, brokerage, or packet.

**Consequences:**

* Private defaults override Organization defaults at each specificity tier.
* Deleted or inactive defaults are ignored.
* Organization defaults require an active organization and active membership.
* The user’s `primary_organization_id` determines which Organization defaults apply.
* The application must not choose an arbitrary organization when a user belongs to multiple organizations.
* An administrator viewing another user’s packet must not cause the administrator’s own defaults to be applied.
* Global catalog preference literals are not part of the preference resolution path (none approved).

**Related files or migrations:**

* `lib/types/field-default.ts` (`pickBestFieldDefault`, `resolveScopedPreferenceDefault`)
* `lib/field-defaults.ts`
* Packet field-resolution logic
* `public.field_defaults`
* User profile and primary-organization resolution

---

## Copy Private Form to Global Library

**Date:** 2026-07-15

**Decision:**
Copying a private form into the Global library creates a separate and independent Global form. The operation must not convert, reassign, or otherwise modify the source private form.

**Reason:**
A user may have invested substantial work in a private PDF template, field placements, mappings, and preferences. Making a form available statewide should not remove or alter the user’s original version.

**Consequences:**

* The source form remains `PRIVATE`.
* The source owner remains unchanged.
* The source PDF remains in its original Storage location.
* The source fields, mappings, and scoped defaults remain unchanged.
* The Global copy receives:

  * a new form ID
  * a new Global Storage path
  * copied structural mappings
  * new mapping IDs
  * appropriate Global field references
  * traceability metadata
* The Global copy does not receive:

  * Private defaults
  * Organization defaults
  * packet-specific values
  * agent-specific literals
  * brokerage-specific literals
  * collections
  * packets
  * generated PDFs
* Existing safe Global catalog fields may be reused.
* Safe structural Private fields may be converted into new Global field definitions.
* User-specific or brokerage-specific Private fields must be blocked or reviewed before publication.
* The source and Global copy do not synchronize after creation.
* Editing, deleting, replacing, or deactivating one version does not affect the other.
* The user-facing action is named `Copy to Global Library`, not Promote.
* Only active application administrators may perform the operation.
* `ORG_ADMIN` status alone does not grant this authority.

**Related files or migrations:**

* `supabase/migrations/20260715140000_form_copy_to_global_traceability.sql`
* `lib/admin/copy-form-to-global.ts`
* `lib/admin/global-form-identity.ts`
* `lib/form-owner-display.ts`
* Forms list and form-detail UI

---

## Private Form Ownership Presentation

**Date:** 2026-07-15

**Decision:**
When an application administrator views a private form owned by another user, the interface must display the owner’s identity rather than describing the form as the administrator’s form.

**Reason:**
Labels such as `Mine` or an unqualified `Private` label can incorrectly imply ownership and make administrative actions confusing or unsafe.

**Consequences:**

* A Global form is labeled `Global`.
* A user’s own private form is labeled `Private`.
* An administrator viewing another user’s private form sees:

  * `Owned by [User Name]`, or
  * `Private` together with `Owner: [User Name]`
* Owner resolution should prefer a readable profile name and fall back to an appropriate email.
* Raw user UUIDs must not be displayed.
* Standard users do not see other users’ private forms or ownership information.
* Copy to Global Library confirmation text must state that the original owner’s private form will remain unchanged.

**Related files or migrations:**

* `lib/form-owner-display.ts`
* `components/forms/forms-page.tsx`
* Form detail and editor metadata
* Library permission helpers

---

## Global Form Copy Traceability

**Date:** 2026-07-15

**Decision:**
A Global form copied from a private source should retain lightweight traceability identifying the source form, source owner, copying administrator, and copy date.

**Reason:**
Administrators need to understand where a Global form originated without creating lifecycle dependence between the source and the copy.

**Consequences:**

* The Global form records:

  * `copied_from_form_id`
  * `copied_from_owner_user_id`
  * `copied_by_user_id`
  * `copied_to_global_at`
* Traceability is informational only.
* The source form is not modified when a copy is created.
* Deleting or deactivating the source does not affect the Global copy.
* Deleting the Global copy does not affect the source.
* Foreign-key behavior must not cascade deletion between the records.
* This traceability does not replace a future full audit system.

**Related files or migrations:**

* `supabase/migrations/20260715140000_form_copy_to_global_traceability.sql`
* `forms` table
* Copy-to-Global server action

---

## Property Address Uniqueness

**Date:** 2026-07-15

**Decision:**
A user may have only one non-deleted property record for the same normalized physical address.

**Reason:**
Literal address comparisons allowed duplicate records when the same property was entered using variations such as `Court` and `Ct.`, different capitalization, spacing, state formats, or ZIP+4.

**Consequences:**

* Property uniqueness is scoped by `owner_user_id`.
* Different users may independently store the same property address.
* The uniqueness key includes normalized:

  * street address
  * unit or suite
  * city
  * state
  * ZIP5
* Normalization includes:

  * trimming
  * case normalization
  * repeated-space removal
  * supported punctuation handling
  * deterministic street-suffix normalization
  * `Texas` and `TX` equivalence
  * ZIP and ZIP+4 equivalence
  * blank and null unit equivalence
* `ACTIVE` and `INACTIVE` records block another non-deleted duplicate.
* `DELETED` records do not prevent creation of a replacement property.
* Restoring a deleted property is rejected when a conflicting non-deleted property exists.
* Editing an address to match another property owned by the same user is rejected.
* Application validation provides a clear message, but the database unique index remains authoritative.
* No property belonging to another user is exposed when reporting a duplicate.

**Related files or migrations:**

* `supabase/migrations/20260715120000_organization_collections_and_property_uniqueness.sql`
* Property normalization helpers
* Property create, edit, and restore actions
* `properties_owner_address_live_uidx`
* Property-address tests

---

## Organization Collection Permissions

**Date:** 2026-07-15

**Decision:**
Organization collection permissions are based on active organization membership and role.

**Reason:**
Brokerage packet workflows should be available to brokerage members while remaining protected from unrelated users and organizations.

**Consequences:**

### Active member

May:

* view organization collections
* view their ordered forms
* create packets directly from them
* copy them into private collections

May not:

* edit the organization source
* add, remove, or reorder forms
* delete, restore, or change status
* reassign the collection to another organization

### ORG_ADMIN

May:

* create organization collections for their own organization
* edit organization collections for their own organization
* add, remove, and reorder forms
* perform permitted lifecycle actions
* copy organization collections privately

May not:

* manage another organization’s collections

### Application ADMIN

May:

* manage organization collections across organizations
* assign an organization where permitted
* perform administrative lifecycle actions

### Outsider

May not:

* view
* copy
* use for packet creation
* mutate
* access collection forms through the collection

RLS remains authoritative for all collection permissions.

**Related files or migrations:**

* `supabase/migrations/20260715120000_organization_collections_and_property_uniqueness.sql`
* Collection RLS policies
* Collection permission helpers
* Collection copy functions
* Packet creation from collections

---

## Personal placement overrides (deferred)

**Date:** 2026-07-20

**Decision:**  
Personal placement overrides and Restore Global position remain deferred. Preference defaults are managed in the unified Map Fields workspace; moving or resizing fields remains a Global structural concern until a Personal placement product is designed.

**Reason:**  
Scoped preference editing shipped without Personal coordinate overrides. Mixing unfinished placement-override UX into Map Fields would blur structural vs preference permissions.

**Consequences:**

* No Personal placement override UI in the current Map Fields release.
* Restore Global position remains deferred with Personal placement overrides.

**Related files:**

* `components/forms/pdf-field-editor.tsx`
* `components/forms/pdf-my-setup-editor.tsx`

---

## PDF Placement Is Independent of Automatic Sourcing

**Date:** 2026-07-21

**Decision:**
PDF placement and automatic business-data sourcing are independent concerns. A field may be placed on a PDF even when it has no automatic data source, and a null `source_path` is a valid state for manual-only fields.

**Reason:**
The mapping-integrity and source-object architecture audits showed that treating "no automatic source" as a mapping defect produced false alarms (the disputed TXR-1101 mappings were visually valid; only their data-model sourcing was broken) and that many `source_type` values pointed at tables nothing maintains.

**Consequences:**

* Automatic sources are used only when a distinct upstream object or workflow owns the value independently from Fill Form (property, contact, agent profile, brokerage, organization, or an independently maintained agreement/packet object).
* Personal and Organization defaults initialize eligible packet field values but are **not** automatic source mappings.
* Map Fields shows manual-only fields as "Filled from: Not connected" while their placements and scoped defaults continue to work normally.

**Related files or migrations:**

* `MAPPING_INTEGRITY_AUDIT.md`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`
* `lib/field-resolver.ts`

---

## contract_details Is Abandoned Architecture

**Date:** 2026-07-21

**Decision:**
`contract_details` is abandoned architecture. All 64 catalog fields formerly configured with `source_type = 'contract_details'` are now `manual_only` with null source paths. **Superseded for schema/code removal:** see “contract_details Architecture Removed” (2026-07-22) — the empty table and resolver/source registration were deleted via forward-only migration after this conversion.

**Reason:**
The table has zero rows, no application writer, and no user-facing UI, and no packet field instance has ever been sourced from it. Its mapped fields already functioned exclusively through scoped defaults and manual Fill Form values, so the conversion made real behavior explicit without changing it.

**Consequences:**

* TXR-1601 contract fields show "Filled from: Not connected" in Map Fields; PDF placements, Personal/Organization defaults (including `NA` and numeric `0`), and packet snapshots are unchanged.
* The migration targets explicit field IDs with strict source-type preconditions and is rerun-safe.
* `listing_agreement_details` packet-form sources were cleaned up separately on 2026-07-22 (see below).

**Related files or migrations:**

* `supabase/migrations/20260721190000_remove_abandoned_contract_details_sources.sql`
* `lib/contract-details-source-removal.test.ts`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`

---

## Current Packets Do Not Use listing_agreement_details as an Automatic Source

**Date:** 2026-07-22

**Decision:**
Current collection-based packet forms do not use `listing_agreement_details` as an automatic upstream source. The Listing-details source conversion made that explicit without deleting the historical table or legacy route at the time. **Superseded for schema/route removal:** see “Legacy Listing Agreement Workflow Removed” (2026-07-22).

**Reason:**
No current listing packet links to a representation agreement / details row. Zero packet field instances (current or historical) were ever sourced from the table. Most TXR-1102 paths were never in the resolver allowlist. Lee approved converting all 129 ACTIVE `listing_agreement_details` catalog fields plus the three Listing compensation custom-resolvers that depended on dormant details columns.

**Consequences:**

* Migration `20260722010000_remove_obsolete_listing_details_sources.sql` converted **132** fields to `manual_only` (null path; custom resolvers also clear `resolver_key`).
* Lee Personal form-specific `NA` defaults were created via Map Fields for `KNOWN_DISTRICTS` and `OTHER_FEES_REIMBURSABLE_EXPENSES` on TXR-1101 (form 7).
* HOA Listing/Lease PDF fields remain `manual_only` for now (no `property_hoas` remapping in this cleanup).
* The historical details row, legacy `/listing-agreements` UI, and resolver code were removed in a later cleanup after Lee confirmed the row was disposable development data.
* TXR-1102 preference defaults were reviewed separately (see TXR-1102 decision below).

**Related files or migrations:**

* `supabase/migrations/20260722010000_remove_obsolete_listing_details_sources.sql`
* `lib/listing-details-source-removal.test.ts`
* `LISTING_AGREEMENT_DETAILS_REVIEW.md`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`

---

## Legacy Listing Agreement Workflow Removed

**Date:** 2026-07-22

**Decision:**
The legacy Listing Agreement details row and parent agreement were disposable development data and were removed with Lee’s approval. Current Listing packets are collection-based and do not depend on a standalone Listing Agreement details record. The legacy `/listing-agreements` workflow and agreement-linked Listing packet creation were removed before production. Buyer Rep agreement architecture remains intact and was outside the cleanup scope. Historical migrations remain preserved; cleanup used a forward-only migration.

**Reason:**
Fresh checks confirmed details id=`1` / LISTING agreement id=`2` / client links `3`–`4` had zero packet references and zero instance provenance. ACTIVE catalog sources were already `manual_only`. Lee declined export/archive.

**Consequences:**

* Migration `20260722190000_remove_listing_legacy_workflow.sql` hard-deleted the details row, soft-deleted LISTING agreement `#2` and its seller links, dropped `listing_agreement_details`, normalized eight DELETED fields to `manual_only`, and removed the source type from `fields_source_type_check`.
* Application route, UI, types, resolver load/dispatch, and Listing legacy wizard branch were removed.
* `generatePacketFromAgreement` now accepts Buyer Rep agreements only; Listing packets are created only via Collections.
* Packet and field-instance fingerprints unchanged.

**Related files or migrations:**

* `supabase/migrations/20260722190000_remove_listing_legacy_workflow.sql`
* `lib/listing-legacy-workflow-removal.test.ts`
* `LISTING_LEGACY_WORKFLOW_CLEANUP_AUDIT.md`

---

## TXR-1102 Reviewed Personal Form-Specific Defaults

**Date:** 2026-07-22

**Decision:**
After the TXR-1102 scoped-default review and N1–N6 text-field context review, Lee approved **20** Personal form-specific defaults on Global TXR-1102 (form **#15**). Conditional, “Other,” and mutually exclusive branch blanks remain without defaults. The existing Organization all-forms **Broker Bay** default on `LEASE_SCHEDULING_COMPANY` is preserved without a Personal duplicate.

**Durable blank-vs-NA rule:**
A blank field should default to `NA` when it is a standalone narrative provision, exception, or list whose omission would leave the paragraph ambiguous. A blank field should remain blank when it belongs to an unselected checkbox, “Other” election, mutually exclusive alternative, amount, percentage, date, or other transaction-specific factual value. Defaults must not partially complete an unselected contractual branch or make two mutually exclusive alternatives appear completed.

**Approved defaults (Private, Lee, form_id = 15, mapping_id null):**

* **12 × `NA`:** `lease_non_real_estate_items`, `lease_listing_exclusions`, `lease_reimbursable_expenses`, `lease_known_financial_obligations_exception`, `lease_known_liens_exception`, `lease_optional_common_area_fees_exception`, `lease_health_safety_condition_exception`, `lease_special_provisions`, `lease_tenant_utilities_except`, `lease_items_not_repaired`, `lease_requirements_special_provisions`, `lease_requirements_other`
* **3 × preference text/number:** `lease_protection_period_days` = `30`; `lease_payment_county` = `Dallas/Tarrant`; `lease_late_charges_incurred_day` = `2`
* **5 × checked:** `lease_mls_file_immediately`, `lease_keybox_authorized_yes`, `lease_intermediary_yes`, `lease_add_iabs`, `lease_rent_due_first_day`

**Intentionally left blank / unchecked:**

* **10 conditional/Other/exclusive text fields:** `lease_broker_fee_other`, `lease_no_coop_other`, `lease_renewal_other`, `lease_sale_comp_other`, `lease_mls_delayed_purpose`, `lease_make_ready_direct_service_fee`, `lease_make_ready_reimbursement_service_fee`, `lease_add_other_document_description`, `lease_rent_due_other`, `lease_animal_restrictions`
* `lease_mls_file_listing` remains unchecked (no Personal checked default)
* Rent, deposits, compensation amounts/percentages, listing/lease dates, phones/addresses, and signatures remain without defaults

**Reason:**
Former `listing_agreement_details` schema defaults were inert surrogates, not approved preferences. Lee reviewed form wording so only true standalone N6/N1 narratives receive `NA`, while N2–N4 election branches stay blank until selected.

**Consequences:**

* New eligible TXR-1102 instances for Lee initialize the 20 approved values; Yahoo and other users do not inherit Lee’s Private rows.
* Organization `Broker Bay` continues to apply to active Davey Goosmann members.
* Historical packet field instances are unchanged by default creation and by ordinary Fill Form open (`ensure_missing`).
* No migration was required; preferences live in `field_defaults` database state (not Git).
* These 20 reviewed defaults were part of the approved selective-migration defaults baseline into production. After launch, live production defaults may evolve; do not treat historical inventories as continuously maintained live counts.

**Related files or migrations:**

* `TXR_1102_SCOPED_DEFAULT_REVIEW.md`
* `lib/txr-1102-scoped-defaults.test.ts`

---

## contract_details Architecture Removed

**Date:** 2026-07-22

**Decision:**
`contract_details` was abandoned architecture with zero rows, no writers, no UI, and no packet provenance. Its former catalog fields were converted to `manual_only` before the table and resolver infrastructure were removed. Contract form values now come from genuine business sources, scoped defaults, packet field instances, and manual Fill Form entry. Historical migrations remain intact; removal was performed through a forward-only migration.

**Reason:**
After the 2026-07-21 source-conversion phase, the empty table and dead source/resolver code remained only for temporary compatibility. Lee approved completing deletion before any production rollout. Fresh checks confirmed zero rows, zero fields with `source_type = 'contract_details'`, zero packet instances with that provenance, and a select-only application reader.

**Consequences:**

* Migration `20260722180000_remove_contract_details_architecture.sql` drops the table (no CASCADE), removes `'contract_details'` from `fields_source_type_check`, and converts six table-dependent custom-resolver fields (survey option / effective day-month-year) to `manual_only`.
* Application registries, resolver loading/dispatch, and UI source selectors no longer offer Contract Details.
* The 64 previously converted Contract fields remain `manual_only` with null paths; mappings, defaults, and packet snapshots are unchanged.
* `listing_agreement_details` and its legacy route are untouched.

**Related files or migrations:**

* `supabase/migrations/20260722180000_remove_contract_details_architecture.sql`
* `lib/contract-details-architecture-removal.test.ts`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`

---

## Property HOA Storage Consolidation

**Date:** 2026-07-22

**Decision:**
`property_hoas` is the authoritative HOA data model. The Property screen intentionally exposes one HOA record (name, phone, management company), while the schema preserves multiple-HOA capability for future use. The first ACTIVE HOA row (`ORDER BY create_date, id`) is the temporary single-record UI convention — not a permanent business rule and not an `is_primary` column. Direct HOA columns on `properties` (`hoa_name`, `hoa_phone`, `hoa_management_company`) were retired as redundant. Existing development values in those columns were approved as disposable test data and were not backfilled. Clearing HOA Name soft-deletes the displayed HOA row (`status = 'DELETED'`); hard deletes are not used. Multi-HOA UI is not implemented.

**Reason:**
The Property UI already presented a single HOA form, but persisted those three fields onto `properties` while resolvers for TREC 36-10 / related catalogs already read `property_hoas`. Keeping both stores duplicated data and left `property_hoas` without writers.

**Consequences:**

* Property create/edit reads and writes one ACTIVE `property_hoas` row via `lib/property-hoa-storage.ts`.
* Catalog fields `HOA_ASSOCIATION_NAME` and `txr_2001_hoa_name` redirect to `custom_resolver` / `property_hoa_name`.
* Retained on `properties`: `has_hoa`, `hoa_contact_name`, `hoa_email`, `hoa_website`, `hoa_dues_*`.
* Packet instances, mappings, and scoped defaults are unchanged by the migration.
* Multi-HOA UI remains deferred; the single-record UI convention is temporary.

**Related files or migrations:**

* `supabase/migrations/20260722120000_consolidate_property_hoa_storage.sql`
* `lib/property-hoa-storage.ts`
* `lib/property-hoa-storage.test.ts`
* `PROPERTY_HOA_CONSOLIDATION.md`

---

## TypeScript Custom Resolvers Remain Accepted

**Date:** 2026-07-24

**Decision:**
TypeScript custom resolvers remain an accepted mechanism for concatenation, formatting, selecting rows from multi-row results, composite business values, and Buyer Rep / related logic. Unifying every resolver into a single catalog representation is optional future maintenance, not a production blocker.

**Reason:**
Several live business values are not simple single-column source paths. Removing custom resolvers would regress Buyer Rep and composite formatting without a replacement product design.

**Consequences:**

* New resolvers should remain narrowly scoped and tested.
* Dead or unreachable resolver keys may still be cleaned up when proven unused.

---

## Initial Production Access Is Invitation-Only

**Date:** 2026-07-24 (confirmation architecture clarified 2026-07-28)

**Decision:**
Initial production access is invitation-only and Lee-controlled. Public signup is not the production onboarding path. Custom SMTP and the token-hash invitation confirmation workflow should be verified with a fresh invitation smoke test before adding users beyond the launch operator. See “Invitation confirmation uses token-hash verifyOtp.”

**Reason:**
Controlled Lee-only launch reduces blast radius while real transactions are exercised in production.

**Consequences:**

* Do not broaden production Auth without explicit operational readiness (SMTP, invite template, error tracking, backup posture as needed).

---

## Source Registries Versus Historical Provenance

**Date:** 2026-07-22

**Decision:**
Source registries contain only supported current automatic-source mechanisms. Historical packet provenance may retain display-only compatibility even after a source is no longer selectable for new fields. Unused source types and custom resolvers were removed only after proving no field, packet, UI, or active workflow dependency remained. Selectable types removed include `packet`, `static_default`, `contract_details`, and `listing_agreement_details`.

**Reason:**
`packet` and `static_default` were selectable but had zero catalog fields. Fifty-three Listing/Lease `custom_resolver` keys had no runtime implementation after `listing_agreement_details` removal, while scoped defaults and Fill Form already supplied values. Buyer Rep and genuine Property/Contact/Settings/HOA sources remain first-class.

**Consequences:**

* Migration `20260722210000_remove_unused_source_registry_metadata.sql` normalized unreachable metadata and shrunk `fields_source_type_check`.
* Instance `source='packet'` still displays as “From packet”.
* Packet field instances were not rewritten.

**Related files or migrations:**

* `supabase/migrations/20260722210000_remove_unused_source_registry_metadata.sql`
* `lib/source-registry-cleanup.test.ts`
* `SOURCE_REGISTRY_AND_RESOLVER_CLEANUP_AUDIT.md`

---

## Brokerage Profile Versus Form Defaults

**Date:** 2026-07-22

**Decision:**
Brokerage profile data and form defaults are separate concerns. Genuine brokerage identity and contact fields remain in `brokerage_settings`. Form-completion preferences belong in scoped Personal or Organization `field_defaults`, not legacy `brokerage_settings.default_*` columns. Obsolete default columns were removed only after proving no live resolver, field, packet, or UI dependency remained.

**Reason:**
Seven `default_*` columns from the initial schema predated scoped defaults, were never referenced by TypeScript, and were never exposed in the Settings UI. Preferences such as market area, protection period, intermediary, payment county, and Broker Bay already live in `field_defaults`.

**Consequences:**

* Migration `20260722200000_remove_brokerage_legacy_default_columns.sql` dropped the seven columns and the `brokerage_settings_protection_period_non_negative` check.
* Profile fields and Settings save behavior are unchanged.
* No catalog field conversion was required (zero fields used those paths).

**Related files or migrations:**

* `supabase/migrations/20260722200000_remove_brokerage_legacy_default_columns.sql`
* `lib/brokerage-legacy-defaults-removal.test.ts`
* `BROKERAGE_SETTINGS_LEGACY_DEFAULTS_AUDIT.md`

---

## Buyer Rep Broker-Signature Checkbox Reactivation

**Date:** 2026-07-21

**Decision:**
`BUYER_REP_BROKER_SGN_CHECKBOX` (`2a32353f-0923-40ed-98f0-e60815ad4e96`) was reactivated as an ACTIVE, `manual_only`, unchecked-by-default catalog field. Its TXR-1501 page 6 mapping and three historical packet instances were left untouched.

**Reason:**
The field was the only ACTIVE mapping pointing at an INACTIVE catalog field in the entire database. Investigation proved its inactivation was accidental: the field matches every text criterion of the `20260701200000` AcroForm-pollution sweep heuristic (all-caps key ≥ 18 characters, effectively manual, no source path or resolver key) even though it is a real hand-drawn checkbox, and its ACTIVE mapping and instances were never inactivated with it — the signature of an incomplete cleanup, not a deduplication. No active replacement field exists: nearby candidates (`ASSOCIATE_SIGNATURE_BOX`, `listing_broker_signature_checkbox`, `lease_broker_signature_checkbox`, `BROKER_AGENT_SIGNATURE`) are semantically different controls.

**Consequences:**

* The checkbox remains on the Buyer Rep PDF at its original placement, manual-only, starting unchecked.
* The key ("SGN") is not Authentisign-excluded, so signing behavior is unchanged.
* Reactivation cannot create duplicates: no other ACTIVE GLOBAL field shares the key, and the migration guards the `fields_global_field_key_active_uidx` condition explicitly.
* Caution for future sweeps: heuristic-based catalog deactivations must verify that a field's ACTIVE hand-drawn mappings and instances are handled consistently.

**Related files or migrations:**

* `supabase/migrations/20260721190000_remove_abandoned_contract_details_sources.sql`
* `supabase/migrations/20260701200000_deactivate_acroform_polluted_catalog_fields.sql`
* `lib/contract-details-source-removal.test.ts`


---

## Selective TXR-1605 Production Form Sync

**Date:** 2026-07-25

**Decision:**
After Lee finalized TXR-1605 (TREC 30-18 Residential Condominium Contract Resale) in development, including Map Fields placement and form-scoped Organization defaults, the completed catalog configuration was selectively synchronized onto the **existing** production Global form resolved by stable identity (`form_code=TXR-1605`, `version_label=TXR-1605-05-04-2026`), not by numeric form ID. Development form id 24 and production form id 20 remain distinct. Packet field instances were never rewritten. Shared Global fields were reused without metadata changes when already compatible. New `contract_condo_*` Global fields missing in production were inserted with new production UUIDs.

**Reason:**
Production already contained an empty ACTIVE Global TXR-1605 shell (form 20) with the identical approved PDF. Creating a second production Condo form would duplicate stable identity. Broad database clone or unrestricted storage copy would violate environment isolation and packet-snapshot safety.

**Consequences:**

* Future form promotions must resolve production targets by stable identity and refuse form creation when an ACTIVE match exists.
* Guarded tooling (`scripts/sync-condo-txr-1605-to-production.ts`) defaults to dry-run and requires `--confirm EXISTING_PROD_TXR_1605` for apply.
* Rollback is soft-delete oriented and must not touch `field_instances`.

**Related files:**

* `CONDO_TXR_1605_PRODUCTION_SYNC_AUDIT.md`
* `CONDO_TXR_1605_PRODUCTION_SYNC_MANIFEST.json`
* `scripts/sync-condo-txr-1605-to-production.ts`
* `scripts/rollback-condo-txr-1605-production.ts`
* `lib/condo-txr-1605-production-sync.ts`
