# Harbaugh Forms — Project Status

## Current State

Harbaugh Forms is a Texas real estate forms application built with:

- Next.js
- Supabase
- Vercel
- GitHub
- Cursor

## Git State

- Main branch commit:
  `ce8b59af4ca6281472126c8b089019e154fb2e71`

- Active feature branch:
  `manage-scoped-field-defaults` (from `origin/main`)

- Retained feature branches:
  - `packet-form-lifecycle-locking` @ `a38729c` (merged to main)
  - `admin-copy-user-form-to-global` @ `01d6780`

- Corrective migrations on `harbaugh-forms-dev`:
  - `20260717120000_clear_global_money_zero_defaults.sql` (applied)
  - `20260717180000_clear_all_global_catalog_defaults.sql` (applied)
  - `20260717210000_repair_catalog_clear_overwritten_field_instances.sql` (applied)
  - `20260717220000_repair_seller_not_foreign_checkbox.sql` (applied)
  - `20260717230000_packet_form_lifecycle_locking.sql` (applied)

- Restore branches:
  - `pre-ui-refresh` → `f422fce79227220377729654824930c86082107e`
  - `pre-ui-refresh-multi-user` → `0a86d6d6a801f8b0a83d63346bb4cae40dd5edef`

## Completed Features

- Multi-user authentication and ownership
- Clients and contacts CRUD
- Properties CRUD
- Owner-scoped normalized property-address uniqueness
- Buyer Representation Agreements
- Listing Agreements
- Form Templates
- Global and private form libraries
- Form-field mappings
- Visual PDF field editor
- Packet Templates
- Generated Packets
- Organization and membership administration
- Organization-scoped collections
- Packet form document lifecycle locking (Draft / Final / Signed / Void)
- Manage Defaults for Global forms (My Defaults / Organization Defaults) — in progress on branch
- Private and organization collection copying
- Application-admin management
- Soft-delete patterns
- Database-backed user preferences
- Resizable table-column preferences
- Global form-copy traceability
- Scoped Private and Organization field defaults
- Completed UI refresh Phases 1–4

## Current Architecture

### Database

- Supabase PostgreSQL
- Row Level Security
- Soft deletes using status fields
- `CREATE_DATE` and `UPDATE_DATE` fields
- User preferences stored in `public.user_preferences`

### Form and Collection Scope

- Forms may be `GLOBAL` or `PRIVATE`.
- Collections may be `ORGANIZATION` or `PRIVATE`.
- Collections must not be created as `GLOBAL`.
- Organization members may view, use, and privately copy organization collections.
- `ORG_ADMIN` members may manage collections only for their own organization.
- Application admins may manage organization collections across organizations.
- Global collection creation is blocked.

### Form Default Scope

- Form default values may be `PRIVATE` or `ORGANIZATION`, but never `GLOBAL`.
- Private defaults override Organization defaults.
- Organization defaults apply only through an active primary-organization membership.
- Global catalog fields contain no user-preference defaults. Private and Organization defaults are stored only in scoped `field_defaults`. Global catalog `default_value`, `default_checked`, and `fallback_value` may be retained only when deliberately classified as structural constants.
- Source mappings (`source_type` / `source_path` / resolver keys) are not defaults and remain on Global fields.
- Copy to Global Library excludes all Private and Organization preference defaults and does not reintroduce catalog preference literals.
- Default resolution uses the packet owner or intended business user, not the viewing administrator.
- Final 2026-07-17 classifications:
  - `CONTRACT_PROPERTY_AS_IS` remains Lee’s PRIVATE default (`default_checked = true`).
  - All remaining ACTIVE Global catalog `default_value` / `default_checked` / `fallback_value` literals are cleared (no approved structural constants found).
- Persisted packet field instances are immutable during ordinary view/open. Resolution initializes missing instances only; existing values change only through explicit user-authorized editing or refresh.

### Administrative Roles (audit 2026-07-17)

- Application role `profiles.app_role`: `USER` | `ADMIN` (Global Admin).
- Organization membership role: `MEMBER` | `ORG_ADMIN` (Organization Admin).
- These axes are distinct; `ORG_ADMIN` is not equivalent to application `ADMIN`.
- Copy to Global Library and Global form mutation require application `ADMIN`.
- Organization defaults RLS allows Org Admin (own org) or application Admin.
- Missing on later branches: defaults UI, Org Admin membership UI, scoped source-mapping overrides, role-label polish.

