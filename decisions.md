# Harbaugh Forms — Architectural Decisions

## Decision Format

Each decision should include:

- Date
- Decision
- Reason
- Consequences
- Related files or migrations

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

**Date:** 2026-07-20

**Decision:**
Only `harbaugh-forms-dev` currently exists. There is no production environment yet. Database preferences created in development will not automatically appear in a future environment. Future production setup must explicitly account for reviewed defaults and other required seed/configuration data (approved manual configuration or an explicitly designed seeding process). Git does not transfer `field_defaults` rows.

**Reason:**
Scoped preference values are database state, not application source. Assuming Git or a deploy would recreate them would silently lose reviewed Personal defaults.

**Consequences:**

* No production deployment or immediate default recreation is pending while only the development environment exists.
* Environment setup plans for a future production project must include reviewed defaults intentionally.

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
* `SIGNED` / `VOID`: read-only; no UI transition into these states in the current task; Signed cannot be reopened.
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
Current collection-based packet forms do not use `listing_agreement_details` as an automatic upstream source. The historical Listing Agreement table and its one row remain for compatibility, but current packet-form fields use scoped defaults and manual Fill Form values. Existing agreement-record data and current packet-field sourcing are separate concerns. The Listing-details cleanup converts packet-form catalog fields to `manual_only` without deleting the historical table or legacy route. TXR-1102 scoped defaults require an explicit review and are not automatically inferred from legacy schema defaults.

**Reason:**
No current listing packet links to a representation agreement / details row. Zero packet field instances (current or historical) were ever sourced from the table. Most TXR-1102 paths were never in the resolver allowlist. Lee approved converting all 129 ACTIVE `listing_agreement_details` catalog fields plus the three Listing compensation custom-resolvers that depended on dormant details columns.

**Consequences:**

* Migration `20260722010000_remove_obsolete_listing_details_sources.sql` converted **132** fields to `manual_only` (null path; custom resolvers also clear `resolver_key`).
* Lee Personal form-specific `NA` defaults were created via Map Fields for `KNOWN_DISTRICTS` and `OTHER_FEES_REIMBURSABLE_EXPENSES` on TXR-1101 (form 7).
* HOA Listing/Lease PDF fields remain `manual_only` for now (no `property_hoas` remapping in this cleanup).
* The historical details row, legacy `/listing-agreements` UI, and resolver code remain until a later schema/route decision.
* TXR-1102 preference defaults (IABS, keybox, rent-due-first-day, etc.) are deferred — do not recreate from schema defaults automatically.

**Related files or migrations:**

* `supabase/migrations/20260722010000_remove_obsolete_listing_details_sources.sql`
* `lib/listing-details-source-removal.test.ts`
* `LISTING_AGREEMENT_DETAILS_REVIEW.md`
* `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`

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
* Only `harbaugh-forms-dev` exists; a future production environment must intentionally include these 20 reviewed defaults.

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
* Only `harbaugh-forms-dev` exists; no production rollout in this change.

**Related files or migrations:**

* `supabase/migrations/20260722120000_consolidate_property_hoa_storage.sql`
* `lib/property-hoa-storage.ts`
* `lib/property-hoa-storage.test.ts`
* `PROPERTY_HOA_CONSOLIDATION.md`

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
