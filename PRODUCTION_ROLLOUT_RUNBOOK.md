# Production Rollout Runbook

**Purpose:** Ordered checklist for creating production and applying the approved selective migration.  
**Do not start** until `prepare-selective-production-migration` is merged and Lee is ready to create the production Supabase project.

Authoritative selection: `PRODUCTION_DATA_SELECTION_MANIFEST.json`  
Plan: `SELECTIVE_PRODUCTION_DATA_MIGRATION_AUDIT.md`

## Preconditions

- [ ] `main` includes selective migration tooling
- [ ] Dev migration history clean (87 versions; repaired `20260722190000`–`20260722210000`)
- [ ] Manifest `unresolvedConflicts` is `[]`
- [ ] Forms 1–18 only; forms 21–23 excluded
- [ ] Collections 1,2,3,5 only
- [ ] Packet forms 25/26 remain DELETED in the plan

## Stage 1 — Create production Supabase

1. Create project (prefer `us-east-1`), **not** named/confused with `harbaugh-forms-dev`.
2. Record Production URL + publishable key + secret key (never commit).
3. Set Auth Site URL / redirect allow-list for `https://forms.harbaughrealestate.com/**`.

## Stage 2 — Schema

1. Link CLI to production (separate from dev), or use pooler `--db-url` against project ref `eetonalyyyssvkyfdoxh` (direct `db.<ref>.supabase.co` may fail on IPv6-only hosts).
2. Apply full migration chain (`supabase db push` / ordered apply).
3. Confirm catalog forms/fields/mappings; expect Global 1–18 from migrations (form 23 must **not** be introduced by data copy).

### Blocking dependency (Phase A)

Migration `20260713200000_phase_a_multi_user_foundation.sql` **aborts** unless Auth user UUID `e26c8f57-c0aa-4474-b43e-6e15f0260e99` already exists. Do **not** alter that historical migration.

**Required order for an empty production project:**

1. Apply migrations through `20260710170000` (safe on empty Auth).
2. Run Stage 3 Lee-only Auth import (UUID-preserving) **before** continuing.
3. Before resuming Phase A onward on an empty catalog, ensure Phase A / cleanup migrations can satisfy their data assertions (collections 1–5 with expected names including DELETED Test Packet id 4; 18 forms; approved DGR org UUID `b788f525-…`; field UUID rows referenced by later cleanup migrations). These are migration prerequisites / scaffolds, not the selective business-data import.
4. Resume `supabase db push` for `20260713200000` onward (Phase A then seeds DGR org, Lee profile/membership/agent settings; remap org/membership to approved UUIDs if Phase A minted random ids).
5. Continue Stage 4 public data / Stage 5 storage.

If push stops at Phase A with `initial admin auth user … not found`, that is expected until Auth exists — not a schema-file defect.

## Stage 3 — Auth (UUID-preserving)

```bash
# CLI must be linked to harbaugh-forms-dev (source). Credentials: .env.local + .env.production.local
npm run migrate:approved-auth -- --dry-run
npm run migrate:approved-auth -- --execute
```

Execute path copies Lee from linked source Auth via SQL into production (pooler), preserving:

- user UUID `e26c8f57-c0aa-4474-b43e-6e15f0260e99`
- identity `b1c72b22-2835-44d9-afd4-294fc21d1ca5`
- encrypted password hash
- email confirmed

**Never** create Lee under a new UUID. Target must contain only Lee at this stage. Password hashes are never logged.

## Stage 4 — Public data

```bash
npm run export:approved-production-data -- --execute --out exports/approved-production-data.json
npm run import:approved-production-data -- --dry-run
# then --execute with TARGET_* set
```

Import preserves PKs/FKs, includes packet forms 25/26 as DELETED, excludes forms 21–23 and collections 4/7/9/12/14, then resets sequences.

## Stage 5 — Storage

```bash
npm run copy:approved-storage -- --dry-run
# then --execute
```

Copies only allowlisted paths (18 Global PDFs + packet 2/5 generated docs). No bucket-wide copy. No form 21/22/23 PDFs.

## Stage 6 — Validate

```bash
npm run validate:production-migration -- --execute
```

Must pass Auth, org/profile, forms, collections, packets 2/5 fingerprints, defaults=101, storage checksums, zero orphan FKs.

## Stage 7 — Vercel / DNS (after data OK)

1. Production env → production Supabase; Preview → `harbaugh-forms-dev`
2. Set `NEXT_PUBLIC_SITE_URL=https://forms.harbaughrealestate.com`
3. Attach domain / DNS

## Condo forms

Do **not** migrate condo forms from development. After launch, Lee may manually create any desired condo listing form in production.