### Copy Private Form to Global Library

- Copying a private form to the Global library creates a separate independent form.
- The source form keeps its scope, owner, PDF, mappings, and defaults.
- The Global copy receives a new form ID, Storage path, mappings, appropriate field references, and traceability.
- Preference defaults are not copied.
- Collections and packets are not modified automatically.
- Source and copy do not synchronize after creation.

### Property Address Uniqueness

- A user may have only one non-deleted property for a normalized physical address.
- The database enforces uniqueness by owner, street, unit, city, state, and ZIP5.
- Different users may independently store the same address.
- Deleted records do not block a replacement.
- Restore and address-edit operations enforce the same uniqueness rule.

### PDF Forms

The current direction is a visual PDF field editor.

The application should allow users to:

1. Open a PDF form.
2. Add text and checkbox fields visually.
3. Store field coordinates behind the scenes.
4. Map fields to business data.
5. Reuse fillable templates.

Signature and initial field types may be supported later, but current standard field extraction and mapping should ignore signature and initial lines because Authentisign handles them separately.

Do not pursue AI-generated coordinate mappings as the primary workflow.

## Recent Database Migrations

Applied to `harbaugh-forms-dev`:

- `20260715120000_organization_collections_and_property_uniqueness.sql`
- `20260715140000_form_copy_to_global_traceability.sql`
- `20260715180000_field_defaults_scoped.sql`
- `20260717120000_clear_global_money_zero_defaults.sql`
- `20260717180000_clear_all_global_catalog_defaults.sql`
- `20260717210000_repair_catalog_clear_overwritten_field_instances.sql`

Do not edit already-applied migrations. Add a new corrective migration when needed.

Before applying migrations from a different development machine, compare local and remote migration history.

## Important Business Rules

- Do not permanently delete business records.
- Use status or active fields for soft deletion.
- Use `NA` only where the form and established business rule require a nonblank not-applicable value.
- Do not use `NA` for monetary, checkbox, date, or other fields where blank, zero, or false has a distinct meaning.
- Ignore signature and initial lines during standard PDF field extraction because Authentisign handles them.
- HOA name and phone belong to property data.
- HOA Addendum transaction selections belong to packet-specific data.
- Admins viewing another user's private form should see the owner's identity rather than `Mine`.
- Copying a private form to the Global library creates a separate Global copy and preserves the original.
- Forms may be Global or Private; collections may be Organization or Private.
- Default values may be Private or Organization, but never Global.
- Global catalog fields must not store preference literals unless deliberately classified as structural constants.
- Persisted packet field instances are snapshots: ordinary open must not recalculate or overwrite them.

## Current Work

The active feature is:

**Manage Defaults for Global forms (My Defaults / Organization Defaults)**

- Branch: `manage-scoped-field-defaults` (from `origin/main` @ `ce8b59a`).
- Feature status: implemented, committed, and pushed to
  `origin/manage-scoped-field-defaults`. **Not merged.** Merge is blocked until the
  full authenticated edit/isolation/permissions smoke test passes.

Route and entry point:

- New route `/forms/[id]/defaults`.
- Global Forms list exposes a **Manage Defaults** action for any viewer who can see
  the Global form (`canOpenManageDefaults`).

Behavior implemented:

- Writes go only to scoped `field_defaults` (PRIVATE / ORGANIZATION), field-level
  (`form_id IS NULL`, `form_field_mapping_id IS NULL`).
- My Defaults available to every authenticated user; Organization Defaults editing
  limited to `ORG_ADMIN` of the primary org (or Global Admin); members see inherited
  Organization values read-only.
- Organization Defaults use the active primary organization; a missing/stale primary
  shows a warning and never silently falls back to another organization.
- Private beats Organization; explicit Private blank overrides an Organization value;
  text zero and checkbox false are preserved as meaningful values.
- Checkbox tri-state (Inherit / Checked / Unchecked), text Inherit / Use value /
  Use blank, per-field Save and soft Remove (return to inherited), shared-field
  warnings, and an unmapped-orphan-defaults section.
- Does **not** modify Global catalog fields, `default_value`/`default_checked`,
  mappings, PDF coordinates, or persisted packet snapshots.

Verification this session:

- After a clean local development-server restart, the Manage Defaults page displays
  Lee's existing Private defaults correctly (text, number, and checkbox).
