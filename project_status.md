# Harbaugh Forms — Project Status

**As of:** 2026-07-29

## Current State

Harbaugh Forms is **live** for controlled **Lee-only** production use.

### Admin brokerage / TREC / audit phase (development only — 2026-07-29)

**Feature branch:** `feature/admin-brokerage-trec-audit`  
**Starting commit:** `7a7baced48d2631167fdb6d82c29479a41912e07` (main tip at branch create)  
**Branch status:** development implementation reviewed, committed, and pushed for Preview; **not merged**; **not deployed to production**; **no production migration applied**.

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
| Supabase production migrations | **Manual / deliberate only** (`supabase db push` against linked prod or runbook). Never automatic on git push |
| Dangerous scripts | `npm run import:approved-production-data`, `migrate:approved-auth`, `sync:condo-txr-1605-prod`, etc. require explicit execution + `.env.production.local` |
| Env distinction | Preview/local → `harbaugh-forms-dev` / `ewxsxwzezhkeawnjvigx`; Production → `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` + production Vercel env |

**Safeguard used:** verified CLI link + `.env.local` host before `db push`; refused any production target; no merge to `main`.

#### Final review corrections (2026-07-29)

* Fixed TREC `LAST, FIRST MIDDLE` name parsing (`parseTrecFullName`) so autofill does not treat the surname as a given name.
* Manual license entry is always available in the invite UI (not only after a failed search).
* Audit date filters ignore invalid date strings instead of throwing.
* Re-marked `lib/trec/lookup.ts` as `server-only`.
* Candidate list now shows related/sponsoring broker when present.

#### Schema (development applied)

Migration: `20260729210000_brokerage_offices_trec_audit.sql`

| Change | Detail |
|--------|--------|
| `brokerage_offices` | New table (org FK, address, phone, optional branch license, `is_main_office`, soft-delete status, dates) |
| `organization_members.brokerage_office_id` | Nullable FK + org-match trigger |
| `user_agent_settings` | TREC verification metadata columns |
| `organizations` | Broker TREC verification metadata columns |
| `audit_settings` | Singleton ordinary-logging toggle |
| `audit_events` | Append-only business audit log (RLS: admin select; authenticated insert/update/delete denied) |
| DGR seed | Existing Davey Goosmann Realty org **not duplicated**; seeded `Main Office` + Lee membership office assignment |

**Compatibility:** legacy `brokerage_settings` singleton retained for form resolvers. Multi-user brokerage master records remain `organizations` (`organization_type = BROKERAGE`). Form fill still reads licenses from `brokerage_settings` until a later deliberate resolver migration.

#### Pages / routes added

| Route | Purpose |
|-------|---------|
| `/admin/brokerages` | Global Admin brokerage list (active/inactive) |
| `/admin/organizations/[id]` | Extended with offices CRUD + designated broker display |
| `/admin/audit` | Audit log + ordinary-logging setting |
| `/admin/users` | Invite flow: office select + TREC lookup / manual override |
| `POST /api/admin/trec-lookup` | Authenticated Global Admin TREC Open Data lookup |

#### Authorization / RLS

- Brokerage office mutate: `is_app_admin()` only
- Office select: app admin or active org member
- Audit settings / cross-org audit events: app admin only
- Audit event insert via authenticated role: **denied** (trusted service-role writes only)
- Audit append-only trigger blocks UPDATE/DELETE
- TREC routes: `requireAppAdmin()`
- Org deactivate blocked while active members/invites remain unless acknowledged
- All `/admin/*` routes gated by `requireAppAdminPage()` in admin layout

#### TREC integration

- Official dataset `s7ft-44qi` via Socrata (`data.texas.gov`)
- Server-side only; optional `TREC_SODA_APP_TOKEN` / `TEXAS_OPEN_DATA_APP_TOKEN`
- SALE + BRK only; explicit admin selection; manual override with reason; sponsorship mismatch is warning only
- Automated tests use mocked responses (no live Open Data dependency)
- Live TREC smoke verification deferred to Preview manual checklist

#### New / related env vars (names only)

| Variable | Env | Required? |
|----------|-----|-----------|
| `TREC_SODA_APP_TOKEN` or `TEXAS_OPEN_DATA_APP_TOKEN` | Dev now; Prod later | Optional (higher rate limits) |
| Existing Supabase + site URL vars | unchanged | Yes |

