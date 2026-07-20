# Harbaugh Forms — Project Status

## Current State

Harbaugh Forms is a Texas real estate forms application built with:

- Next.js
- Supabase
- Vercel
- GitHub
- Cursor

## Git State

- `origin/main` tip:
  `ce8b59a` — includes merge of `admin-copy-user-form-to-global` (`5f23a3e`) and merge of `packet-form-lifecycle-locking` (`ce8b59a`)

- Residual documentation branch:
  `post-copy-global-smoke-docs` (from current `origin/main`)

- Previous feature branch (merged; do not re-merge as a feature):
  `admin-copy-user-form-to-global` @ `01d6780` (merged via `5f23a3e`)

- Corrective / related migrations on `harbaugh-forms-dev`:
  - `20260717120000_clear_global_money_zero_defaults.sql` (applied)
  - `20260717180000_clear_all_global_catalog_defaults.sql` (applied)
  - `20260717210000_repair_catalog_clear_overwritten_field_instances.sql` (applied; on `main`)
  - `20260717220000_repair_seller_not_foreign_checkbox.sql` (applied; on `main`)
  - `20260717230000_packet_form_lifecycle_locking.sql` (applied; on `main` from packet-form lifecycle locking — not a Copy-to-Global residual)

- Authenticated Copy-to-Global / containment smoke tests on `harbaugh-forms-dev` completed 2026-07-19 (see below). Core feature code is already on `origin/main`.

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
- `20260717220000_repair_seller_not_foreign_checkbox.sql`
- `20260717230000_packet_form_lifecycle_locking.sql`

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

**Admin Copy to Global Library with scoped field defaults**

Implemented on branch:

`admin-copy-user-form-to-global`

Current behavior:

- Admins see `Owned by [User Name]` for another user's private form.
- Active application admins may copy an eligible private form to the Global library.
- The source private form remains unchanged.
- The Global copy receives its own form record, PDF object, mappings, fields, and traceability.
- Preference defaults are excluded from the Global copy.
- Default values use `field_defaults` with only `PRIVATE` or `ORGANIZATION` scope.
- Private defaults override Organization defaults.
- The packet owner determines which defaults resolve, not the viewing admin.
- Global catalog preference literals are cleared; scoped Private/Organization `field_defaults` remain.
- Lee’s `CONTRACT_PROPERTY_AS_IS` Private default is preserved and notes finalized.
- Ordinary packet-form open/view/load inserts missing field instances only (`ensure_missing`) and does not UPDATE existing snapshots. Explicit editor “Refresh values” uses `refresh_non_overrides`.

Authenticated smoke tests for Copy to Global, scoped defaults, packet-snapshot containment, and ownership presentation completed 2026-07-19 on `harbaugh-forms-dev`. Feature code through `01d6780` is already on `origin/main` (`5f23a3e`). Do not merge `admin-copy-user-form-to-global` again as a feature branch.

### Confirmed packet-value incident (2026-07-17)

After Global catalog defaults were cleared, opening existing packet forms re-resolved non-override `field_instances` and overwrote stored values (including `NA` and a checked checkbox) with blank/false.

- Confirmed historical overwrites: **12** field instances total — **11** text/numeric (packet forms `28` and `61`) plus **1** checkbox (`SELLER_IS_NOT_FOREIGN_PERSON` on packet form `28`).
- The checkbox was missed in the initial audit because damage was checked→unchecked (`true`→`false` / `value_json.checked=false`), not blank text `NA`/`0`.
- At-risk text/numeric (still holding prior `NA`/`0`/`field_default`): unchanged by both repairs.
- One sibling at-risk checkbox instance (packet form `46`, still checked via `field_default_checked`) — **unchanged**.
- Five post-clear newly empty inserts — **not repaired** and remain empty.
- **Text/numeric repair on `harbaugh-forms-dev`:** migration `20260717210000_repair_catalog_clear_overwritten_field_instances.sql` restored all **11** rows (unchanged by the later checkbox migration).
  - Restored values: ten `NA`, one `0` (`CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT`).
  - Protection: `is_override = true`, `source = manual_override`.
- **Checkbox + Lee Private repair on `harbaugh-forms-dev`:** migration `20260717220000_repair_seller_not_foreign_checkbox.sql`.
  - Restored Abbas instance `045341ab-61a4-4070-93db-8eb3f0a08f15` to checked (`value=true`, `value_json.checked=true`, `is_override=true`, `source=manual_override`); `CREATE_DATE` preserved.
  - Created exactly one ACTIVE Lee Private `field_defaults` row (`default_checked=true`) for field `b0548c8b-c4f7-44f9-8328-9c14899e09e7` — restoration of a pre-multi-user Lee preference omitted from `20260715180000` when the catalog UUID was cleared without a Private insert.
  - Yahoo test user: no Private default for this field. Davey Organization defaults unchanged. Global catalog `default_checked` remains null. Opposite `seller_is_foreign_person` instance untouched.
  - Rows skipped: **none** (instance preconditions matched; Private insert path ran with prior_active=0).
