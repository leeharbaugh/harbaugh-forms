# Harbaugh Forms — Project Status

## Current State

### Selective production migration preparation (2026-07-22)

- Final approved dataset: forms **1–18**; collections **1,2,3,5**; packets **2** and **5** (including DELETED packet forms **25** and **26**); contacts **2,3,4,6**; properties **1,3**; **101** ACTIVE defaults; Lee Auth UUID preserved.
- Forms **21, 22, 23** excluded — Lee will manually create any desired condo listing form after launch.
- Soft-deleted collections **4, 9, 12, 14** and test collection **7** excluded.
- Dev migration history repaired (`20260722190000`–`20260722210000` marked applied; 87 versions match).
- Tooling: `lib/selective-production/*`, export/import/auth/storage/validate scripts, `npm run test:selective-production`.
- Artifacts: `PRODUCTION_DATA_SELECTION_MANIFEST.json`, `SELECTIVE_PRODUCTION_DATA_MIGRATION_AUDIT.md`, `PRODUCTION_ROLLOUT_RUNBOOK.md`, updated `PRODUCTION_READINESS_AUDIT.md`.
- **Next manual step:** create production Supabase project (do not use `harbaugh-forms-dev` as target).

Harbaugh Forms is a Texas real estate forms application built with:

- Next.js
- Supabase
- Vercel
- GitHub
- Cursor

### Merge status (PR #2)