- No schema migration was required; `field_defaults` already exists on
  `harbaugh-forms-dev` (migration `20260715180000_field_defaults_scoped.sql`, already
  in `main`). No migration was added on this branch.
- Automated tests, ESLint (changed files), `tsc --noEmit`, and `npm run build` all
  pass (see Session History).
- Database counts unchanged: Lee Private 56 ACTIVE, Yahoo Private 0, Davey
  Organization 4 ACTIVE, Global catalog preference literals 0.

**Outstanding before merge:** full authenticated edit/isolation/permissions smoke
test (below). Do not merge until it passes. Do not claim it has passed.

Deferred (not in this version):

- Form-specific (per-form) defaults editing UI.
- Multi-organization picker for Organization Defaults.
- Read-only PDF field highlighting.
- Batch save / autosave.
- Defaults for Private forms.
- Dedicated account-level hub for unmapped orphan defaults.
- Scoped source-mapping / manual-only overrides for Global forms.

## Next Steps

1. Approve, commit, and push `manage-scoped-field-defaults` after smoke tests.
2. Follow-up branches in priority order:
   1. Form-specific defaults editing (resolver already supports it).
   2. Account-level hub for unmapped orphan defaults (reduce per-form redundancy).
   3. Global Admin / Organization Admin terminology and Organization Admin management surfaces.
   4. Admin ownership demarcation and saved Include user-owned filters.
   5. Refresh Values before/after field-diff preview.
   6. Evaluate scoped source-mapping / manual-only overrides without duplicating Global PDFs.
   7. Authentisign integration (may set `SIGNED`).
   8. Multi-organization picker for Organization Defaults.

## Known Issues

- Authenticated browser smoke tests for Manage Defaults remain.
- At-risk historical packet text/numeric instances retain values under containment; no bulk rewrite planned.
- Form-specific defaults editing is deferred (resolver already supports it).
- Unmapped orphan defaults appear on each Global form defaults page (account-wide); a dedicated hub would reduce redundancy.
- Scoped source-mapping / manual-only overrides for Global forms are not implemented.
- Organization Admin membership/settings UI is missing (membership admin lives under Global Admin `/admin` only).
- Multi-organization users require a valid `profiles.primary_organization_id` with ACTIVE membership to inherit Organization defaults.
- `listing-packet-kind.test.ts` has a pre-existing bare-Node `@/lib` import-resolution problem.
- A pre-existing Next.js hydration warning has appeared around `AdminSectionNav` and the packet page.
- Specialized PDF editor dialogs do not yet have the full focus-trap behavior of `ConfirmDialog` and `InfoDialog`.
- Repo-wide `npm run lint` currently fails because ESLint scans `.next` build artifacts; targeted lint of changed source files is clean.

## Development Machine Checklist

Before making changes:

1. Clone or pull the GitHub repository.
2. Run `git fetch --all --prune`.
3. Check out `manage-scoped-field-defaults`.
4. Confirm the branch is based on latest `origin/main` (`ce8b59a` or newer).
5. Run `git status` and confirm the working tree is clean.
6. Use the Node.js version declared by the repository, such as `.nvmrc` or `package.json` `engines`.
7. Use the package manager indicated by the repository lockfile and run its clean-install command.
8. Restore `.env.local` securely; never commit it.
9. Confirm the Supabase project points to `harbaugh-forms-dev`.
10. Confirm Supabase CLI authentication and project linkage.
11. Run `supabase migration list` and compare local and remote migration history before applying migrations.
12. Do not run `supabase db reset`, `supabase db push`, or migration-repair commands until the target project and migration state are verified.
13. Confirm GitHub authentication and push access.
14. Confirm Vercel project access if deployment inspection is needed.
15. Run:
    - `npx tsc --noEmit`
    - relevant automated tests
    - `npm run build`
16. Do not reset, recreate, or edit already-applied migrations.
17. Do not run destructive SQL tests against production.

## Required Local Environment Variables

Document variable names only; never store values in Git.

