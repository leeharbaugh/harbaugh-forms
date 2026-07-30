# Harbaugh Forms — Project Status

**As of:** 2026-07-30 (admin test-user / manual-create feature live on production)

## Current State

Harbaugh Forms is **live** for controlled **Lee-only** production use.

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

---

## Git State (documentation sync)

- Feature documentation updates for production status land via focused PRs into `main`
- Pre-launch merge tip for storage tooling: `db3a3f2` (PR #15) — subsequent commits may document launch status

## Historical Session Log

Detailed day-by-day session notes from June–July 2026 development (defaults UI, containment repairs, Listing/Contract cleanup, etc.) remain in Git history prior to the 2026-07-24 production-status documentation update. Statements in those historical entries about “no production environment” reflected the state **at the time of that session**, not the current live deployment.
