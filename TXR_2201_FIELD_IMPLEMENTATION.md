# TXR-2201 — Production Field Implementation

**Date:** 2026-07-27  
**Environment:** `harbaugh-forms-prod` / `eetonalyyyssvkyfdoxh` only  

## Resolved form

| Item | Value |
|------|-------|
| Production form ID | **47** |
| Stable identity | `TXR-2201` / `TXR-2201-01-05-2026` / family `TXR-2201` |
| Title | RESIDENTIAL LEASING AND PROPERTY MANAGEMENT AGREEMENT |
| Revision | 01-05-26 |
| Status | **ACTIVE + DRAFT** |

## PDF

`global/forms/47/ResidentialLeasingAndPropertyMgmtAgmt.pdf` · **14 pages** · 308370 bytes · MD5 `0b66f4eb18829af32460730184180c44` · SHA-256 `3ac07d72c140ddf32a7dfc193969490a325680d8d7eec27d059b2b559976508f` · AcroForm 0 · unchanged

## Page-by-page reconciliation

| Page | Visual substantive | Mappings | Notes |
|-----:|-------------------:|---------:|-------|
| 1 | 29 | 29 | Parties, property, term |
| 2 | 39 | 39 | Fee summary (dense) |
| 3 | 10 | 10 | Termination / offboard fees |
| 4 | 2 | 2 | |
| 5 | 4 | 4 | |
| 6 | 1 | 1 | |
| 7 | 6 | 6 | Emergency / fund sharing |
| 8 | 5 | 5 | |
| 9 | 4 | 4 | |
| 10 | 8 | 8 | |
| 11 | 22 | 22 | Addenda A–P |
| 12 | 1 | 1 | Special provisions |
| 13 | 10 | 10 | Foreign person + capacity CBs; printed names |
| 14 | 0 | 0 | Notices only |
| **Total** | **141** | **141** | unexplained **0** |

## Counts

| Metric | Count |
|--------|------:|
| Visual substantive targets | **141** |
| ACTIVE mappings | **141** |
| Reused Global fields | **31** |
| New Global fields | **95** |
| Checkboxes | **53** |
| Widgets | text 75 · checkbox 53 · number 11 · date 2 |
| Sources | automatic 28 · custom_resolver 1 · manual_only 112 |
| Signing excluded | **32** |
| Decorative excluded | **89** |

## Checkbox placement

Glyph-centered via `checkboxFromGlyph` (actual glyph size, typically ~9–11 pt). Severe center-distance failures: **0**. Overlays written for pages 1–13 (`form-47-overlay-final-pNN.png`).

## Multiline decisions

Owner additional contact, property address, legal description, non-realty items, fee “other” narratives, special provisions, offboard other — substantial-first or short-first per inventory notes in `form-47-visual-inventory.md`.

## Excluded

Owner initials every page; broker/owner signature and signing dates (p13); decorative heading rules; page 14 notice-only content.

## Confirmations

Remains ACTIVE + DRAFT; PDF unchanged; unexplained=0. Map Fields: `/forms/47/editor`
