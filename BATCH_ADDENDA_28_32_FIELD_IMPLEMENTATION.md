# Batch Addenda Forms 28–32 — Production Field Implementation Summary

**Date:** 2026-07-26  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)  
**Branch:** `main` @ `96e3e301bbdacf78b763667167907c92f55fce91` (matched `origin/main`; tracked tree clean)

Per-form audits: `TXR_1948_FIELD_IMPLEMENTATION.md`, `TXR_1909_FIELD_IMPLEMENTATION.md`, `TXR_1908_FIELD_IMPLEMENTATION.md`, `TXR_1954_FIELD_IMPLEMENTATION.md`, `TXR_1953_FIELD_IMPLEMENTATION.md`.

---

## Forms processed

| ID | Code | Version | Title | Pages | Maps | New fields | Reuse |
|---:|------|---------|-------|------:|-----:|-----------:|------:|
| 28 | TXR-1948 | TXR-1948-11-15-2018 | ADDENDUM CONCERNING RIGHT TO TERMINATE DUE TO LENDER'S APPRAISAL | 1 | 7 | 6 | 1 |
| 29 | TXR-1909 | TXR-1909-05-04-2026 | ADDENDUM FOR "BACK-UP" CONTRACT | 2 | 7 | 5 | 1* |
| 30 | TXR-1908 | TXR-1908-12-05-2011 | ADDENDUM FOR SALE OF OTHER PROPERTY BY BUYER | 1 | 5 | 4 | 1 |
| 31 | TXR-1954 | TXR-1954-11-07-2022 | ADDENDUM REGARDING FIXTURE LEASES | 1 | 20 | 19 | 1 |
| 32 | TXR-1953 | TXR-1953-11-07-2022 | ADDENDUM REGARDING RESIDENTIAL LEASES | 1 | 9 | 8 | 1 |

\* Form 29 maps `PROPERTY_FULL_ADDRESS` on pages 1 and 2 (same field, two mappings).

**Skipped / conflicted:** none. All five were GLOBAL + ACTIVE + DRAFT with zero prior ACTIVE mappings.

---

## PDF checksums

| ID | Path | Bytes | MD5 |
|---:|------|------:|-----|
| 28 | `global/forms/28/AddendumConcerningRIghtToTerminateDueToLenderAppraisal.pdf` | 767837 | `ae62ee5b9c18e849347f64a32aa419fb` |
| 29 | `global/forms/29/AddendumForBackupContract.pdf` | 70644 | `59b70dcb2c46aeb810bdd74c479d8077` |
| 30 | `global/forms/30/AddendumForSaleOfOtherProperty.pdf` | 474441 | `5ca87c9dae9326867f00b22380a6c175` |
| 31 | `global/forms/31/AddendumRegardingFixtureLeases.pdf` | 116737 | `dd4f0fa73b0b8dfc8087c46c8a015464` |
| 32 | `global/forms/32/AddendumRegardingResidentialLeases.pdf` | 99950 | `efe9ad9847c8ad221e973f47c8229eeb` |

All PDFs unchanged (path/size/checksum/pages). No Storage rewrites.

---

## Batch totals

| Metric | Count |
|--------|------:|
| Forms successfully processed | **5** |
| Forms skipped | **0** |
| Total ACTIVE mappings created | **48** |
| Unique Global fields reused | **1** (`PROPERTY_FULL_ADDRESS`) |
| Total new Global fields | **42** |
| Aggregate automatic source mappings | **6** |
| Aggregate custom resolvers | **0** |
| Aggregate manual_only mappings | **42** |
| Aggregate widgets (by mapping) | text **18** · checkbox **23** · number **4** · date **3** |

Currency amounts use `field_widget_type=text` + `field_data_type=currency` (catalog convention).

---

## New field keys by form

**TXR-1948:** `txr_1948_waiver`, `txr_1948_partial_waiver`, `txr_1948_partial_waiver_opinion_value`, `txr_1948_additional_right`, `txr_1948_terminate_within_days`, `txr_1948_appraised_value_less_than`

**TXR-1909:** `txr_1909_additional_earnest_money`, `txr_1909_additional_option_fee`, `txr_1909_delivery_days`, `txr_1909_first_contract_date`, `txr_1909_first_contract_terminate_by`

**TXR-1908:** `txr_1908_buyer_other_property_address`, `txr_1908_contingency_date`, `txr_1908_waiver_days_after_notice`, `txr_1908_additional_earnest_money`

**TXR-1954:** `txr_1954_fixture_*` (5 + other description), `txr_1954_assume_*` (5 + other description + cost), `txr_1954_seller_will_remove` / `will_not_remove`, `txr_1954_leases_received` / `not_received` / `oral_leases_notice` / `oral_leases_description`

**TXR-1953:** `txr_1953_terminate_leases`, `txr_1953_assign_leases`, `txr_1953_leases_received`, `txr_1953_leases_not_received`, `txr_1953_terminate_within_days`, `txr_1953_oral_leases_notice`, `txr_1953_oral_leases_description`, `txr_1953_representation_exceptions_explain`

---

## Excluded signing fields (all forms)

Buyer/Seller signature lines; form 28 AcroForm Signature1–4; form 29 identification initials.

---

## Unresolved / intentional

- Placements approximate; Lee refines in Map Fields before Publish.
- No Personal/Organization defaults assigned.
- No shared Global metadata mutated (`PROPERTY_FULL_ADDRESS` source unchanged).
- TXR-1908 buyer-other-property address is form-specific (not subject Property).
- TXR-1953 ¶B(1)(b) “3 days” is printed, not a blank.

---

## Safety fingerprints

| Metric | Before | After |
|--------|-------:|------:|
| packets | 5 | 5 |
| packet_forms | 16 | 16 |
| field_instances | 173 | 173 |
| field_instance fingerprint | `6aed0c43…71c5d3` | unchanged |
| collections (non-DELETED) | 4 | 4 |
| ACTIVE defaults | 106 | 106 |
| published ACTIVE forms | 23 | 23 |
| unrelated ACTIVE mappings | 1269 | 1269 |
| ACTIVE fields | 909 | 951 (+42) |
| ACTIVE mappings | 1269 | 1317 (+48) |

---

## Confirmations

- All five forms remain **GLOBAL + ACTIVE + DRAFT**; **zero published**.
- Packets, packet forms, field instances, collections, defaults, and unrelated mappings untouched.
- PDFs and Storage objects outside these paths untouched.
- Lee can refine all five in Map Fields: `/forms/28/editor` … `/forms/32/editor`.
