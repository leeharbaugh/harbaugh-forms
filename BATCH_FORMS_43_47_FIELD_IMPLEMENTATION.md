# Batch Forms 43–47 — Production Field Implementation Summary

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)  
**Branch:** `main` @ `96e3e301bbdacf78b763667167907c92f55fce91` (matched `origin/main`; tracked tree clean)

Per-form audits: `TXR_1950_FIELD_IMPLEMENTATION.md`, `TXR_1420_FIELD_IMPLEMENTATION.md`, `TXR_1945_FIELD_IMPLEMENTATION.md`, `TXR_1904_FIELD_IMPLEMENTATION.md`, `TXR_2201_FIELD_IMPLEMENTATION.md`.

Visual inventories / overlays: `_audit_tmp/batch_43_47/`.

Calibration: TXR-1948 / TXR-1954 text sizing; batch 38–42 rendered-page workflow; **refined checkbox centering** (glyph/AcroForm square bounds, not fixed 12×12).

---

## Forms processed

| ID | Code | Version | Title | Pages | Visual | Maps | New | Reuse | CBs |
|---:|------|---------|-------|------:|-------:|-----:|----:|------:|---:|
| 43 | TXR-1950 | TXR-1950-08-13-2018 | Notice of Seller's Termination of Contract | 1 | 5 | 5 | 3 | 2 | 2 |
| 44 | TXR-1420 | TXR-1420-02-12-2024 | Notice to Purchaser of Special Taxing or Assessment District | 2 | 45 | 45 | 43 | 1 | 22 |
| 45 | TXR-1945 | TXR-1945-01-05-2026 | Notice of Withdrawal of Offer | 1 | 21 | 21 | 20 | 1 | 14 |
| 46 | TXR-1904 | TXR-1904-02-06-2002 | Release of Earnest Money | 1 | 14 | 14 | 11 | 3 | 0 |
| 47 | TXR-2201 | TXR-2201-01-05-2026 | Residential Leasing and Property Management Agreement | 14 | 141 | 141 | 95 | 31 | 53 |

**Skipped / conflicted:** none.

---

## PDF checksums

| ID | Path | Bytes | MD5 |
|---:|------|------:|-----|
| 43 | `global/forms/43/NoticeOfSellerTerminationOfContract.pdf` | 730130 | `de7e7ee32ddc44138eb4890b38a93cbc` |
| 44 | `global/forms/44/NoticeOfSpecialTaxingDistrict.pdf` | 142066 | `404286ea369fa8014fc347c8a8a7ca14` |
| 45 | `global/forms/45/NoticeOfWithdrawalOfOffer.pdf` | 128839 | `9a68b8317431f34dc59cd65dc375ca02` |
| 46 | `global/forms/46/ReleaseOfEarnestMoney.pdf` | 94320 | `8907de016bf73677f3a991cce5e38382` |
| 47 | `global/forms/47/ResidentialLeasingAndPropertyMgmtAgmt.pdf` | 308370 | `0b66f4eb18829af32460730184180c44` |

All PDFs unchanged. TXR-1420 AcroForm widgets used as discovery aid only (visually verified).

---

## Batch totals

| Metric | Count |
|--------|------:|
| Forms processed | **5** |
| Forms skipped | **0** |
| Total visual substantive targets | **226** |
| Total ACTIVE mappings created | **226** |
| Total checkboxes | **91** |
| Checkbox overlay severe failures (remaining) | **0** |
| Total new Global fields | **172** (3+43+20+11+95) |
| Unique reused fields | **34** |
| Unexplained targets | **0** |
| Published in batch | **0** |

Aggregate widgets (by mapping): text **121** · checkbox **91** · number **11** · date **3**.  
Sources (by mapping): automatic **34** · custom_resolver **2** · manual_only **189** · null source on 1 reused field (pre-existing; not mutated).

---

## Checkbox method

1. Detect printed square via checkbox glyph bounds (``/`❑`) or AcroForm widget rect (TXR-1420).  
2. Center mapping on square center; size ≈ printed square (+ ≤0.5–1 pt margin).  
3. Post-write overlay PNGs; validate center distance.  
4. Failures corrected before completion — remaining severe failures: **0**.

---

## Safety fingerprints

Batch start (before form 43) → after form 47:

| Metric | Before | After |
|--------|-------:|------:|
| packets | 5 | 5 |
| packet_forms | 16 | 16 |
| field_instances | 173 | 173 |
| field_instance fingerprint | `6aed0c43…71c5d3` | unchanged |
| collections (non-DELETED) | 4 | 4 |
| ACTIVE defaults | 106 | 106 |
| published ACTIVE forms | 38 | 38 |
| ACTIVE fields | 1238 | 1410 (+172) |
| ACTIVE mappings | 1881 | 2107 (+226) |
| mappings outside 43–47 | 1881 | 1881 (= 2107 − 226) |

---

## Confirmations

- All five remain **GLOBAL + ACTIVE + DRAFT**; **none published**.
- Packets, packet forms, field instances, defaults, collections, unrelated mappings, and PDFs untouched.
- No Personal/Organization defaults; no shared Global metadata mutated.
- Ready for Map Fields review: `/forms/43/editor` … `/forms/47/editor`.
