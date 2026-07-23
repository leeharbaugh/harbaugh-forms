# Production Readiness Audit — Harbaugh Forms

**Audit date:** 2026-07-22  
**Mode:** Read-only (no code, database, storage, Auth, Vercel, DNS, or environment changes)  
**Repository HEAD:** `a883898a380937457e863dc3eb09244f0a54f6a2` (`main` = `origin/main`)  
**Current Supabase project:** `harbaugh-forms-dev` (`ewxsxwzezhkeawnjvigx`, region `us-east-1`, Postgres 17.6.x) — **only** linked project  
**Planned domain:** `forms.harbaughrealestate.com`  
**Deployment platform:** Vercel  

Secret values are never recorded here; only variable names and masked descriptions.

### 2026-07-22 update — selective production data (final)

Lee’s **final** production selection is encoded in:

- `PRODUCTION_DATA_SELECTION_MANIFEST.json` (`unresolvedConflicts: []`)
- `SELECTIVE_PRODUCTION_DATA_MIGRATION_AUDIT.md`
- `PRODUCTION_ROLLOUT_RUNBOOK.md`

**Final forms:** migrate **1–18** only. **Exclude 21, 22, 23** (Lee will manually create any condo form later). No form-23 lineage transform.

**Final collections:** migrate **1, 2, 3, 5**. Exclude **4, 7, 9, 12, 14**.

**Packets:** 2 and 5 only; packet forms **25 and 26** migrate as **DELETED**.

**Defaults:** **101** ACTIVE (unchanged by form 21–23 exclusion — none were scoped to those forms).

**Auth:** preserve Lee UUID `e26c8f57-…` / identity `b1c72b22-…` (Option A).

**Dev migration history:** repaired — versions `20260722190000`, `20260722200000`, `20260722210000` marked applied; local↔remote match (87).

**Tooling:** `lib/selective-production/*` + scripts under `scripts/*approved*` / `validate-production-migration` / `copy-approved-storage` (dry-run safe; production execute gated until project exists).

---

## Executive Summary

Harbaugh Forms is **ready for production project creation** after selective-migration tooling lands on `main`, provided Vercel/DNS/env (B4–B6) are configured at cutover.

The application architecture supports a clean split:

| Environment | Supabase | Purpose |
|---|---|---|
| Local + Vercel Preview | `harbaugh-forms-dev` | Development and PR previews |
| Vercel Production | **new** production project (not created) | Live `forms.harbaughrealestate.com` |

**Primary remaining platform steps before go-live:**

1. ~~Repair `harbaugh-forms-dev` migration history~~ → **Done** (2026-07-22).
2. ~~Auth UUID strategy~~ → **Done:** preserve Lee UUID via selective Auth migration.
3. Create production Supabase + run selective Auth/data/storage tooling per runbook.
4. Configure Vercel Production/Preview env scopes and Auth Site URL / redirect allow-list.
5. Patch Next.js / sharp advisories before any non-Lee external use (acceptable risk for Lee-only initial smoke with awareness).

**Not blockers for Lee-only initial use:** public SMTP for invitations; Dee Davey invite; paid plan upgrades; `field_resolvers` catalog redesign.

**Verdict:** Selective migration preparation complete when tooling PR merges →  
`SELECTIVE PRODUCTION MIGRATION TOOLING READY — CREATE PRODUCTION SUPABASE NEXT`.

---

## Production Blockers

| ID | Item | Why blocking | Action | Owner |
|---|---|---|---|---|
| B1 | Migration history drift on `harbaugh-forms-dev` | Versions `20260722190000`, `20260722200000`, `20260722210000` changed the database via direct SQL but were **absent** from `supabase_migrations.schema_migrations` | **Repaired 2026-07-22** via `supabase migration repair --status applied --linked` | Done |
| B2 | Hard-coded Auth UUID in migrations | Phase A multi-user, scoped defaults, and repair migrations assume Lee user `e26c8f57-…` and org seed | **Resolved (2026-07-22):** pin/preserve existing UUID via selective Auth migration (Option A). Adaptive new-UUID bootstrap is stale. | Done (data plan); implement later |
| B3 | Canonical PDF assets not in migrations | Buckets created by SQL; **19** Global PDFs live only in Storage (`form-templates` / `global/forms/…`) | Production needs an explicit storage copy or upload script after schema apply | Lee + implementation |
| B4 | Vercel Production env / project linkage unverified | No local `.vercel` link; CLI not authenticated; no `vercel.json` | Inspect Vercel dashboard; set Production → prod Supabase, Preview → `harbaugh-forms-dev` | Lee |
| B5 | Production Auth Site URL / redirects unset | New project defaults to localhost / empty; app uses `NEXT_PUBLIC_SITE_URL` or origin | Set Site URL + redirect allow-list to `https://forms.harbaughrealestate.com/**` (and temporary `*.vercel.app` during cutover) | Lee at Supabase dashboard |
| B6 | `NEXT_PUBLIC_SITE_URL` missing from current `.env.local` | Admin invite redirects fall back to `http://localhost:3000` | Add to Production (required) and Preview/local (recommended) | Lee |