Known required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`

Confirm any additional Mapbox, application URL, and auth redirect variable names from `.env.example`, `.env.local`, and code references before beginning work on the new machine.

## Recent Decisions

- Forms remain statewide Global or user Private.
- Collections are Organization or Private, never Global.
- Field defaults are Private or Organization, never Global.
- Copy to Global Library excludes all scoped preference defaults.
- Property uniqueness is enforced per owner using a normalized address.
- Final classification (2026-07-17): Lee’s `CONTRACT_PROPERTY_AS_IS` stays Private; all Global catalog preference literals cleared unless deliberately classified as structural constants (none retained).
- Administrative roles: Regular user / Organization Admin (`ORG_ADMIN`) / Global Admin (`profiles.app_role = ADMIN`) are distinct axes.
- Persisted packet field instances are immutable during ordinary view/open; missing instances may be inserted, but existing snapshots change only via explicit edit/refresh.

## Session History

### 2026-07-17 (manage-scoped-field-defaults wrap-up)

- Branch `manage-scoped-field-defaults` from `origin/main` @ `ce8b59a`.
- Feature: Manage Defaults for Global forms (My Defaults / Organization Defaults).
  - Route `/forms/[id]/defaults`; Forms-list **Manage Defaults** entry via
    `canOpenManageDefaults`.
  - Field-level scoped writes only (`form_id`/`form_field_mapping_id` null);
    Private beats Organization; explicit Private blank override; text zero and
    checkbox false preserved; soft remove returns to inheritance.
  - Organization Defaults require an ACTIVE primary-organization membership; no
    silent fallback. Global catalog fields/mappings/coordinates and packet
    snapshots untouched.
- Diagnosis follow-up: after a clean local dev-server restart, Lee's existing
  Private defaults display correctly on applicable Global forms (text, number,
  checkbox). End-to-end trace (DB → RLS → loader → DTO → initial UI state) verified
  under Lee's authenticated session.
- No schema migration required or added (`field_defaults` already in `main`).
- Files changed (feature/tests/docs/config only):
  - `app/forms/[id]/defaults/page.tsx`
  - `components/forms/form-defaults-page.tsx`
  - `components/forms/forms-page.tsx`
  - `lib/field-defaults-actions.ts`
  - `lib/field-defaults-editor.ts`
  - `lib/library-permissions.ts`
  - `lib/library-permissions.test.ts`
  - `lib/types/field-defaults-manage.ts`
  - `lib/types/field-defaults-manage.test.ts`
  - `package.json`, `tsconfig.json`
  - `project_status.md`, `decisions.md`
- Validation:
  - ESLint (changed TS/TSX): pass.
  - `npm run test:field-defaults-manage`, `test:field-defaults`,
    `test:packet-form-lifecycle`, `test:field-instance-sync`,
    `test:form-copy-global`: pass.
  - `npx tsc --noEmit`: pass. `npm run build`: pass.
- Database (unchanged; no test/diagnostic records created):
  - Lee Private 56 ACTIVE, Yahoo (`leeharbaugh@yahoo.com`) Private 0,
    Davey Organization 4 ACTIVE, non-Lee Private 0, Global catalog literals 0.
- Unresolved / merge blocker:
  - Full authenticated edit/isolation/permissions smoke test not yet performed.
    Do not merge until it passes.
- Next action:
  - Run the authenticated smoke-test checklist; only then consider merge.

### 2026-07-17 (packet-form lifecycle locking)

- Work completed (uncommitted):
  - Branch `packet-form-lifecycle-locking` from `origin/main`.
  - DRAFT/FINAL locking for edits, Refresh Values, and missing-instance sync.
  - Mark Final / Reopen to Draft with confirmations; Refresh help + confirmation.
  - DB RLS + transition trigger migration `20260717230000`.
- Unresolved:
  - Commit/push; authenticated UI smoke tests.
- Next action:
  - Approve commit/push after smoke tests.

### 2026-07-17 (checkbox + Lee Private restoration)

- Work completed:
  - Identified 12th incident damage: Abbas `SELLER_IS_NOT_FOREIGN_PERSON` checkbox overwritten to false (missed earlier due to false/null semantics).
  - Applied forward-only `20260717220000_repair_seller_not_foreign_checkbox.sql`: restored checked override on instance `045341ab-…`; inserted Lee Private `default_checked=true` omitted from scoped migration.
  - Verified Yahoo has no Private default; Davey org defaults fingerprint unchanged; Global catalog literals remain 0; sibling + opposite + prior 11 fingerprints unchanged.
  - Added regression tests for Private resolution, Yahoo exclusion, listing-detail override precedence, Copy-to-Global exclusion, and override stickiness on open/refresh.
- Unresolved:
  - Commit/push of both repair migrations and related docs/tests.
  - Manual UI verification of packet forms `28` and `61`.
- Next action:
  - Approve commit/push; smoke-test repaired checkbox + defaults locally.

### 2026-07-17 (evidence-based packet-instance repair)

- Work completed:
  - Re-verified all 11 damaged instances still matched the incident blank/`empty` state.
  - Applied forward-only migration restoring 11 historical values (10× `NA`, 1× `0`) with `is_override = true`.
  - Confirmed 32 at-risk rows, 5 post-clear empties, Global catalog clears, scoped defaults, and mappings unchanged.
- Unresolved:
  - Commit/push of the repair migration.
  - Manual UI verification of packet forms `28` and `61`.
- Next action:
  - Approve commit/push; smoke-test repaired forms locally.

### 2026-07-17 (packet-instance containment)

- Work completed:
  - Confirmed open/sync re-resolution overwrote historical packet values after Global catalog clear.
  - Implemented ordinary-open insert-only synchronization (`ensure_missing`); existing snapshots are sticky.
  - Kept editor “Refresh values” as explicit `refresh_non_overrides`.
  - Recorded the packet-snapshot rule in `DECISIONS.md`.
- Unresolved:
  - Deploy containment to `harbaugh-forms-dev` environment.
  - Evidence-based repair of 11 confirmed overwritten instances.
  - 32 at-risk instances remain until containment is live and repair policy is approved.
- Next action:
  - Approve/commit/push/deploy containment before opening existing forms or repairing data.

### 2026-07-17 (Global catalog default cleanup)

- Work completed:
  - Audited ACTIVE Global catalog fields for `default_value`, `default_checked`, and `fallback_value`.
  - Found no explicitly approved structural constants; cleared all remaining Global catalog preference literals.
  - Preserved scoped Private/Organization `field_defaults` and all source/PDF mappings.
  - Recorded the confirmed Global-catalog rule in `DECISIONS.md`.
  - Documented role-model audit conclusions and follow-up branch sequence.
- Unresolved:
  - Authenticated smoke tests.
- Next action:
  - Containment deploy, then smoke tests / data repair.

### 2026-07-17

- Work completed:
  - Inspected live `fields` / `field_defaults` for the three classified keys.
  - Preserved Lee PRIVATE `CONTRACT_PROPERTY_AS_IS` and finalized its notes.
  - Added and applied forward-only corrective migration clearing two Global money-zero catalog defaults.
  - Expanded focused automated tests for resolution, ownership, and Copy-to-Global preference exclusion.
  - Moved pure default helpers into `lib/types/field-default.ts` so Node tests resolve without `@/` value imports.
- Files changed:
  - `supabase/migrations/20260717120000_clear_global_money_zero_defaults.sql`
  - `lib/types/field-default.ts`
  - `lib/field-defaults.ts`
  - `lib/field-defaults.test.ts`
  - `lib/admin/copy-form-to-global.ts`
  - `PROJECT_STATUS.md`
- Database changes:
  - Applied `20260717120000_clear_global_money_zero_defaults.sql` to `harbaugh-forms-dev`.
- Tests performed:
  - `npm run test:field-defaults` (16 pass)
  - `npm run test:form-copy-global` (27 pass)
  - `npx tsc --noEmit` (pass)
  - Targeted ESLint on changed source files (pass)
  - `npm run build` (pass)
- Unresolved issues:
  - Authenticated smoke tests still require manual login sessions.
- Next action:
  - Run the authenticated smoke-test checklist and report results before merge.

### 2026-07-15

- Work completed:
  - Merged organization collections and property uniqueness to `main`.
  - Implemented Copy to Global Library on the feature branch.
  - Added scoped Private and Organization field defaults.
  - Excluded preference defaults from Global form copying.
- Files changed:
  - Form ownership and copy helpers
  - Forms list UI
  - Field-default types and resolution
  - Database migrations and tests
- Database changes:
  - Applied organization collection and property uniqueness migration.
  - Applied Global form-copy traceability migration.
  - Applied scoped field-default migration.
- Tests performed:
  - TypeScript
  - ESLint
  - Production build
  - Form-copy tests
  - Field-default tests
  - Library permissions
  - UI lists
  - Form controls
  - Storage paths
  - Property-address tests
  - Related regression suites
- Unresolved issues:
  - Final classification and cleanup of two Global numeric-zero values.
  - Final authenticated admin and member smoke tests.
  - Full defaults-management UI remains deferred.
- Next action:
  - Run the final scoped-default correction and merge-review prompt on `admin-copy-user-form-to-global`.
