# TXR-1954 — Production Field Implementation

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **31** |
| Stable identity | `form_code=TXR-1954`, `version_label=TXR-1954-11-07-2022`, `form_family_key=TXR-1954` |
| Title | ADDENDUM REGARDING FIXTURE LEASES |
| Revision | 11-07-2022 (TREC No. 52-1) |
| Status / publication | **ACTIVE** + **DRAFT** |
| Scope | GLOBAL |

---

## PDF

| Item | Value |
|------|-------|
| Storage path | `global/forms/31/AddendumRegardingFixtureLeases.pdf` |
| Bytes | 116737 |
| MD5 | `dd4f0fa73b0b8dfc8087c46c8a015464` |
| SHA-256 | `21356736879c3afde200d6b1ed1f722b196054fd5f546e6a697b0262a8558e85` |
| Pages | 1 |
| AcroForm fields | 0 |

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **20** |
| Reused Global fields | **1** (`PROPERTY_FULL_ADDRESS`) |
| New Global fields | **19** |
| Text widgets | **5** |
| Checkbox widgets | **15** |
| Automatic sources | **1** |
| manual_only | **19** |

---

## New field keys

**¶A fixtures:** `txr_1954_fixture_solar_panels`, `txr_1954_fixture_propane_tanks`, `txr_1954_fixture_water_softener`, `txr_1954_fixture_security_system`, `txr_1954_fixture_other`, `txr_1954_fixture_other_description`

**¶A(1) assume:** `txr_1954_assume_solar_panel_lease`, `txr_1954_assume_propane_tank_lease`, `txr_1954_assume_water_softener_lease`, `txr_1954_assume_security_system_lease`, `txr_1954_assume_other_lease`, `txr_1954_assume_other_lease_description`, `txr_1954_assume_cost_buyer_first`

**¶A(2) removal** (exclusive `txr_1954_removal`): `txr_1954_seller_will_remove`, `txr_1954_seller_will_not_remove`

**¶B delivery** (exclusive `txr_1954_delivery`): `txr_1954_leases_received`, `txr_1954_leases_not_received`, `txr_1954_oral_leases_notice`, `txr_1954_oral_leases_description`

---

## Excluded

Buyer/Seller signature lines.

---

## Notes

- Checkbox placements approximate; Lee should refine dense ¶A / ¶A(1) rows in Map Fields (`/forms/31/editor`).
- Form remains ACTIVE + DRAFT; not published.