- PR [#2](https://github.com/leeharbaugh/harbaugh-forms/pull/2) — *Unify form mapping and scoped defaults workflow* — **squash-merged** into `main`.
- Merge commit: `5e0524b57d83c0f413ec55a7aa37577ff3aafc01`
- Local and remote `main` were synchronized after merge.
- Feature branch `defaults-management-ui` was deleted locally and remotely.

### Completed functionality (scoped defaults / Map Fields)

Merged work on `main` includes:

- One unified Forms → Map Fields workspace (PDF left / field cards right)
- Template terminology: **Filled from**, **Default if blank**, **Default source**
- Packets → Fill Form terminology: **Current value**, **Value source**, and **Default** for ambiguous legacy fallback/default snapshots
- Role-aware access for regular users, Organization Admins, and application Admins
- Personal and Organization scoped defaults in `field_defaults`
- Safe form-specific Personal default Clear; legacy all-forms Personal defaults protected
- Packet provenance display without ordinary-open snapshot rewriting
- Owner isolation (Admin viewing another user’s packet does not apply Admin defaults)
- No Global preference literals on catalog fields

### Final validation (PR #2)

- `npx tsc --noEmit` — pass
- `npm run test:field-defaults` — 66 pass
- `npm run test:field-defaults-management` — 43 pass
- `npm run test:form-copy-global` — 88 pass
- `npm run test:field-instance-sync` — 17 pass
- Focused provenance / Clear / legacy / zero / isolation / auth / precedence / immutability — 33 pass
- Targeted ESLint on changed source/test files — pass
- `npm run build` — pass

### Development database state (`harbaugh-forms-dev`)

- Global catalog preference literals: **0**
- Lee legacy all-forms Private defaults: **56** ACTIVE
- Reviewed Lee form-specific Private defaults: **19** ACTIVE
- Organization defaults: **4** ACTIVE
- No duplicate ACTIVE logical defaults
- Accidental `buyer_client_name_1` test row remains soft-deleted
- Disputed Listing mappings (`OTHER_FEES_REIMBURSABLE_EXPENSES`, `KNOWN_DISTRICTS`) received no defaults
- Packet instances remain unchanged on ordinary Fill Form open

### Environment

- Only `harbaugh-forms-dev` currently exists.
- There is **no production environment** and **no production deployment pending**.
- No immediate recreation of the 19 Personal defaults is required.
- When a production environment is eventually created, those 19 reviewed defaults must be intentionally included in the environment setup plan (approved manual configuration or an explicitly designed seeding process). Git does not transfer these database rows.

## Git State

- `origin/main` tip: `5e0524b57d83c0f413ec55a7aa37577ff3aafc01` — PR #2 squash merge (scoped defaults / unified Map Fields)
- No active feature branch for this work; `defaults-management-ui` was deleted after merge
- Prior merged feature branch (do not re-merge as a feature): `admin-copy-user-form-to-global` @ `01d6780` (merged via `5f23a3e`)

- Corrective / related migrations on `harbaugh-forms-dev`:
  - `20260717120000_clear_global_money_zero_defaults.sql` (applied)
  - `20260717180000_clear_all_global_catalog_defaults.sql` (applied)
  - `20260717210000_repair_catalog_clear_overwritten_field_instances.sql` (applied; on `main`)
  - `20260717220000_repair_seller_not_foreign_checkbox.sql` (applied; on `main`)
  - `20260717230000_packet_form_lifecycle_locking.sql` (applied; on `main`)

- Restore branches (history only):
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
- Unified Forms → Map Fields workspace with Personal/Organization defaults, role-aware field keys, packet value provenance, and Admin Clear (PR #2)
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
- Global catalog fields contain no user-preference defaults. There are currently **no approved Global preference literals**. Private and Organization defaults are stored only in scoped `field_defaults`.
- Source mappings (`source_type` / `source_path` / resolver keys) are not defaults and remain on Global fields.
- Copy to Global Library excludes all Private and Organization preference defaults and does not reintroduce catalog preference literals.
- Default resolution uses the packet owner or intended business user, not the viewing administrator.
- Product precedence (after current/manual override and mapped transaction data): mapping-scoped Personal → form-scoped Personal → legacy field-only Personal → mapping-scoped Organization → form-scoped Organization → legacy field-only Organization → blank.
- Persisted packet field instances are immutable during ordinary view/open. Resolution initializes missing instances only; existing values change only through explicit user-authorized editing or refresh.

### Administrative Roles

- Application role `profiles.app_role`: `USER` | `ADMIN` (application Admin / Global Admin).
- Organization membership role: `MEMBER` | `ORG_ADMIN` (Organization Admin).
- These axes are distinct; `ORG_ADMIN` is not equivalent to application `ADMIN`.
- Copy to Global Library and Global form mutation require application `ADMIN`.
- Organization defaults RLS allows Org Admin (own org) or application Admin.
- Unified Map Fields enforces structural vs preference permissions in the same workspace (server-side authorization is authoritative).
- Still deferred elsewhere: Organization Admin membership/settings UI (outside Map Fields), scoped source-mapping overrides without Global PDF edits, role-label polish.

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
- `20260721190000_remove_abandoned_contract_details_sources.sql` (64 `contract_details` fields → `manual_only`; Buyer Rep broker checkbox reactivated)

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
- Global catalog fields must not store preference literals (none approved).
- Persisted packet field instances are snapshots: ordinary open must not recalculate or overwrite them.
- Forms → Map Fields is the single workspace for Global structure and scoped defaults; `/forms/[id]/defaults` redirects into that workspace.

## Current Work

Source registry cleanup is on branch `remove-unused-source-registry-code` (see below). Brokerage legacy `default_*` removal is on `main` via PR #9.

### Source registry and resolver cleanup (2026-07-22)

- **Removed selectable source types:** `packet`, `static_default` (0 catalog fields; prefs use scoped `field_defaults`).
- **Converted:** 53 unreachable Listing/Lease `custom_resolver` fields → `manual_only` (no runtime implementation after listing-details removal).
- **Repaired:** `PROPERTY_ADDRESS` → `packet_property` + `full_address`.
- **Trimmed:** unused `CUSTOM_RESOLVER_KEYS` / dead resolver branches; added live `landlord_*` / `seller_city_state_zip` to the selector.
- **Catalog:** soft-deleted orphan `contract_*` `field_resolvers` rows; cleared FKs.
- **Preserved:** Buyer Rep / representation sources; live HOA/contact/settings resolvers; instance provenance `source='packet'` display labels; packet fingerprints unchanged (`527cf0d3…` / 1501).
- **Migration:** `20260722210000_remove_unused_source_registry_metadata.sql` (no CASCADE).
- **Tests:** `npm run test:source-registry-cleanup`.
- **Audit:** `SOURCE_REGISTRY_AND_RESOLVER_CLEANUP_AUDIT.md`.

### Prior: Brokerage legacy default columns removal (2026-07-22)

- **Dropped columns:** `default_market_area`, `default_buyer_rep_compensation_percent`, `default_protection_period_days`, `default_county_for_payment`, `default_employer_relocation`, `default_special_provisions`, `default_intermediary_allowed` (+ check `brokerage_settings_protection_period_non_negative`).
- **Retained:** all genuine brokerage/agent/broker/supervisor profile fields; Settings UI unchanged.
- **Evidence:** zero TypeScript refs, zero catalog `source_path`s, preferences already in scoped `field_defaults`.
- **Migration:** `20260722200000_remove_brokerage_legacy_default_columns.sql` (no CASCADE).
- **Tests:** `npm run test:brokerage-legacy-defaults-removal`.
- **Audit:** `BROKERAGE_SETTINGS_LEGACY_DEFAULTS_AUDIT.md`.

### Prior: Listing legacy workflow removal (2026-07-22)

- **Deleted rows:** `listing_agreement_details` id=`1` (hard delete); soft-deleted LISTING `representation_agreements` id=`2` and client links ids=`3`,`4`. Lee confirmed disposable development data — no export/archive.
- **Dropped:** `public.listing_agreement_details` (policies, triggers, indexes); `'listing_agreement_details'` removed from `fields_source_type_check`.
- **Catalog:** 8 DELETED fields normalized to `manual_only` / null path (status remains DELETED); 129 previously converted ACTIVE Listing fields unchanged.
- **App cleanup:** `/listing-agreements` route + components + Listing types/resolver helpers; Listing agreement-linked wizard branch; source registry/resolver dispatch.
- **Preserved:** collection-based Listing packets; Buyer Rep tables/route/`generatePacketFromAgreement` (Buyer Rep only); packet fingerprints (`527cf0d3…` / 1501 instances; packets `c26604e2…` / 17).
- **Migration:** `20260722190000_remove_listing_legacy_workflow.sql` (no CASCADE).
- **Tests:** `npm run test:listing-legacy-removal`.

### Prior: Contract Details architecture removal (2026-07-22)

- **Deleted:** empty `public.contract_details` table (policies, trigger, indexes, FKs/checks with the table); `'contract_details'` removed from `fields_source_type_check`.
- **Also converted:** 6 ACTIVE custom-resolver fields that only read the empty table (`contract_survey_option_1/2/3`, `contract_effective_day/month/year`) → `manual_only` with null path/resolver_key.
- **App cleanup:** source registry, resolver load/dispatch, `ContractDetails*` types module (contact helpers moved to buyer-rep helpers), UI source option “Contract details”.
- **Preserved:** 64 previously converted Contract catalog fields as `manual_only`; mappings/defaults/packet instances unchanged (fingerprint `527cf0d3…`, 1501 rows); `listing_agreement_details` untouched.
- **Migration:** `20260722180000_remove_contract_details_architecture.sql` (no CASCADE; refuses nonempty table).
- **Tests:** `npm run test:contract-architecture-removal` (+ prior `test:contract-source-removal`).

### Prior: Property HOA storage consolidation (2026-07-22)

- **Authoritative store:** `property_hoas` (multi-HOA schema retained). Property screen still shows one simple HOA form; temporary convention = first ACTIVE row by `create_date`, then `id`.
- **Writers:** Property create/edit/duplicate-update sync name/phone/management company through `lib/property-hoa-storage.ts`. Blank HOA Name soft-deletes the displayed row (`DELETED`); no hard delete; no multi-HOA UI.
- **Retired columns:** `properties.hoa_name`, `properties.hoa_phone`, `properties.hoa_management_company` (no backfill; Lee approved discarding disposable dev values — counts were 0).
- **Retained on properties:** `has_hoa`, `hoa_contact_name`, `hoa_email`, `hoa_website`, `hoa_dues_amount`, `hoa_dues_frequency`.
- **Resolver redirect:** `HOA_ASSOCIATION_NAME` and `txr_2001_hoa_name` → `custom_resolver` / `property_hoa_name`. Existing `property_hoa_name` / `property_hoa_phone` unchanged.
- **Safety:** field_instances fingerprint unchanged (1501 rows); mappings/defaults untouched; only `harbaugh-forms-dev`.
- **Migration:** `20260722120000_consolidate_property_hoa_storage.sql`
- **Tests:** `npm run test:property-hoa`

### Prior: Contract-source cleanup + Buyer Rep repair (2026-07-21)

Follow-up to the two audits (`MAPPING_INTEGRITY_AUDIT.md`, `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md`):

- **Contract conversion:** all **64** ACTIVE catalog fields with `source_type = 'contract_details'` (63 mapped on TXR-1601, plus unmapped `contract_effective_date`) converted to `manual_only` with null source paths by `20260721190000_remove_abandoned_contract_details_sources.sql`. Behavior already matched Fill Form / scoped defaults. Table and resolver infrastructure were later removed 2026-07-22 (see architecture removal above).
- **Buyer Rep checkbox:** `BUYER_REP_BROKER_SGN_CHECKBOX` reactivated as ACTIVE `manual_only` (accidental inactivation — matched the `20260701200000` AcroForm-pollution text heuristic while its hand-drawn mapping and 3 instances stayed ACTIVE). Mapping, coordinates, and instances untouched; unchecked by default; not Authentisign-excluded.
- **Verification:** full before/after row diff — 0 mappings, 0 instances, 0 defaults changed; defaults baseline intact (Global literals 0, Lee all-forms 56, Lee form-specific 19, Organization 4, no duplicates). Authenticated UI verification (Lee): Map Fields shows "Filled from: Not connected" with preserved `NA`/`0` Personal defaults on the six representative TXR-1601 fields; Fill Form ordinary open rewrote nothing; TXR-1501 p6 checkbox appears once, active, manual.
- **Tests:** `lib/contract-details-source-removal.test.ts` (21 tests) covers migration safety (exact ID set, allowed columns only, rerun safety, no Global literals) and defaults/snapshot behavior.
- **Not touched:** eventual `listing_agreement_details` table/route removal, the 75 V2 placement notes, HOA/property_hoas remapping, brokerage_settings legacy default columns, TXR-1102 scoped-default recreation.

### Prior: Admin Copy to Global Library with scoped field defaults

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

- Authenticated Copy-to-Global / containment smoke tests completed 2026-07-19. Org-Admin-without-application-Admin is covered by a focused unit test; a dedicated UI click account is optional and non-blocking.
- At-risk text/numeric instances retain historical values under containment; no bulk rewrite planned.
- Signature / initials fields are shown but not editable as preference defaults.
- System-wide defaults dashboard (cross-form) remains optional/deferred.
- Scoped source-mapping / manual-only overrides for Global forms (without editing Global PDF structure) are not implemented.
- Organization Admin membership/settings UI is missing (membership admin lives under Global Admin `/admin` only).
- Multi-organization users require a valid `profiles.primary_organization_id` with ACTIVE membership to inherit Organization defaults.
- Disputed Listing mappings on TXR-1101 `#7` (`OTHER_FEES_REIMBURSABLE_EXPENSES`, `KNOWN_DISTRICTS`): placements remain valid; catalog sources converted to `manual_only` on 2026-07-22 with Lee Personal form-specific `NA` defaults.
- `listing-packet-kind.test.ts` has a pre-existing bare-Node `@/lib` import-resolution problem.
- A pre-existing Next.js hydration warning has appeared around `AdminSectionNav` and the packet page.
- Specialized PDF editor dialogs do not yet have the full focus-trap behavior of `ConfirmDialog` and `InfoDialog`.
- Repo-wide `npm run lint` currently fails because ESLint scans `.next` build artifacts; targeted lint of changed source files is clean.

## Next Steps

1. Unused source types / custom resolvers not tied to Listing or Contract.
2. Personal placement overrides (deferred).
3. Future multi-HOA Property UI / optional primary-HOA designation (schema already supports multiple ACTIVE rows).
4. Production-environment rollout (include reviewed scoped defaults intentionally).
5. Possible future dedicated Listing transaction model only if a real business need emerges.
4. Restore Global position (deferred).
5. Optional improvement for genuinely Unknown legacy provenance wording.
6. Authenticated UI smoke-test Mark Final, Reopen, Refresh confirmation, and Final read-only behavior for packet-form lifecycle locking (already on `main`).
7. Follow-up product work in priority order:
   1. Global Admin / Organization Admin terminology and Organization Admin management surfaces.
   2. Admin ownership demarcation and saved Include user-owned filters.
   3. Refresh Values before/after field-diff preview.
   4. Evaluate scoped source-mapping / manual-only overrides without duplicating Global PDFs.
   5. Authentisign integration (may set `SIGNED`).
   6. Optional: cross-form defaults dashboard.
8. When a production environment is eventually created: include reviewed Lee Personal form-specific defaults (including the two 2026-07-22 Listing `NA` defaults and the **20** TXR-1102 Personal form-specific defaults) in the environment setup plan.

## Development Machine Checklist

Before making changes:

1. Clone or pull the GitHub repository.
2. Run `git fetch --all --prune`.
3. Check out `main` and confirm it matches `origin/main`.
4. Run `git status` and confirm the working tree is clean.
5. Use the Node.js version declared by the repository, such as `.nvmrc` or `package.json` `engines`.
6. Use the package manager indicated by the repository lockfile and run its clean-install command.
7. Restore `.env.local` securely; never commit it.
8. Confirm the Supabase project points to `harbaugh-forms-dev` (currently the only environment).
9. Confirm Supabase CLI authentication and project linkage.
10. Run `supabase migration list` and compare local and remote migration history before applying migrations.
11. Do not run `supabase db reset`, `supabase db push`, or migration-repair commands until the target project and migration state are verified.
12. Confirm GitHub authentication and push access.
13. Confirm Vercel project access if deployment inspection is needed.
14. Run:
    - `npx tsc --noEmit`
    - relevant automated tests
    - `npm run build`
15. Do not reset, recreate, or edit already-applied migrations.
16. Do not run destructive SQL against environments that hold real business data.

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
- Field defaults are Private or Organization, never Global; no approved Global preference literals.
- Copy to Global Library excludes all scoped preference defaults.
- Property uniqueness is enforced per owner using a normalized address.
- Administrative roles: Regular user / Organization Admin (`ORG_ADMIN`) / application Admin (`profiles.app_role = ADMIN`) are distinct axes.
- Persisted packet field instances are immutable during ordinary view/open; missing instances may be inserted, but existing snapshots change only via explicit edit/refresh.
- Unified Map Fields is the sole Global-form workspace for structure and scoped defaults (no separate Defaults / My setup workflow).
- Template language: **Filled from** / **Default if blank** / **Default source**; Fill Form: **Current value** / **Value source**; ambiguous legacy snapshots display **Default**.
- Form-specific Personal Clear does not delete legacy all-forms Personal defaults or Organization defaults.
- Detailed inventories and transition audit: `DEFAULT_TRANSITION_AUDIT.md` (and recovered classification companions).
- PDF placement and automatic business-data sourcing are independent; a null source path is valid for manual-only fields.
- Automatic sources only when a distinct upstream object/workflow owns the value independently from Fill Form; scoped defaults initialize values but are not source mappings.
- `contract_details` was abandoned architecture and has been removed (forward-only migration 2026-07-22); former catalog fields remain `manual_only`.
- Legacy Listing Agreement details workflow and `/listing-agreements` were removed 2026-07-22; current Listing packets are collection-based; Buyer Rep agreement architecture remains.

## Session History

### 2026-07-22 (add-txr-1102-scoped-defaults)

- Completed TXR-1102 scoped-default review + N1–N6 text-field context review (`TXR_1102_SCOPED_DEFAULT_REVIEW.md`).
- Created **20** Lee Personal form-specific ACTIVE defaults on Global TXR-1102 `#15`: 12×`NA`, protection period `30`, payment county `Dallas/Tarrant`, late-charges day `2`, and 5 checked elections (MLS immediately, keybox yes, intermediary yes, IABS, rent due first day).
- Intentionally left **10** conditional/Other/exclusive-branch text fields blank; `lease_mls_file_listing` unchecked; Organization Broker Bay preserved (no Personal duplicate).
- Historical TXR-1102 packet instances (300) unchanged after creation; ordinary open remains insert-only.
- Added `lib/txr-1102-scoped-defaults.test.ts` and npm script `test:txr-1102-scoped-defaults`.
- Durable blank-vs-NA / contractual-branch rule recorded in `decisions.md`. No migration required.

### 2026-07-22 (remove-listing-details-sources)

- Implemented Lee-approved selective `listing_agreement_details` cleanup after `LISTING_AGREEMENT_DETAILS_REVIEW.md`.
- Created two Lee Personal form-specific `NA` defaults via Map Fields (TXR-1101): `KNOWN_DISTRICTS`, `OTHER_FEES_REIMBURSABLE_EXPENSES`.
- Applied `20260722010000_remove_obsolete_listing_details_sources.sql` to `harbaugh-forms-dev`: **132** fields → `manual_only` (129 listing-details + 3 compensation custom-resolvers). Verified zero drift in mappings (869), instances (1497), historical details row, Organization defaults (4), and Lee legacy all-forms Private (56); form-specific Private 19→21.
- Authenticated Map Fields verification: TXR-1101 and TXR-1102 converted fields show "Filled from: Not connected"; disputed pair show Default if blank `NA` / Personal.
- Added `lib/listing-details-source-removal.test.ts` and npm script `test:listing-source-removal`.
- Durable decisions recorded in `decisions.md`. Table/legacy route retained; TXR-1102 defaults deferred; HOA remapping deferred.

### 2026-07-21 (remove-abandoned-contract-details-sources)

- Completed both read-only audits from a verified clean state: `MAPPING_INTEGRITY_AUDIT.md` (869 mappings: 793 V1 / 75 V2 / 1 R7; disputed TXR-1101 mappings proven valid) and `SOURCE_OBJECT_ARCHITECTURE_AUDIT.md` (`contract_details` = abandoned B5; `listing_agreement_details` mixed; single active-mapping→inactive-field anomaly).
- Applied `20260721190000_remove_abandoned_contract_details_sources.sql` to `harbaugh-forms-dev`: 64 contract fields → `manual_only`, Buyer Rep broker checkbox reactivated. Verified zero drift in mappings, instances, and defaults via full row diff; authenticated UI verification passed (Map Fields + Fill Form).
- Added `lib/contract-details-source-removal.test.ts` (21 tests) and npm script `test:contract-source-removal`.
- Durable decisions recorded in `decisions.md`: placement/sourcing independence, defaults are not source mappings, null source path is valid for manual-only, `contract_details` abandoned, Buyer Rep reactivation rationale.

### 2026-07-20 (PR #2 merged — documentation sync context)

- Squash-merged PR #2 into `main` as `5e0524b` (“Unify form mapping and scoped defaults workflow”).
- Feature branch deleted (local + remote). Local `main` synchronized with `origin/main`.
- Environment: only `harbaugh-forms-dev`; no production environment; no pending production deployment or immediate default recreation.
- Deferred after merge: disputed Listing mappings; Personal placement overrides; Restore Global position; optional Unknown legacy provenance wording.
- Earlier session notes below retain historical “branch unmerged” wording from before the merge; current status is above.

### 2026-07-20 (defaults-management-ui legacy Default label)

- Work completed:
  - Packets → Fill Form user-facing provenance: generic legacy `field_default` / `fallback` / `field_default_checked` sources now display as **Default** instead of **From fallback**.
  - Known `private_default` / `organization_default` labels unchanged (`From your default` / `From organization default`).
  - Presentation-only: no packet instance rewrites; Why this value? avoids “fallback” wording for the generic Default case.
- Database changes:
  - None.
- Branch remains unmerged: `defaults-management-ui`.

### 2026-07-20 (defaults-management-ui unified workflow smoke)

- Work completed:
  - Authenticated smoke on `harbaugh-forms-dev` for unified Map Fields + restored Personal defaults.
  - **Lee (App Admin + Org Admin):** Form Templates actions are `Map Fields` / `Edit` / `Delete` only (no separate Defaults / My setup). Forms `#1`, `#7`, `#11`, `#18` load the unified workspace. Cards use Filled from / Default if blank / Default source; no Current value / Value source / occurrence / placement count. Field keys visible. All **19** restored Personal form-specific defaults display correctly (`Personal`, not all-forms); zeros show as `0`; disputed Listing fields remain None.
  - **Clear defect (Admin):** Admin structural Map Fields lacked Clear; non-admin My setup already had it. Added **Clear personal default** on Admin cards, wired to existing `clearPrivateFormDefault` (form-scoped only; legacy all-forms protected). Disposable create/clear cycle verified; accidental Clear of `BUYER_REP_RETAINER_AMOUNT` during broken automation finder was restored to Personal `0`.
  - **Admin Edit separation:** Structural Edit = Section A placement + Section B Filled from + Remove from this form. Edit default = My default / Organization default write target with explicit org selector. Not confused with Clear.
  - **Yahoo (USER/MEMBER):** No Admin nav; field keys hidden; no Remove / Place field; Personal Edit only (no Organization write target). Lee’s 19 values do not appear (Retainer / Property exclusions / Service reimbursement show None).
  - **Packet Fill Form (`#14` / form `49`):** Current value + Value source labels present; no raw source paths. Sources observed: Entered manually, From client, From property, Default (legacy `field_default` snapshots), Blank, Unknown. Why this value? explains stored provenance without implying recalculation.
  - **Snapshot safety:** field_instance `a9a87123-…` (`CONTRACT_PROPERTY_EXCLUSIONS`) unchanged after open (`value=NA`, `source=field_default`, `update_date` unchanged).
  - **Disputed Listing mappings:** ACTIVE overlays labeled `¶5E` / `¶12K` still selectable; Lee reports not visibly represented — recommend later deactivate/cleanup; not changed in this smoke.
- Database changes:
  - No migrations. Data: Clear UI exercise only; retainer Personal `0` re-saved after accidental soft-delete during smoke.
- Validation:
  - `npx tsc --noEmit` — pass
  - `npm run test:field-defaults` — 61 pass
  - `npm run test:field-defaults-management` — 38 pass
  - `npm run test:form-copy-global` — 88 pass
  - `npm run test:field-instance-sync` — 17 pass
  - Focused clear/zero/isolation/provenance — 11 pass
  - ESLint `pdf-field-editor.tsx` — pass
  - `npm run build` — pass
- Branch remains unmerged: `defaults-management-ui`.

### 2026-07-20 (defaults-management-ui reviewed Personal default restoration)

- Work completed:
  - Transition omission audit reviewed by Lee; approved Personal **form-specific** restorations created via Map Fields → Edit default (Lee session) on `harbaugh-forms-dev`.
  - **19** Private ACTIVE form-scoped defaults created (Buyer Rep `#1`: 5; Listing `#7`: 5; One to Four `#11`: 6 including `contract_title_objection_use_activity`; Residential Lease `#18`: 3).
  - Values: text `NA` / text `"0"` / currency `"0"` as approved; scope PRIVATE; no `form_field_mapping_id`; no Global catalog literals; no all-forms rows.
  - Disputed Listing fields `OTHER_FEES_REIMBURSABLE_EXPENSES` and `KNOWN_DISTRICTS`: Lee reports not visible on TXR-1101; ACTIVE estimated/paragraph mappings remain; **no defaults created**; classified hidden/non-visible — structural cleanup deferred.
  - `contract_title_objection_use_activity`: Lee explicitly chose Personal form-specific `NA` even though not a proven catalog omission.
  - Integrity: Global catalog defaults null; mappings unchanged; packets unchanged; Lee’s **56** legacy all-forms Private unchanged; Organization **4** unchanged; no duplicate ACTIVE logical rows among the 19.
  - Audit artifact updated: `DEFAULT_TRANSITION_AUDIT.md` (+ recovered classification companions).
- Database changes:
  - Data only on `harbaugh-forms-dev` (`field_defaults` inserts for the 19; one accidental `buyer_client_name_1` form-scoped row soft-deleted). No migrations. No Global preference literals.
- Validation:
  - `npx tsc --noEmit` — pass
  - `npm run test:field-defaults` — 61 pass
  - `npm run test:field-defaults-management` — 38 pass
  - `npm run test:field-instance-sync` — 17 pass
- Deferred:
  - Structural review/deactivation of disputed Listing mappings; Admin Map Fields Clear control gap.
- Branch remains unmerged: `defaults-management-ui`.

### 2026-07-20 (defaults-management-ui field source language + unified editor)

- Work completed:
  - Unified Form Templates entry to **Map Fields** (removed separate Defaults / My setup actions).
  - Legacy `/forms/[id]/defaults` redirects to `/forms/[id]/editor`.
  - Template cards use **Filled from**, **Default if blank**, **Default source**; no Current value / Value source in template editor.
  - Role-aware Edit: regular users Personal only; Org Admins My default vs Organization default; App Admins Global automatic source (+ defaults on structural Map Fields).
  - Fill Form shows **Current value** and **Value source** with readable labels; optional **Why this value?** disclosure.
  - Shared pure helpers in `lib/types/field-provenance-labels.ts` (+ tests).
  - Lee legacy `form_id IS NULL` Personal defaults remain labeled and Clear-protected; no packet snapshot rewrites.
- Database changes:
  - None (no migration).
- Deferred:
  - Personal placement overrides; Restore Global position; optional richer Fill Form Default if blank without extra queries.
- Branch remains unmerged: `defaults-management-ui`.

### 2026-07-20 (defaults-management-ui Phase 1 visual My setup)

- Work completed:
  - Diagnosed apparent Lee default loss: data intact (56 ACTIVE legacy Private, `form_id IS NULL`); sparse form-scoped long-list UI made values look gone.
  - Added visual **My setup** mode at `/forms/[id]/editor?mode=my-setup` (PDF + field cards, bidirectional selection, no Global structural edits).
  - Legacy defaults labeled `Personal — applies to all forms`; form-level Clear cannot soft-delete legacy all-forms rows.
  - `/forms/[id]/defaults` redirects to My setup; Forms list Defaults links updated.
  - Role-aware field key display (admins/Org Admins only); no occurrence/placement-count on cards.
- Database changes:
  - None (no migration; Lee legacy rows untouched — reconfirmed 56 ACTIVE).
- Deferred:
  - Phase 2 form-scoped editing / Org mode / Use organization default.
  - Phase 3 Personal placement overrides.
- Branch remains unmerged: `defaults-management-ui`.

### 2026-07-19 (defaults-management-ui authenticated smoke)

- Work completed:
  - Authenticated smoke tests on `harbaugh-forms-dev` for form-level defaults UI.
  - Roles: application Admin (`lee@leeharbaugh.com`, also ORG_ADMIN) and regular USER/MEMBER (`leeharbaugh@yahoo.com`). No ORG_ADMIN-without-app-Admin account exists.
  - Primary Global form: `#1 Buyer Rep Agreement (TXR-1501)`. Also checked `#2` (empty mapped fields), `#7` (form-scoping), `#21` Private (defaults blocked).
  - Fixed duplicate DOM ids on Private/Organization headings vs inputs.
- Results (summary):
  - Entry point: Global forms offer Defaults; Private `#21` does not; direct `/forms/21/defaults` rejected.
  - Private create/update/clear: PASS (soft-delete; CREATE_DATE preserved on update; no catalog writes).
  - Checkbox true / false / cleared: PASS (false distinct from cleared).
  - Currency zero vs cleared / nonzero `12.50` / `99`: PASS.
  - Date `2026-08-15` save/reload: PASS; `NA` rejected by validation (date input also blocks free-text NA).
  - Member org read-only + RLS denial of org/GLOBAL/other-private inserts: PASS.
  - Private overrides Organization then clear restores Organization: PASS.
  - Admin org selector (single org: Davey Goosmann Realty), named (no UUID in page text), org save/clear soft-delete: PASS.
  - Form scoping: form `#1` Private default does not appear on form `#7` for same field: PASS.
  - Legacy `form_id IS NULL` ACTIVE defaults (~60) still participate via pickBest fallback; form-scoped rows win for that form.
  - Packet immutability: packet_form `8` instance for `buyer_rep_lease_flat_fee` unchanged after default change to `99` (value `0`, `UPDATE_DATE` 2026-07-03 unchanged).
  - Catalog literals for tested fields remained null.
- Unresolved / limited:
  - No second organization for Admin selector switch UI.
  - No ORG_ADMIN-only UI click account.
  - Disposable missing-instance init not manufactured (avoid historical packet surgery).
  - Admin viewer isolation relied on existing automated coverage + prior Copy-to-Global smoke.
- Branch remains unmerged: `defaults-management-ui`.

### 2026-07-20 (defaults-management-ui smoke-data cleanup)

- Work completed:
  - Read-only inventory of Form `#1` smoke-test `field_defaults` on `harbaugh-forms-dev`.
  - Cleared two remaining ACTIVE temporary Yahoo Private rows (currency `99`, date `2026-08-15`) via soft-delete matching `clearPrivateFormDefault`.
  - Text/checkbox/org smoke rows were already `DELETED` from the 2026-07-19 UI session; retained for audit.
- Data integrity:
  - Catalog fields, mappings, packet instances, legacy `form_id IS NULL` defaults (~60 ACTIVE), and Lee preexisting defaults unchanged.
  - Yahoo has zero ACTIVE scoped defaults after cleanup; Lee legacy `PAYMENT_COUNTY` / checkbox defaults still resolve for Lee only.
- Branch remains unmerged: `defaults-management-ui`.

### 2026-07-19 (defaults-management-ui)

- Work completed:
  - Branch `defaults-management-ui` from synchronized `main` (`3c19062`).
  - Form-level defaults management for Global forms at `/forms/[id]/defaults`.
  - Server actions for load / save / clear Private and Organization defaults (soft-delete clear; no catalog writes; no packet refresh).
  - Forms list **Defaults** entry point for active Global forms.
  - Focused unit tests in `lib/field-defaults-management.test.ts`.
- Files changed:
  - `lib/types/field-default-management.ts`
  - `lib/field-defaults-management.ts`
  - `lib/field-defaults-management.test.ts`
  - `app/forms/[id]/defaults/page.tsx`
  - `components/forms/form-defaults-manager.tsx`
  - `components/forms/forms-page.tsx`
  - `package.json`
  - `project_status.md`
  - `decisions.md`
- Database changes:
  - None (no new migration).
- Tests performed:
  - `npx tsc --noEmit` — pass
  - `npm run test:field-defaults` — pass (41)
  - `npm run test:field-defaults-management` — pass (18)
  - `npm run test:form-copy-global` — pass (76)
  - `npm run test:field-instance-sync` — pass (17)
  - Targeted ESLint on changed files — pass
  - `npm run build` — pass
- Unresolved issues:
  - Authenticated smoke tests still required before merge.
- Next action:
  - Run the authenticated smoke-test checklist; do not merge.

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
