# Harbaugh Forms — Project Status

**As of:** 2026-07-24

## Current State

Harbaugh Forms is **live** for controlled **Lee-only** production use.

### Development condo contract catalog (2026-07-24)

Development-only work on `harbaugh-forms-dev` created ACTIVE Global form **TXR-1605** / TREC 30-18 (development form id **24**, version `TXR-1605-05-04-2026`) with Lee’s supplied `CondoListing.pdf`, **13** new Global condo fields, and **158** ACTIVE mappings (approved corrections from the 161-row inventory). See `CONDO_TXR_1605_FIELD_INVENTORY.md` and `CONDO_TXR_1605_DEVELOPMENT_IMPLEMENTATION.md`. **Not synchronized to production.**

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

- Forms: `GLOBAL` or `PRIVATE`
- Collections: `ORGANIZATION` or `PRIVATE` (never `GLOBAL`)
- Organization members may view, use, and privately copy organization collections
- `ORG_ADMIN` manages collections for their own organization; application admins may manage across organizations

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

Visual PDF field editor is the primary workflow. Ignore signature/initial lines for standard extraction (Authentisign). Do not pursue AI-generated coordinates as the primary path.

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
- Packet templates and generated packets; organization/membership administration
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

1. Monitor real-world Lee-only production use; review runtime logs periodically
2. Test the invitation workflow before adding another user
3. Configure custom SMTP before inviting additional users
4. Add error tracking before broader multi-user exposure
5. Establish production backup/restore procedures
6. Consider paid tiers only when recovery, usage, or SLA requirements justify them
7. Review Mapbox domain restrictions if map behavior fails on the custom domain

## Deferred Product Work

- Manually finish Map Fields placement + defaults for development TXR-1605 condo contract, then plan selective production form update (stable identity; do not duplicate production form)
- Listing addendum forms 21–23 remain separate from the condo sales contract path
- Optional multi-HOA Property UI / primary-HOA designation
- Optional Listing inverse-checkbox automation
- Possible future dedicated Listing transaction model (only if a real business need emerges)
- Optional resolver-catalog cleanup / unification
- Buyer Rep preference/default architecture review if still relevant
- Dependency upgrades before broader multi-user exposure if advisories remain
- Personal placement overrides / Restore Global position (deferred)
- Organization Admin membership/settings UI (outside Map Fields); Global Admin / Org Admin terminology polish
- Scoped source-mapping overrides without duplicating Global PDFs
- Optional cross-form defaults dashboard
- Authentisign integration (may set `SIGNED`)
- Refresh Values before/after field-diff preview
- Optional Unknown legacy provenance wording improvement

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
4. Restore `.env.local` securely (never commit). For production ops tooling only, use gitignored `.env.production.local`
5. Confirm local Supabase targets **`harbaugh-forms-dev`** (`ewxsxwzezhkeawnjvigx`) unless an explicit production-ops task says otherwise
6. Confirm Supabase CLI auth/link; compare migration history before applying migrations
7. Do not run `supabase db reset`, reckless `db push`, or migration-repair until target and history are verified
8. Confirm GitHub and Vercel access when needed (`harbaugh-forms` project only for this app)
9. Run `npx tsc --noEmit`, relevant tests, and `npm run build` as appropriate
10. Do not reset or edit already-applied migrations; do not run destructive SQL against environments with real business data

## Required Local Environment Variables

Document names only; never store values in Git.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`

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
- Invitation-only access; HostPapa DNS changes limited to intended subdomain records

---

## Git State (documentation sync)

- Feature documentation updates for production status land via focused PRs into `main`
- Pre-launch merge tip for storage tooling: `db3a3f2` (PR #15) — subsequent commits may document launch status

## Historical Session Log

Detailed day-by-day session notes from June–July 2026 development (defaults UI, containment repairs, Listing/Contract cleanup, etc.) remain in Git history prior to the 2026-07-24 production-status documentation update. Statements in those historical entries about “no production environment” reflected the state **at the time of that session**, not the current live deployment.