- Manual UI verification of packet forms `28` and `61` completed during authenticated smoke tests (2026-07-19).
- Both repair migration files are applied on `harbaugh-forms-dev` and present on `origin/main` via merge `5f23a3e`.

### Authenticated smoke-test results (2026-07-19, `harbaugh-forms-dev`)

Driven in the Cursor browser against `harbaugh-forms-dev`. Roles exercised: application Admin (also an Org Admin of the brokerage) and a regular application User (organization MEMBER). Supporting read-only DB checks used the project’s server admin client.

- **Packet form 28 repaired snapshots — PASS.** Seven restored `NA` text overrides plus `SELLER_IS_NOT_FOREIGN_PERSON` checked (opposite foreign-person unchecked); rows `is_override=true`, `source=manual_override`.
- **Packet form 61 repaired snapshots — PASS.** Three `NA` overrides plus `CONTRACT_SELLER_EXPENSE_CONTRIBUTION_AMOUNT` = `0` (11 repaired text/numeric rows total matching `20260717210000`).
- **Sticky ordinary open — PASS.** Reopen left values and override flags unchanged; repaired rows’ `UPDATE_DATE` remained at the 2026-07-17 migration timestamps.
- **Explicit Refresh values — PASS.** Overrides preserved; Save stayed disabled when there was no non-override drift; repaired `UPDATE_DATE` unchanged.
- **Private vs Organization default resolution — PASS.** Admin-owned form 28 diagnostics showed `private_default` and `organization_default` sources as expected (Private beats Organization covered by unit tests).
- **Packet-owner resolution (Admin views another user’s packet) — PASS.** On the User-owned contract form, Admin Private defaults for the same field keys resolved to empty/false — no Admin default leak (`actingUserId` = packet owner).
- **Copy to Global Library — PASS.** Non-mutating preview excluded preference defaults and left the Private source unchanged; existing Global copy retains independent storage and traceability columns.
- **Ownership presentation — PASS.** Admin sees readable “Owned by …” for another user’s Private form; the owner sees ordinary Private presentation (no raw UUID, never “Mine”).
- **Authorization — PASS (Admin + User click-tested; Org-Admin-without-application-Admin automated).** Application Admin can offer Copy to Global. Regular User cannot. An `ORG_ADMIN` with application role `USER` is denied by UI gate (`isActiveAppAdmin` false → `canOfferCopyToGlobalLibrary` false) and by server `requireAppAdmin()` (`profiles.app_role === 'ADMIN'` required). Separate Org-Admin-only UI click-test remains optional.

**Overall:** Copy-to-Global / defaults / containment / ownership smoke coverage complete. Migration `20260717230000` belongs to packet-form lifecycle locking and already exists on `main`. This residual branch is documentation and authorization-test coverage only.

## Known Issues

- Authenticated Copy-to-Global / containment smoke tests completed 2026-07-19 (see above). Org-Admin-without-application-Admin is covered by a focused unit test; a dedicated UI click account is optional and non-blocking.
- Migration `20260717230000` was traced to `packet-form-lifecycle-locking` (`a38729c`) and is already on `origin/main`; it is not a Copy-to-Global residual and must not be reintroduced as a new change.
- At-risk text/numeric instances retain historical values under containment; no bulk rewrite planned.
- Full My Defaults / Organization Defaults management UI is deferred.
- Scoped source-mapping / manual-only overrides for Global forms (without editing Global PDF structure) are not implemented.
- Organization Admin membership/settings UI is missing (membership admin lives under Global Admin `/admin` only).
- Multi-organization users require a valid `profiles.primary_organization_id` with ACTIVE membership to inherit Organization defaults.
- `listing-packet-kind.test.ts` has a pre-existing bare-Node `@/lib` import-resolution problem.
- A pre-existing Next.js hydration warning has appeared around `AdminSectionNav` and the packet page.
- Specialized PDF editor dialogs do not yet have the full focus-trap behavior of `ConfirmDialog` and `InfoDialog`.
- `pdf-placement-form-fields.tsx` may contain line-ending churn that should be minimized before merge.
- Repo-wide `npm run lint` currently fails because ESLint scans `.next` build artifacts; targeted lint of changed source files is clean.

## Next Steps

1. Land residual branch `post-copy-global-smoke-docs` (smoke-test documentation + Org-Admin authorization unit test only). Do not re-merge `admin-copy-user-form-to-global` as a feature.
2. Authenticated UI smoke-test Mark Final, Reopen, Refresh confirmation, and Final read-only behavior for packet-form lifecycle locking (already on `main`).
3. Follow-up branches in priority order:
   1. My Defaults and Organization Defaults UI for Global forms.
   2. Global Admin / Organization Admin terminology and Organization Admin management surfaces.
   3. Admin ownership demarcation and saved Include user-owned filters.
   4. Refresh Values before/after field-diff preview.
   5. Evaluate scoped source-mapping / manual-only overrides without duplicating Global PDFs.
   6. Authentisign integration (may set `SIGNED`).

## Development Machine Checklist

Before making changes:

1. Clone or pull the GitHub repository.
2. Run `git fetch --all --prune`.
3. Check out `admin-copy-user-form-to-global`.
4. Confirm the branch includes the scoped-default corrective commit.
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
