# TXR-1948 — Production Field Implementation

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)

---

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **28** |
| Stable identity | `form_code=TXR-1948`, `version_label=TXR-1948-11-15-2018`, `form_family_key=TXR-1948` |
| Title | ADDENDUM CONCERNING RIGHT TO TERMINATE DUE TO LENDER'S APPRAISAL |
| Revision | 11-15-2018 (TREC) |
| Status / publication | **ACTIVE** + **DRAFT** (`published_at` null) |
| Scope | GLOBAL |

---

## PDF

| Item | Value |
|------|-------|
| Storage path | `global/forms/28/AddendumConcerningRIghtToTerminateDueToLenderAppraisal.pdf` |
| Bytes | 767837 |
| MD5 | `ae62ee5b9c18e849347f64a32aa419fb` |
| SHA-256 | `b819f24078dcf355df385bd362602d3f73d52b9dfa1da109cd02a4f6d139ba6d` |
| Pages | 1 |
| AcroForm fields | 11 (7 substantive + 4 signatures; signatures not mapped) |

PDF unchanged after writes.

---

## Counts

| Metric | Count |
|--------|------:|
| ACTIVE mappings | **7** |
| Reused Global fields | **1** (`PROPERTY_FULL_ADDRESS`) |
| New Global fields | **6** |
| Text widgets | **3** (address + 2 currency-as-text) |
| Checkbox widgets | **3** |
| Number widgets | **1** |
| Automatic sources | **1** |
| manual_only | **6** |

---

## New field keys

1. `txr_1948_waiver`
2. `txr_1948_partial_waiver`
3. `txr_1948_partial_waiver_opinion_value`
4. `txr_1948_additional_right`
5. `txr_1948_terminate_within_days`
6. `txr_1948_appraised_value_less_than`

Exclusivity group `txr_1948_election` noted on the three election checkboxes.

---

## Excluded

Signature1–4 (Buyer/Seller pairs).

---

## Notes

- Initial placements derived from embedded AcroForm rectangles (converted to Map Fields top-origin).
- Form remains ACTIVE + DRAFT; not published.
- Refine in Map Fields: `/forms/28/editor`
