# TXR-2004 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified · CLI left on development

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **35** |
| Stable identity | `TXR-2004` / `TXR-2004-01-05-2026` / family `TXR-2004` |
| Title | ANIMAL AGREEMENT |
| Revision | 01-05-2026 |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/35/AnimalAgreement.pdf` · 3 pages · 192724 bytes · MD5 `e0b91b38213e7472d5ff32a5089a9a80` · SHA-256 `488af92987f458a16e8d454b122b77d3bc8bfe25beee01f8beb15a340f19cd50` · AcroForm 0 · unchanged

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **70** |
| Reused | **1** (`PROPERTY_FULL_ADDRESS` ×3 pages) |
| New | **67** |
| Widgets | text 37 · checkbox 31 · date 2 |
| Sources | automatic 3 · manual_only 67 |

**Animals 1–4** each have: type, breed, name, color, weight, age, gender, spayed yes/no, rabies yes/no, assistance yes/no (`txr_2004_animal_N_*`).

**Consideration / disclosure / provisions:** `txr_2004_animal_deposit_*`, `txr_2004_monthly_fee_*`, `txr_2004_nonrefundable_fee_*`, `txr_2004_bitten_*`, `txr_2004_propensity_*`, `txr_2004_special_provisions`

## Excluded / notes

- Landlord/Tenant signature blocks and footer initials excluded.
- Lease-catalog animal fee fields not reused (different semantic context than this addendum).
- Map Fields: `/forms/35/editor`
