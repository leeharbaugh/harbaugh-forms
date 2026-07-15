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
  `b1264c9ea02b61d6894693c32ec2be1aa2d21168`

- Active feature branch:
  `admin-copy-user-form-to-global`

- Active feature branch commit:
  `8e85c0d2915afe250f41dac5948ed5c018ea5494`

- Feature branch is pushed to:
  `origin/admin-copy-user-form-to-global`

- Do not merge yet. Final default-value classification, authenticated browser smoke testing, and final validation remain.

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
- Global forms retain only structural field and placement metadata.
- Copy to Global Library excludes all Private and Organization preference defaults.
- Default resolution uses the packet owner or intended business user, not the viewing administrator.
- Global literal values must be audited to distinguish structural constants from personal or brokerage preferences.

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

This branch must not be merged until final classification corrections and authenticated smoke tests are complete.

## Known Issues

- Final human classifications remain:
  - `CONTRACT_PROPERTY_AS_IS` should remain Lee's Private default.
  - `BUYER_REP_RETAINER_AMOUNT = 0` should not remain a Global structural value.
  - `CONTRACT_SERVICE_CONTRACT_REIMBURSEMENT_AMOUNT = 0` should not remain a Global structural value.
- Full My Defaults / Organization Defaults management UI is deferred.
- Multi-organization users require a valid `profiles.primary_organization_id` to inherit Organization defaults.
- `listing-packet-kind.test.ts` has a pre-existing bare-Node `@/lib` import-resolution problem.
- A pre-existing Next.js hydration warning has appeared around `AdminSectionNav` and the packet page.
- Specialized PDF editor dialogs do not yet have the full focus-trap behavior of `ConfirmDialog` and `InfoDialog`.
- `pdf-placement-form-fields.tsx` may contain line-ending churn that should be minimized before merge.

## Next Steps

1. On `admin-copy-user-form-to-global`, run the final scoped-default correction prompt.
2. Add a new corrective migration if the two Global numeric-zero defaults must be cleared.
3. Audit all remaining Global field and mapping literals.
4. Run the admin Copy to Global browser smoke test.
5. Run the Davey member default-resolution smoke test.
6. Confirm Lee's Private defaults are invisible to other users.
7. Run TypeScript, ESLint, production build, and relevant automated tests.
8. Review the final branch diff.
9. Fast-forward merge only after all checks pass.
10. Build the defaults-management UI as a separate later feature.

## Development Machine Checklist

Before making changes:

1. Clone or pull the GitHub repository.
2. Run `git fetch --all --prune`.
3. Check out `admin-copy-user-form-to-global`.
4. Confirm HEAD is `8e85c0d2915afe250f41dac5948ed5c018ea5494`.
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
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Confirm any additional Mapbox, application URL, and auth redirect variable names from `.env.example`, `.env.local`, and code references before beginning work on the new machine.

## Recent Decisions

- Forms remain statewide Global or user Private.
- Collections are Organization or Private, never Global.
- Field defaults are Private or Organization, never Global.
- Copy to Global Library excludes all scoped preference defaults.
- Property uniqueness is enforced per owner using a normalized address.

## Session History

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