---

## Environment Variables

| Variable | Locations | Purpose | Browser? | Dev | Preview | Prod | Secret? | Current source | Differs prod? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/*`, admin, scripts | Project API URL | Yes | Req | Req | Req | No (URL) | `.env.local` → `harbaugh-forms-dev` | **Yes** | New production project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `lib/supabase/env.ts`, proxy | Anon/publishable key | Yes | Req | Req | Req | Public key | `.env.local` | **Yes** | Rotate with new project; never commit |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Docs / legacy name | Same role as publishable | Yes | Optional | Optional | Optional | Public | Docs only | Yes | Prefer publishable naming |
| `SUPABASE_SECRET_KEY` | `lib/supabase/admin.ts`, scripts | Service role / secret | **Server only** | Req | Req | Req | **Yes** | `.env.local` | **Yes** | Never `NEXT_PUBLIC_*` |
| `SUPABASE_SERVICE_ROLE_KEY` | Fallback in admin.ts | Legacy name for secret | Server only | Optional | Optional | Optional | **Yes** | Fallback | Yes | Prefer `SUPABASE_SECRET_KEY` |
| `NEXT_PUBLIC_SITE_URL` | `app/admin/actions.ts` | Absolute origin for invites | Yes | Rec. | Rec. | **Req** | No | **Missing** locally | **Yes** | Prod: `https://forms.harbaughrealestate.com` |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | `lib/mapbox-address.ts` | Address autocomplete | Yes | Rec. | Rec. | Rec. | Token (restrict) | `.env.local` | Maybe | Restrict by URL in Mapbox; can share token with URL allow-list |
| `OPENAI_API_KEY` | `.env.local` only | **Unused in app code** | — | No | No | **No** | Yes | `.env.local` orphan | — | Do **not** add to Vercel |
| `VERCEL_URL` / `VERCEL_ENV` / `VERCEL_PROJECT_PRODUCTION_URL` | `app/layout.tsx`, tutorial components | Platform-injected | Yes | N/A | Auto | Auto | No | Vercel | Auto | Do not hard-code |
| `NODE_ENV` | Various | Build/runtime mode | — | Auto | Auto | Auto | No | Runtime | Auto | |
| DB URLs / pooler | Supabase CLI `.temp` | Migrations / CLI only | No | CLI | — | CLI | **Yes** | Supabase dashboard / CLI | Yes | Not required in Next.js runtime if using JS client only |
| Auth redirect vars | Supabase dashboard | Site URL / allow list | N/A | Dashboard | Dashboard | Dashboard | No | Dev dashboard (not dumped) | **Yes** | Manual per project |

**Recommended Vercel scopes**

| Scope | Supabase | `NEXT_PUBLIC_SITE_URL` |
|---|---|---|
| Development (local) | `harbaugh-forms-dev` | `http://localhost:3000` |
| Preview | `harbaugh-forms-dev` | Preview deployment URL or omit (use `window.location.origin` where possible) |
| Production | **new** production project | `https://forms.harbaughrealestate.com` |

**Rotation:** Create production keys only in the new project; do not reuse development secret key. Rotate Mapbox URL restrictions when domain goes live.

---

## Vercel Configuration

| Item | Current state | Production requirement | Action | Blocker |
|---|---|---|---|---|
| Project name / team | Not readable (CLI unauthenticated; no `.vercel/`) | Linked to `leeharbaugh/harbaugh-forms` | Lee verify in dashboard | B4 |
| Production branch | Expected `main` | `main` → Production | Confirm | B4 |
| Preview | Expected PR/branch deploys | Non-`main` → Preview → **dev** Supabase | Confirm env scopes | B4 |
| `vercel.json` | Absent | Optional; Next defaults OK | None required | — |
| Framework | Next.js (`next` latest / 16.x in lockfile) | Same | Keep | — |
| Build | `next build` (npm `build`) | Same | Keep | — |
| Install | npm (lockfile present) | `npm ci` preferred in CI | Prefer clean install | — |
| Node | Not pinned in repo (`engines` / `.nvmrc` absent) | Pin LTS (e.g. 22) in Vercel | **Recommend pin** | Important soon |
| Domains | Unknown | Add `forms.harbaughrealestate.com` | After prod project | Stage 5 |
| Cron / Edge config | None in repo | None required for launch | — | — |
| Middleware | `proxy.ts` session refresh via `@supabase/ssr` | Same | Keep | — |
| Hard-coded preview URLs | Tutorial/`deploy-button` starter kit leftovers | Cosmetic; not runtime | Optional cleanup later | Info |

**Recommended architecture:** Production vars → production Supabase; Preview + local → `harbaugh-forms-dev`.

---

## Supabase Configuration

| Item | Development (`harbaugh-forms-dev`) | Production recreate | Source |
|---|---|---|---|
| Project ref | `ewxsxwzezhkeawnjvigx` | New ref | Dashboard |
| Region | `us-east-1` | Prefer same (`us-east-1`) | Dashboard |
| Postgres | 17.6.x | Same major | Platform |
| Linked | Yes (only project) | New link for prod tooling | CLI |
| Auth users | 2 (`lee@leeharbaugh.com` ADMIN, `leeharbaugh@yahoo.com` USER) | Lee only initially | Auth |
| Organizations | Davey Goosmann Realty (ACTIVE); Test org (INACTIVE) | Seed DGR only | DB / seed |
| Extensions / RLS | Enabled via migrations | Via migration chain | Migrations |
| Storage buckets | `form-templates` (private, 38 objs, ~11 MB); `generated-documents` (private, 104 objs, ~42 MB) | Create via migrations; copy Global PDFs only | Migrations + copy |
| Storage RLS | Path-aware (`global/forms/…`, user paths) Phase C | Via migrations | `20260713240000_…` |
| Edge Functions | None observed in repo | None for launch | — |
| SMTP | Assume Supabase built-in (dashboard not read) | Built-in OK for Lee-only; custom SMTP before outside invites | Dashboard |
| Site URL / redirects | Dev localhost / Vercel (not dumped) | Production domain | Dashboard |
| Connection pooling | Pooler host in CLI temp | Use pooler for any direct SQL tooling | Dashboard |

**Manual vs migration:** Schema, RLS, buckets, catalog fields/mappings → migrations. Auth users, org membership after Auth UUID known, Storage PDF bytes, Site URL/SMTP → **manual / scripts**.

---

## Migration Chain

| Metric | Value |
|---|---|
| Total migration files | **87** |
| Chronological order | Unique timestamps; no duplicate version collisions observed |
| Local ↔ remote sync | Matched through `20260722180000`; **three later versions local-only in history table** despite schema effects |
| Clean empty-project apply | **Schema + Global catalog: likely yes** via `supabase db push` / ordered apply |
| Hard-coded Lee UUID | `20260713200000`, `20260715180000`, `20260717120000`, `20260717220000`, others |
| Hard-coded org name/id assumptions | Davey Goosmann Realty; collection migration checks org name |
| Yahoo UUID | `20260717220000` repair references Yahoo for isolation tests |
| Development-only data inserts | Brokerage profile seed text; org/profile seed; field_defaults seed; not packets |
| Catalog field/mapping seeds | Many TXR migrations insert Global fields + mappings with stable UUIDs (**SD1**) |
| Non-idempotent risk | Some `raise exception` guards; cleanup migrations expect prior state |
| Removed tables in chain | `contract_details`, `listing_agreement_details` created then dropped later — **keep full history** |

### Recommendation: **P1 — Use full historical migration chain**

**Why P1 over P2**

| Criterion | P1 full history | P2 clean baseline |
|---|---|---|
| Reproducibility | Matches what built `harbaugh-forms-dev` | Must hand-craft snapshot |
| Auditability | Preserves cleanup trail | Loses intermediate intent |
| Dev compatibility | Same files continue local/dev | Dual maintenance risk |
| Risk of omitting cleanup | Low if all 87 applied | High if baseline incomplete |
| Empty-project success | Needs **Auth bootstrap** for UUID-bound seeds | Still needs seed scripts |

**Required companion to P1**

1. Repair `harbaugh-forms-dev` history (B1).  
2. Production bootstrap: create Lee Auth user **with pinned UUID** `e26c8f57-c0aa-4474-b43e-6e15f0260e99` via Admin API **or** replace UUID-bound seed steps with email lookup scripts (Lee decision B2).  
3. After migrations, copy Storage Global PDFs (B3).  
4. Do **not** copy packets, Yahoo user, Test org, generated-documents.

Do **not** squash or rewrite historical migrations in this phase.

---

## Seed Data Classification

| Class | Dataset | Approx. counts / evidence | Production |
|---|---|---|---|
| **SD1** | Global forms + fields + mappings + field_resolvers catalog | 19 ACTIVE GLOBAL forms; ~869 ACTIVE mappings; fields catalog via TXR migrations; 19 PDFs under `global/forms/{id}/…` | **Seed via migrations + PDF copy** |
| **SD1** | Collection templates (Organization) | 5 ACTIVE collections (DGR-linked) | Seed org collections after org exists; verify vs GLOBAL→ORG migration |
| **SD2** | Davey Goosmann Realty org + Lee profile + membership + brokerage_settings | 1 ACTIVE org; 1 brokerage row; Lee ADMIN | Recreate after Auth; exclude Test org |
| **SD3** | Lee Personal defaults | 56 all-forms + 41 form-specific ACTIVE PRIVATE | **Re-seed via deterministic script or UI after Auth** (field IDs stable if migrations preserve UUIDs) |
| **SD3** | Organization defaults | 4 ACTIVE ORGANIZATION (incl. Broker Bay) | Re-seed after org id known |
| **SD4** | Yahoo test user + any Yahoo-owned rows | 1 Auth user | **Exclude** |
| **SD4** | Test org | INACTIVE | **Exclude** |
| **SD4/SD5** | Packets / packet_forms / field_instances | 17 / 64 / 1501 | **Exclude** |
| **SD4/SD5** | Contacts / properties | 14 / 16 | **Exclude** |
| **SD4/SD5** | Representation agreements / buyer_rep_details | 2 / 1 | **Exclude** (empty Buyer Rep workflow OK) |
| **SD4/SD5** | `generated-documents` objects | 104 files ~42 MB | **Exclude** |
| **U** | Whether Dee Davey production Auth is required at launch | Not present as separate Auth user today | Lee decision |

Private defaults on Yahoo: **0** ACTIVE (all 97 PRIVATE belong to Lee).

---

## Storage Inventory

| Bucket | Public? | Objects | Bytes | Classification |
|---|---|---:|---:|---|
| `form-templates` | Private | 38 | ~11.1 MB | Mix: **19** `global/forms/…` = required production assets; remainder may be legacy/user paths — inventory before copy |
| `generated-documents` | Private | 104 | ~42.3 MB | Generated / packet output — **do not copy** |

**Canonical Global PDFs present (required production assets):**

`global/forms/1` … `18`, `23` (Buyer Rep, inspection, IABS, minerals, TRID, wire fraud, Listing, HOA request, lead paint, T-47, 1-4 contract, HOA addendum, listing/contract amendments, lease listing, lease amendment, financing, residential lease, condo listing addendum).

**How production should receive PDFs**

1. Prefer **scripted storage copy** from `harbaugh-forms-dev` → production using service role (list `global/forms/**` only).  
2. Fallback: Admin UI upload after Global forms rows exist.  
3. Do not rely on Git (PDFs not versioned as binaries in migrations).

Policies: Phase C path helpers (`storage_is_global_form_path`, own-user paths). Recreated by migrations.

---

## Authentication and User Provisioning

| Topic | Current | Production |
|---|---|---|
| Public signup | Disabled (invitation-only UI; no `signUp` in client) | Keep disabled |
| Invite flow | App Admin + `SUPABASE_SECRET_KEY` → `inviteUserByEmail` | Same |
| Password reset | `forgot-password-form` → `/auth/update-password` | Works once Site URL/redirects set |
| OAuth | None in app | None for launch |
| App admin | `profiles.app_role = ADMIN` + `requireAppAdmin()` server guard | Seed Lee as ADMIN |
| Org admin | `organization_members.role` | Lee ORG_ADMIN on DGR |

### Recommended production sequence

1. Create production Supabase project (region `us-east-1`).  
2. Apply full migration chain (after B2 strategy).  
3. Create Lee Auth user (pin UUID **or** adaptive seed).  
4. Ensure profile row + `app_role=ADMIN` + primary org.  
5. Ensure Davey Goosmann Realty org + ACTIVE membership (ORG_ADMIN).  
6. Ensure `brokerage_settings` ACTIVE profile row (real production values).  
7. Seed SD3 defaults (Personal + Organization) via script keyed by **field UUID** + new user/org ids.  
8. Copy Global PDFs.  
9. Optionally invite Dee Davey later (SMTP readiness).  
10. Never create Yahoo or Test org in production.

---

## Scoped Defaults

| Scope | Kind | Count | Class |
|---|---|---:|---|
| PRIVATE (Lee) | all-forms | 56 | SD3 |
| PRIVATE (Lee) | form-specific | 41 | SD3 |
| ORGANIZATION | all-forms | 4 | SD3 |
| Yahoo | — | 0 | — |

Production seed must **not** hard-code development Auth UUID unless UUID pinning is chosen. Prefer export of `(field_id, form_id, scope, values)` from dev and re-insert with production `owner_user_id` / `organization_id`.

UI recreation of defaults is acceptable but error-prone for 101 rows — script preferred.

---

## Global Forms and Templates

| Item | State | Production |
|---|---|---|
| ACTIVE GLOBAL forms | 19 | Required at launch |
| DELETED GLOBAL | 1 | Skip |
| PRIVATE forms | 1 ACTIVE | Exclude unless Lee needs it |
| Mappings | 869 ACTIVE | Via migrations |
| Field IDs | Stable UUIDs in migration seeds | Keep for defaults FK |
| Packet/collection templates | Org collections ACTIVE | Seed after org |
| User-owned PDFs | Possible under non-global paths | Exclude |

---

## Data Exclusion Plan

**Do not migrate:** packets, packet_forms, field_instances, contacts, properties, agreements/details rows, Yahoo Auth user, Test org, `generated-documents/**`, soft-deleted historical junk, OPENAI key.

**Carry only:** Global catalog (migrations), Global PDFs (copy), DGR org + Lee admin + brokerage profile + approved defaults (seed).

---

## URL and Redirect Changes

| Location | Current | Production need |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Missing locally; fallback localhost | `https://forms.harbaughrealestate.com` |
| `app/layout.tsx` metadata | `VERCEL_URL` or localhost | OK with Vercel + custom domain |
| Supabase Auth Site URL | Dev settings | Production domain |
| Redirect allow list | localhost patterns in README | `https://forms.harbaughrealestate.com/**`, `https://*.vercel.app/**` during cutover |
| Password reset `redirectTo` | `window.location.origin` | OK if domain correct |
| Invite `redirectTo` | Uses `NEXT_PUBLIC_SITE_URL` | Must be set in Production |
| Hard-coded `harbaughrealestate.com` / forms subdomain | **None in app code** | Add only via env + DNS |
| README / tutorial starter kit Vercel demo links | Cosmetic | Ignore for runtime |

---

## Email Readiness

| Use case | Requirement | Class |
|---|---|---|
| Lee-only login (password already set / magic link) | Supabase Auth email may send resets | **Optional** if password set manually |
| Lee password reset | Built-in email sufficient for initial | Acceptable for Lee-only |
| Invite Dee Davey / other users | Reliable deliverability + branded sender | **Required before outside invites** — custom SMTP recommended |
| Confirmation | Align with invite-only (prefer invite links over open confirm) | Configure with signup disabled |

Classify: custom SMTP = **required before inviting other users**; not required for Lee-only smoke.

---

## Security Findings

| Finding | Level | Notes |
|---|---|---|
| Service role only via `createAdminClient` / server admin paths | Acceptable | Not in `NEXT_PUBLIC_*`; tests assert this |
| Public signup disabled | Acceptable | Invitation-only |
| RLS Phase C on DB + storage | Acceptable for Lee-only | Continue monitoring isolation |
| `npm audit`: Next advisories + sharp high | **Important soon** / blocker before public users | Upgrade `next` (e.g. 16.2.11+) and sharp before inviting outsiders |
| Orphan `OPENAI_API_KEY` in local env | Informational | Omit from Vercel |
| Migration history drift | **Blocker (B1)** | Process integrity |
| Dashboard Auth/SMTP settings unread | Unresolved env | Verify before go-live |
| Source maps / error detail | Informational | Prefer default Vercel production settings |
| File upload | PDF mime + size limits on buckets | Keep |

No evidence of service-role key in client bundles from source review.

---

## Operational Readiness

| Topic | State | Trigger to upgrade / act |
|---|---|---|
| Error tracking | None dedicated (console / Vercel logs) | Add Sentry (or similar) when second user or first paid client packet |
| Backups / PITR | Supabase plan-dependent (not inspected) | Enable PITR when production holds real transactions |
| Free tier | Likely OK for Lee-only low volume | Exceed Auth MAU, DB size, storage, or egress limits |
| Vercel | Hobby OK for Lee-only | Team/Pro if commercial SLA needed |
| SSL | Automatic on Vercel custom domain | After DNS |
| Rollback deploy | Instant prior Vercel deployment | Always keep previous Production |
| Rollback DB | Restore from backup / PITR; forward-only migrations | Never edit applied migrations |
| Monitoring | Manual | Uptime check on `/` or `/auth/login` after domain live |

---

## HostPapa DNS Plan

| Step | Detail | Risk to existing site/email |
|---|---|---|
| Authority | Parent `harbaughrealestate.com` on HostPapa (per Lee) | Do not change apex A/MX unless required |
| Record | Typically **CNAME** `forms` → `cname.vercel-dns.com` (or value Vercel shows) | Subdomain-only; should **not** affect apex website or MX if only `forms` added |
| Conflict check | Confirm no existing `forms` A/CNAME/TXT before add | Lee verify in HostPapa |
| Verification | Vercel domain UI → Valid Configuration | — |
| SSL | Vercel provisions after DNS propagates | Temporary HTTP→HTTPS |
| Temporary `*.vercel.app` | Keep enabled during cutover for smoke without DNS | Remove from Auth allow-list later if desired |

Do **not** change HostPapa records until Vercel shows the exact target hostname.

---

## Recommended Production Architecture

```
GitHub main ──► Vercel Production ──► Supabase PRODUCTION
                 env: prod URL/keys
                 domain: forms.harbaughrealestate.com

PR branches ──► Vercel Preview ──► Supabase harbaugh-forms-dev
Local npm run dev ───────────────► Supabase harbaugh-forms-dev
```

TypeScript resolvers remain the automatic-source engine; no `field_resolvers` redesign required for launch.

---

## Ordered Rollout Plan

### Stage 1 — Resolve blockers
- Repair migration history on `harbaugh-forms-dev` (B1).  
- Decide UUID pin vs adaptive seed (B2).  
- Prepare PDF copy script inventory (B3).  
- Inspect Vercel project + env scopes (B4).  
- Plan Auth URLs (B5) and `NEXT_PUBLIC_SITE_URL` (B6).  
- Schedule Next/sharp upgrade before non-Lee users.

### Stage 2 — Create production Supabase project
- Name e.g. `harbaugh-forms-prod`; region `us-east-1`.  
- Save DB password + API keys securely (password manager).  
- Apply **full** migration chain with CLI (records history).  
- Configure Auth: disable public signup consistent with app; set Site URL after domain (temp Vercel URL first OK).

### Stage 3 — Seed canonical configuration
- Bootstrap Lee Auth (+ profile ADMIN).  
- Org DGR + membership + brokerage_settings.  
- Confirm Global forms/fields/mappings counts match expectations.  
- Copy `global/forms/**` PDFs.  
- Seed SD3 defaults.  
- Skip all SD4/SD5.

### Stage 4 — Configure Vercel Production
- Production env → prod Supabase + site URL + Mapbox.  
- Preview env → `harbaugh-forms-dev`.  
- Deploy `main`; smoke on `*.vercel.app` before DNS.

### Stage 5 — Custom domain
- Add domain in Vercel; create HostPapa `forms` CNAME; wait SSL.  
- Update Supabase Auth Site URL + redirects.  
- Update Mapbox URL restrictions.

### Stage 6 — Production smoke tests
Login, profile/org, Property, Client, Collection, packet create, Fill Form, PDF, storage, defaults, owner isolation, Buyer Rep, Listing collection packet, HOA, immutability on reopen.

### Stage 7 — Controlled initial use
Lee-only; one small real packet; watch Vercel/Supabase logs; keep rollback deployment ready.

---

## Rollback Plan

| Failure | Recovery |
|---|---|
| Bad Vercel deploy | Instant rollback to previous Production deployment |
| Bad domain/DNS | Remove/alter only `forms` record; apex untouched; fall back to `*.vercel.app` |
| Bad migration on new empty prod | Delete/recreate project **only if empty**; never rewrite history on shared prod with data |
| Bad seed data | Soft-delete rows; re-run seed; do not copy from generated-documents |
| Data corruption after real use | Supabase backup/PITR restore to timestamp; communicate downtime |

---

## Lee Decisions Required

1. **Auth UUID strategy:** Pin Lee’s production Auth id to development UUID `e26c8f57-…` for migration compatibility, **or** adaptive seed scripts by email (recommended long-term hygiene: adaptive).  
2. **Defaults carry-over:** Confirm all 56+41 Personal + 4 Organization defaults are approved for production (or provide exclusion list).  
3. **Dee Davey at launch?** Invite now vs later (drives SMTP urgency).  
4. **Vercel account/project confirmation** and whether a project already exists for this repo.  
5. **HostPapa:** Confirm no existing `forms` DNS record; approve CNAME when Vercel provides target.  
6. **PDF copy method preference:** scripted storage copy vs manual Admin upload.  
7. **Error tracking:** defer vs add before first real client packet.  
8. **Next.js upgrade timing:** before Lee-only smoke vs before any invite.

---

## Detailed checklist table

| Item | Current state | Production requirement | Source of truth | Action | Blocker | Owner | Verification |
|---|---|---|---|---|---|---|---|
| Repo `main` | `a883898…` clean | Same base for deploy | Git | None | — | — | `git rev-parse` |
| Supabase projects | Only `harbaugh-forms-dev` | Add prod project | CLI `projects list` | Create later | — | Lee | `projects list` shows two |
| Migration history | Drift on 3 versions | Intact on both projects | `schema_migrations` | Repair dev; push prod cleanly | B1 | Lee | `migration list` |
| Env vars | Local 5 names; no site URL | Prod+Preview scopes | Vercel + `.env.local` | Configure | B4/B6 | Lee | Login + invite link host |
| Global PDFs | 19 in storage | Same in prod bucket | Storage | Copy script | B3 | Lee | Forms open in Map Fields |
| Defaults | 101 ACTIVE Lee/Org | Recreated | `field_defaults` | Seed | B2 | Lee | Map Fields labels |
| Packets | 17 on dev | **Only packets 2 and 5** at launch | DB | Selective copy per manifest | — | Lee confirm C4 | Count 2; fingerprints match |
| Domain | Not configured | `forms.harbaughrealestate.com` | Vercel+HostPapa | DNS later | — | Lee | SSL valid |
| Email SMTP | Unknown | Built-in then custom | Dashboard | Configure | Invite gate | Lee | Invite received |
| npm audit | Next/sharp issues | Patched before public | npm | Upgrade | Important | Lee | `npm audit` clean |

---

## Data integrity (this audit)

- No code changes  
- No commits / branches / PRs  
- No database writes  
- No storage changes  
- No Auth / Vercel / DNS / env edits  
- Review artifacts only: `PRODUCTION_READINESS_AUDIT.md`, `SELECTIVE_PRODUCTION_DATA_MIGRATION_AUDIT.md`, `PRODUCTION_DATA_SELECTION_MANIFEST.json` (plus local `_audit_tmp/` inventory helpers)

## Repository state

- Branch: `main`  
- HEAD: `a883898a380937457e863dc3eb09244f0a54f6a2`  
- Matches `origin/main`  
- Working tree: clean except untracked/modified audit and manifest artifacts  

