# TXR-1909 — Production Field Implementation

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **29** |
| Stable identity | `form_code=TXR-1909`, `version_label=TXR-1909-05-04-2026`, `form_family_key=TXR-1909` |
| Title | ADDENDUM FOR "BACK-UP" CONTRACT |
| Revision | 05-04-2026 (TREC No. 11-9) |
| Status / publication | **ACTIVE** + **DRAFT** |
| Scope | GLOBAL |

---

## PDF

| Item | Value |
|------|-------|
| Storage path | `global/forms/29/AddendumForBackupContract.pdf` |
| Bytes | 70644 |
| MD5 | `59b70dcb2c46aeb810bdd74c479d8077` |
| SHA-256 | `a6097806137bd10baec1bf96c9b793cf08a453b0f32775656f5b4580fc8a35c1` |
| Pages | 2 |
| AcroForm fields | 0 |

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **7** |
| Reused Global fields | **1** (`PROPERTY_FULL_ADDRESS` ×2 pages) |
| New Global fields | **5** |
| Text widgets | **4** (2 address + 2 currency-as-text) |
| Number widgets | **1** |
| Date widgets | **2** |
| Automatic sources | **2** (same field, two mappings) |
| manual_only | **5** |

---

## New field keys

1. `txr_1909_additional_earnest_money`
2. `txr_1909_additional_option_fee`
3. `txr_1909_delivery_days`
4. `txr_1909_first_contract_date`
5. `txr_1909_first_contract_terminate_by`

---

## Excluded

- Initialed for identification (Buyer/Seller)
- Buyer/Seller signature lines (page 2)

---

## Notes

- ¶G/¶H printed as `____, 20____`; each covered by one date widget spanning both blanks.
- Form remains ACTIVE + DRAFT. Map Fields: `/forms/29/editor`
