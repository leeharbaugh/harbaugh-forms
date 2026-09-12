# Batch Forms 38–42 — Production Field Implementation Summary

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  
**Development:** not modified  
**Supabase CLI link:** left on development (`ewxsxwzezhkeawnjvigx`)  
**Branch:** `main` @ `96e3e301bbdacf78b763667167907c92f55fce91` (matched `origin/main`; tracked tree clean)

Per-form audits: `TXR_1201_FIELD_IMPLEMENTATION.md`, `TXR_1409_FIELD_IMPLEMENTATION.md`, `TXR_1924_FIELD_IMPLEMENTATION.md`, `TXR_1902_FIELD_IMPLEMENTATION.md`, `TXR_2217_FIELD_IMPLEMENTATION.md`.

Visual inventories / rendered pages: `_audit_tmp/batch_38_42/`.

Calibration references: TXR-1948 (form 28) and TXR-1954 (form 31) — checkbox 12×12, text h≈14, money ~90–100, underline-anchored placement.

---

## Forms processed

| ID | Code | Version | Title | Pages | Visual | Maps | New | Reuse |
|---:|------|---------|-------|------:|-------:|-----:|----:|------:|
| 38 | TXR-1201 | TXR-1201-01-05-2026 | Farm and Ranch Listing — Exclusive Right to Sell | 12 | 151 | 151 | 56 | 83 |
| 39 | TXR-1409 | TXR-1409-08-23-2024 | Intermediary Relationship Notice | 1 | 10 | 10 | 6 | 4 |
| 40 | TXR-1924 | TXR-1924-10-10-2011 | Non-Realty Items Addendum | 1 | 3 | 3 | 2 | 1 |
| 41 | TXR-1902 | TXR-1902-02-10-2025 | Notice of Buyer's Termination of Contract | 1 | 11 | 11 | 9 | 2 |
| 42 | TXR-2217 | TXR-2217-04-13-2007 | Notice of Landlord's Intent Not to Renew | 1 | 14 | 14 | 10 | 4 |

**Skipped / conflicted:** none. All five were GLOBAL + ACTIVE + DRAFT with zero prior ACTIVE mappings.

---

## PDF checksums

| ID | Path | Bytes | MD5 |
|---:|------|------:|-----|
| 38 | `global/forms/38/FarmAndRanchListing.pdf` | 309067 | `946a778b48dfdec6d1b027a69bb2f13f` |
| 39 | `global/forms/39/IntermediaryRelationshipNotice.pdf` | 159747 | `c94176c2553d5d18b4d11b791b67f33c` |
| 40 | `global/forms/40/NonRealtyItemsAddendum.pdf` | 354396 | `892853a6d84a2aae074b8dbffefe99b0` |
| 41 | `global/forms/41/NoticeOfBuyerTerminationOfContract.pdf` | 99509 | `74fae30a1886fe8d83bcdf9e5bcf34a6` |
| 42 | `global/forms/42/NoticeOfLandlordsIntentNotRenew.pdf` | 111710 | `bfbc479700b05ba34ebdfa896fdbd050` |

All PDFs unchanged. No Storage rewrites.

---

## Batch totals

| Metric | Count |
|--------|------:|
| Forms processed | **5** |
| Forms skipped | **0** |
| Total visual substantive targets | **189** |
| Total ACTIVE mappings created | **189** |
| Unique reused Global fields (approx; overlaps across forms) | **~90** |
| Total new Global fields | **83** (56+6+2+9+10) |
| Unexplained targets | **0** |
| Published in batch | **0** |

Aggregate widgets (by mapping): text **105** · checkbox **76** · date **5** · number **3**.  
Sources: automatic **28** · custom_resolver **1** · manual_only **160**.

---

## Safety fingerprints

Captured at start of batch (before form 38) → after forms 39–42:

| Metric | Before (batch start) | After form 38 | After 39–42 |
|--------|---------------------:|--------------:|------------:|
| packets | 5 | 5 | 5 |
| packet_forms | 16 | 16 | 16 |
| field_instances | 173 | 173 | 173 |
| field_instance fingerprint | `6aed0c43…71c5d3` | unchanged | unchanged |
| collections (non-DELETED) | 4 | 4 | 4 |
| ACTIVE defaults | 106 | 106 | 106 |
| published ACTIVE forms | 33 | 33 | 33 |
| ACTIVE fields | 1155 | 1211 (+56) | 1238 (+27) |
| ACTIVE mappings | 1694 | 1845 (+151) | 1883 (+38) |
| mappings outside 38–42 | 1694 | 1694 | 1694 |

---

## Confirmations

- All five remain **GLOBAL + ACTIVE + DRAFT**; **none published**.
- Packets, packet forms, field instances, defaults, collections, unrelated mappings, and PDFs untouched.
- No Personal/Organization defaults assigned; no shared Global metadata mutated.
- Placement method: rendered-page PNGs + PDF underline/glyph extraction; TXR-1948/1954 sizing calibration.
- Lee can refine in Map Fields: `/forms/38/editor` … `/forms/42/editor`.
