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

**Date:** 2026-07-15

**Decision:**
Form default values may be scoped only as `PRIVATE` or `ORGANIZATION`. Default values must never be `GLOBAL`.

**Reason:**
Default values represent an individual agent’s preferences or a brokerage’s operating practices. They may contain compensation preferences, protection periods, intermediary selections, preferred addenda, brokerage information, recurring checkbox selections, or office-specific wording. These values should not be published statewide merely because the underlying form is Global.

**Consequences:**

* Private defaults belong to one user.
* Organization defaults belong to one brokerage or organization.
* A user’s Private default overrides the Organization default for the same field.
* Organization defaults apply only to users with an active membership in the organization.
* Default resolution uses the packet owner or intended business user, not whichever administrator is viewing the record.
* Global forms and fields may retain structural metadata such as:

  * field keys
  * labels
  * widget types
  * source paths
  * coordinates
  * AcroForm names
  * checkbox export values
  * formatting instructions
* Global catalog fields contain no user-preference defaults. Private and Organization defaults are stored only in scoped `field_defaults`. Global catalog `default_value`, `default_checked`, and `fallback_value` may be retained only when deliberately classified as structural constants.
* Personal or brokerage-specific literal values must not be stored on Global forms, fields, or mappings.
* Explicit packet values and authoritative transaction data take precedence over defaults.
* A dedicated `field_defaults` table stores scoped preference values.
* Full user-facing management of My Defaults and Organization Defaults may be implemented separately.

**Related files or migrations:**

* `supabase/migrations/20260715180000_field_defaults_scoped.sql`
* `supabase/migrations/20260717120000_clear_global_money_zero_defaults.sql`
* `supabase/migrations/20260717180000_clear_all_global_catalog_defaults.sql`
* `lib/types/field-default.ts`
* `lib/field-defaults.ts`
* Field-default resolution logic
* Packet field-resolution logic

---

## Form-Level Defaults Management UI

**Date:** 2026-07-19

**Decision:**
Expose Private and Organization preference defaults through a form-level UI on Global forms (`/forms/[id]/defaults`), not a system-wide dashboard in the first phase. Writes target form-scoped `field_defaults` rows only. RLS remains the authoritative permission boundary; server actions mirror Private owner / ORG_ADMIN / application Admin rules. Clearing soft-deletes (`status = DELETED`). No preference literals are written back to Global catalog fields. Changing a default never refreshes or rewrites packet field instances.

**Reason:**
Resolution, RLS, and storage already exist. Users need a reviewable surface attached to the Global forms they fill. A form-scoped page matches the current Templates list architecture (no separate form-detail tabs) and avoids inventing a cross-form product surface before authenticated use proves the workflow.

**Consequences:**

* Entry point: **Defaults** on active Global form rows in `/forms`.
* Private forms do not offer this workflow in this phase.
* Application Admins must choose an organization explicitly when managing Organization defaults.
* Signature / initials fields are visible but not editable as preference defaults.
* Cross-form defaults dashboard remains deferred.
* Legacy ACTIVE defaults with `form_id IS NULL` remain valid resolution fallbacks (mapping > form-scoped > field-only). The management UI writes form-scoped rows (`form_id` set); displayed “current” values use the same pickBest specificity as the resolver.

**Related files or migrations:**

* `lib/types/field-default-management.ts`
* `lib/field-defaults-management.ts`
* `app/forms/[id]/defaults/page.tsx`
* `components/forms/form-defaults-manager.tsx`
* Existing `field_defaults` RLS (no new migration)

---

## Packet Field-Instance Snapshots

**Date:** 2026-07-17

**Decision:**
Persisted packet field instances are immutable during ordinary view/open. Resolution initializes missing instances only; existing values change only through explicit user-authorized editing or refresh.

**Reason:**
Packet forms capture the agreement state that was filled for a specific client matter. Re-resolving stored non-override values on open (for example after Global catalog defaults change) silently rewrites historical packet data and can clear values that already appeared in generated or signed documents.

**Consequences:**

* Ordinary packet-form open, view, load, and download may insert field instances that are genuinely missing, using the packet owner’s resolution context.
* Ordinary open must not update, clear, or re-source any existing field instance, including null, blank, false, zero, non-override resolved values, and manual overrides.
* Existing instance `UPDATE_DATE` must not change during ordinary open.
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

**Date:** 2026-07-15

**Decision:**
Field values should be resolved using a deterministic precedence order that favors explicit transaction data over stored defaults.

**Reason:**
A stored preference should help prepopulate a form, but it should never override a value that was explicitly entered for the current transaction or resolved from the selected client, property, agent, brokerage, or packet.

**Consequences:**

The preferred resolution order is:

1. Explicit packet-specific override
2. Mapped transaction or business source data
3. Private user default
4. Organization default
5. Structural fallback or universal mapping constant
6. Blank, false, or `NA`, according to the field’s established behavior

Additional rules:

* Private defaults override Organization defaults.
* Deleted or inactive defaults are ignored.
* Organization defaults require an active organization and active membership.
* The user’s `primary_organization_id` determines which Organization defaults apply.
* The application must not choose an arbitrary organization when a user belongs to multiple organizations.
* An administrator viewing another user’s packet must not cause the administrator’s own defaults to be applied.

**Related files or migrations:**

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

## Visual My setup mode for scoped defaults

**Date:** 2026-07-20

**Decision:**  
Manage Personal/Organization preference defaults in a visual PDF My setup mode rather than a form-scoped long list. Legacy `form_id IS NULL` Personal defaults display as `Personal — applies to all forms` and are protected from ordinary form-level Clear. Global structural editing remains a separate Admin-only Edit Global Template mode.

**Reason:**  
Form-scoped long lists made intact all-forms defaults look missing when sparse field overlap left most rows blank. Users need PDF context and clear source labels. Form-level Clear must not destroy cross-form Personal preferences.

**Consequences:**

- `/forms/[id]/defaults` redirects to `/forms/[id]/editor?mode=my-setup`.
- My setup is available to authenticated users on active Global forms; it cannot mutate Global placements or mappings.
- Form-level Clear soft-deletes only form-scoped Personal rows.
- Personal placement overrides and full visual default editing remain Phase 2/3.

**Related files:**

* `components/forms/pdf-my-setup-editor.tsx`
* `lib/types/field-default-management.ts`
* `lib/field-defaults-management.ts`
* `app/forms/[id]/editor/page.tsx`
* `app/forms/[id]/defaults/page.tsx`
