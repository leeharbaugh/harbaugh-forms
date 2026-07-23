# Selective Production Data Migration Audit

**Finalized:** 2026-07-22  
**Branch intent:** `prepare-selective-production-migration`  
**Source:** `harbaugh-forms-dev` (`ewxsxwzezhkeawnjvigx`)  
**Companion:** `PRODUCTION_DATA_SELECTION_MANIFEST.json`  
**Repository selection HEAD:** `a883898a380937457e863dc3eb09244f0a54f6a2`

## Lee’s final decisions (authoritative)

> Forms 21, 22, and 23 are excluded from production. Lee will manually create any desired condo listing form after launch.

> Only forms 1–18 migrate.

> Soft-deleted collections 4, 9, 12, and 14 are excluded, along with test collection 7.

> Collections 1, 2, 3, and 5 migrate.

> Packet 2 retains DELETED packet forms 25 and 26 and their historical field instances.

No form-23 lineage null transform — form 23 is excluded entirely.

`unresolvedConflicts`: **[]** (empty). Packets 2/5 and collections 1/2/3/5 do not depend on forms 21–23.

## Approved set (exact)

| Area | Include | Exclude |
|---|---|---|
| Auth | Lee `e26c8f57-…` + identity `b1c72b22-…` | Yahoo Auth |
| Org | DGR `b788f525-…`, membership `bbeff129-…` | Test org |
| Contacts | 2, 3, 4, 6 | all others |
| Properties | 1, 3 | all others (+ no HOAs required) |
| Packets | 2, 5 | all others |
| Packet forms | 7–12, **25, 26 (DELETED)**, 27–30 | others |
| Forms | **1–18** | **21, 22, 23** |
| Collections | **1, 2, 3, 5** | **4, 7, 9, 12, 14** |
| Defaults | **101** ACTIVE | Yahoo / DELETED / none on 21–23 |

### Defaults recalculation

No ACTIVE defaults are scoped to forms 21, 22, or 23.

| Category | Count |
|---|---:|
| Lee Personal all-forms | 56 |
| Lee Personal form-specific (forms 1,7,11,15,18) | 41 |
| DGR Organization all-forms | 4 |
| **Total approved** | **101** |

## Packet fingerprints

| Packet | Field instances | Overrides | Notes |
|---|---:|---:|---|
| 2 | 65 | 0 | Includes DELETED forms 25 (form 9) and 26 (external `form_id=null`) |
| 5 | 107 | 16 | Contacts 4 + 6; forms 27–30 |

SHA-256 payloads are recorded in the manifest `packetFingerprints` section.

## Storage allowlist

| Include | Count |
|---|---:|
| `global/forms/{1–18}/**` | 18 |
| `generated-documents` for packets 2 and 5 (incl. 25/26) | 12 |
| **Total** | **30** |

Exclude: form 21/22/23 PDFs, Yahoo paths, all other generated documents, optional legacy `TXR-*` roots.

## Migration-history repair (dev)

Postconditions proven before repair:

- `listing_agreement_details` dropped
- brokerage `default_*` columns = 0
- fields with `packet`/`static_default` source_type = 0
- field_instances = **1501**
- packet 2/5 FI counts 65 / 107

Command:

```bash
npx supabase migration repair --status applied --linked 20260722190000 20260722200000 20260722210000 --yes
```

Result: local ↔ remote histories match (**87** versions, each once). Business data unchanged after repair.

## Tooling (not executed against production)

| Script | Purpose |
|---|---|
| `scripts/migrate-approved-auth.ts` | Lee-only Auth UUID/identity/password-hash preserve; dry-run; refuses replacement UUID |
| `scripts/export-approved-production-data.ts` | Manifest-driven export |
| `scripts/import-approved-production-data.ts` | FK-ordered import + sequence resets; source≠target; no silent ownership remap |
| `scripts/copy-approved-storage.ts` | Allowlist-only storage copy |
| `scripts/validate-production-migration.ts` | Post-migration assertions |

Library: `lib/selective-production/*`  
Tests: `npm run test:selective-production`

## Next manual step after merge

Create the production Supabase project (same region preferred), then run dry-run tooling with distinct `SOURCE_*` / `TARGET_*` credentials. Do not point target at `harbaugh-forms-dev`.
