# TXR-1908 — Production Field Implementation

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **30** |
| Stable identity | `form_code=TXR-1908`, `version_label=TXR-1908-12-05-2011`, `form_family_key=TXR-1908` |
| Title | ADDENDUM FOR SALE OF OTHER PROPERTY BY BUYER |
| Revision | 12-05-2011 (TREC No. 10-6) |
| Status / publication | **ACTIVE** + **DRAFT** |
| Scope | GLOBAL |

---

## PDF

| Item | Value |
|------|-------|
| Storage path | `global/forms/30/AddendumForSaleOfOtherProperty.pdf` |
| Bytes | 474441 |
| MD5 | `5ca87c9dae9326867f00b22380a6c175` |
| SHA-256 | `29e909d8623b072d79fb6a01cc7cca2ed33157473e18f1a3b90312450245ef05` |
| Pages | 1 |
| AcroForm fields | 0 |

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **5** |
| Reused Global fields | **1** (`PROPERTY_FULL_ADDRESS` — subject Property only) |
| New Global fields | **4** |
| Text widgets | **3** |
| Date widgets | **1** |
| Number widgets | **1** |
| Automatic sources | **1** |
| manual_only | **4** |

---

## New field keys

1. `txr_1908_buyer_other_property_address` — Buyer's other property (not subject Property)
2. `txr_1908_contingency_date`
3. `txr_1908_waiver_days_after_notice`
4. `txr_1908_additional_earnest_money`

---

## Excluded

Buyer/Seller signature lines.

---

## Notes

- Buyer's other-property address is a distinct legal blank; deliberately **not** mapped to `PROPERTY_FULL_ADDRESS`.
- Form remains ACTIVE + DRAFT. Map Fields: `/forms/30/editor`