#### Tests / build (final validation)

| Suite | Result |
|-------|--------|
| `npm run test:brokerage-trec-audit` | **17 pass** |
| `npm run test:admin-invite` | **14 pass** |
| `npm run test:admin-orgs` | **4 pass** |
| `npm run test:field-defaults` | **77 pass** |
| `npm run test:field-defaults-management` | **43 pass** |
| `npm run test:form-copy-global` | **89 pass** |
| `npm run test:field-instance-sync` | **17 pass** |
| `npm run test:library-permissions` | **13 pass** |
| `npx tsc --noEmit` | **pass** |
| ESLint on changed sources | **pass** |
| `npm run build` | **pass** (recorded after final review) |

#### Development data checks (final)

| Check | Result |
|-------|--------|
| DGR org count (license 9006865) | **1** (not duplicated) |
| Dee broker on org | present (`0283607`) |
| Lee agent | present (`0712335`) |
| Main Office seeded | yes; Lee membership assigned |
| Dev packets / packet_forms / field_instances | **8 / 33 / 1502** (unchanged by this work) |

#### Commit / push / Preview

| Item | Status |
|------|--------|
| Feature commit | `7cbb964bec3d2ac09599a1e52d6af1185232a232` (tip includes docs: `7ea2f6935804627125054f04bf7649f34f4e3246`) |
| Remote branch | `origin/feature/admin-brokerage-trec-audit` |
| Preview Deployment | **success** — https://harbaugh-forms-rkeiryubg-lee-harbaugh-s-projects.vercel.app (prior docs-push Preview also succeeded; Vercel dashboard for tip: https://vercel.com/lee-harbaugh-s-projects/harbaugh-forms/ESCuXku4HX8Ui3nii8UcptqBUAXa) |
| Production rollout | **still pending / not authorized** |

#### Remaining Preview smoke tests

Lee should run the Preview checklist after the Preview URL is available (brokerages, offices, TREC invite, audit toggle, non-admin denial, existing packets).

#### Unresolved risks / deferred

- Form resolvers still use legacy `brokerage_settings` singleton (not yet org/office-aware)
- Business-entity / branch license types (BLLC, REB, etc.) not modeled beyond optional `branch_license_number`
- No production rollout yet
- Broader DB integration tests for RLS insert-deny rely on policy SQL + service-role writer pattern

#### Production rollout steps (**not performed**)

1. Lee review of branch + Preview smoke tests
2. Merge to `main` only after approval (deploys app code; still does not migrate DB)
3. Link CLI to `harbaugh-forms-prod` deliberately; verify ref `eetonalyyyssvkyfdoxh`
4. Apply `20260729210000_brokerage_offices_trec_audit.sql` to production only
5. Set optional production TREC app token
6. Smoke-test admin brokerages, invite+TREC, audit toggle on production
7. Confirm DGR / Lee / Dee unchanged; packet fingerprints unchanged

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
- Packets may be collection-backed or **Custom** (`packet_type = custom`, no collection, zero initial forms; documents via existing external upload on `packet_forms`)
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

1. Monitor real-world Lee-only production use; review runtime logs periodically
2. Verify production invite email template uses TokenHash + `type=invite` + `next=/auth/update-password`, then run one brand-new invitation smoke test
3. Treat the two previously failed invitees with Resend invitation or password recovery (do not create duplicate Auth users)
4. Add error tracking before broader multi-user exposure
5. Establish production backup/restore procedures
6. Consider paid tiers only when recovery, usage, or SLA requirements justify them
7. Review Mapbox domain restrictions if map behavior fails on the custom domain

## Deferred Product Work

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
- Optional for TREC lookup rate limits: `TREC_SODA_APP_TOKEN` or `TEXAS_OPEN_DATA_APP_TOKEN`

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

---

## Git State (documentation sync)

- Feature documentation updates for production status land via focused PRs into `main`
- Pre-launch merge tip for storage tooling: `db3a3f2` (PR #15) — subsequent commits may document launch status

## Historical Session Log

Detailed day-by-day session notes from June–July 2026 development (defaults UI, containment repairs, Listing/Contract cleanup, etc.) remain in Git history prior to the 2026-07-24 production-status documentation update. Statements in those historical entries about “no production environment” reflected the state **at the time of that session**, not the current live deployment.
